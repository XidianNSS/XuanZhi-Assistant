import { WebSocket } from 'ws';

// ── Event bus (minimal, same pattern as WebUI gateway-events.ts) ──

class EventBus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  emit(event: string, payload: unknown) {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(payload); } catch { /* ignore */ }
    }
  }

  clear() {
    this.handlers.clear();
  }
}

// ── Frame types ──

interface GatewayReqFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

interface GatewayResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

interface GatewayEventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

type GatewayFrame = GatewayResFrame | GatewayEventFrame;

// ── Connection types ──

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface GatewayStatus {
  status: ConnectionStatus;
  connectedAt: number | null;
  lastHealthCheck: number | null;
  lastHealthOk: boolean;
  gatewayVersion: string | null;
  gatewayHost: string | null;
  agents: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// ── Helper ──

const createRequestId = () => `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Client ──

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventBus = new EventBus();
  private wsUrl: string;
  private password: string | undefined;
  private requestTimeoutMs: number;

  private _status: ConnectionStatus = 'disconnected';
  private _connectedAt: number | null = null;
  private _lastHealthCheck: number | null = null;
  private _lastHealthOk = false;
  private _gatewayVersion: string | null = null;
  private _gatewayHost: string | null = null;
  private _agentCount = 0;

  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor() {
    this.wsUrl = process.env.OPENCLAW_WS_URL ?? 'ws://127.0.0.1:18789';
    this.password = process.env.OPENCLAW_PASSWORD;
    this.requestTimeoutMs = Number(process.env.OPENCLAW_REQUEST_TIMEOUT ?? '15000');
  }

  // ── Public status ──

  getConnectionStatus(): GatewayStatus {
    return {
      status: this._status,
      connectedAt: this._connectedAt,
      lastHealthCheck: this._lastHealthCheck,
      lastHealthOk: this._lastHealthOk,
      gatewayVersion: this._gatewayVersion,
      gatewayHost: this._gatewayHost,
      agents: this._agentCount,
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Lifecycle ──

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.connect().catch((err) => {
      console.error('[OpenClawClient] connect failed:', err.message);
    });
  }

  stop(): void {
    this.started = false;
    this.stopHealthCheck();
    this.disconnect();
  }

  // ── Connect (WebUI pattern: openSocket → waitForChallenge → request("connect")) ──

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connectPromise) return this.connectPromise;

    this.setStatus(this._status === 'reconnecting' ? 'reconnecting' : 'connecting');

    this.connectPromise = this.doConnect()
      .then(() => {
        this.connectPromise = null;
      })
      .catch((err) => {
        this.connectPromise = null;
        this.setStatus('disconnected');
        throw err;
      });

    return this.connectPromise;
  }

  private async doConnect(): Promise<void> {
    await this.openSocket();

    // Wait up to 2s for a connect.challenge event
    const challenge = await this.waitForChallenge(2000);

    // If challenged, we'd sign here (device identity). For backend, skip signing.
    void challenge;

    const params: Record<string, unknown> = {
      minProtocol: 4,
      maxProtocol: 4,
      client: {
        id: 'gateway-client',
        version: '1.0.0',
        platform: 'node',
        mode: 'backend',
        instanceId: `xuanzhi-api-${Date.now()}`,
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write', 'operator.admin'],
    };

    if (this.password) {
      params.auth = { token: this.password };
    }

    const result = await this.request<{
      server?: { version?: string };
      snapshot?: { health?: { agents?: Array<unknown> } };
    }>('connect', params);

    this._gatewayVersion = result?.server?.version ?? null;
    this._agentCount = result?.snapshot?.health?.agents?.length ?? 0;
    this._connectedAt = Date.now();
    this.setStatus('connected');
    this.startHealthCheck();
  }

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on('message', (raw: Buffer) => {
        this.onMessage(raw.toString());
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.rejectAllPending(new Error('WebSocket closed'));
        this.stopHealthCheck();
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        // close event will fire after this
      });
    });
  }

  private waitForChallenge(timeoutMs: number): Promise<{ nonce: string; ts: number } | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const unsub = this.eventBus.on('connect.challenge', (payload: unknown) => {
        clearTimeout(timer);
        unsub();
        const p = payload as Record<string, unknown>;
        resolve({
          nonce: String(p.nonce ?? ''),
          ts: Number(p.ts ?? 0),
        });
      });
    });
  }

  // ── RPC ──

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = createRequestId();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${method} timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve: (payload) => resolve(payload as T), reject, timer });

      const frame: GatewayReqFrame = { type: 'req', id, method, params };
      this.ws?.send(JSON.stringify(frame));
    });
  }

  // ── Events ──

  on<TPayload = unknown>(event: string, handler: (payload: TPayload) => void): () => void {
    return this.eventBus.on(event, handler as (payload: unknown) => void);
  }

  // ── Message handling ──

  private onMessage(text: string) {
    let frame: unknown;
    try {
      frame = JSON.parse(text);
    } catch {
      return;
    }

    const f = frame as GatewayFrame;

    if (f.type === 'res') {
      const res = f as GatewayResFrame;
      const pending = this.pending.get(res.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        const err = res.error;
        pending.reject(new Error(err ? `${err.code}: ${err.message}` : 'RPC failed'));
      }
      return;
    }

    if (f.type === 'event') {
      const evt = f as GatewayEventFrame;
      this.eventBus.emit(evt.event, evt.payload);
    }
  }

  private rejectAllPending(error: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  // ── Reconnect ──

  private scheduleReconnect() {
    if (!this.started) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, 5000);
  }

  // ── Health check ──

  private async checkHealth(): Promise<void> {
    if (!this.isConnected()) return;
    try {
      const result = await this.request<{
        ok?: boolean;
        server?: { version?: string };
        agents?: Array<unknown>;
      }>('health');
      this._lastHealthCheck = Date.now();
      this._lastHealthOk = result?.ok ?? false;
      if (result?.server?.version) {
        this._gatewayVersion = result.server.version;
      }
      if (result?.agents) {
        this._agentCount = result.agents.length;
      }
    } catch {
      this._lastHealthCheck = Date.now();
      this._lastHealthOk = false;
    }
  }

  private startHealthCheck() {
    this.stopHealthCheck();
    this.checkHealth();
    this.healthTimer = setInterval(() => this.checkHealth(), 30000);
  }

  private stopHealthCheck() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  // ── Disconnect ──

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHealthCheck();
    this.ws?.close();
    this.ws = null;
    this._connectedAt = null;
    this._gatewayVersion = null;
    this._agentCount = 0;
    this.setStatus('disconnected');
    this.rejectAllPending(new Error('Client disconnected'));
    this.eventBus.clear();
  }

  // ── Internal ──

  private setStatus(status: ConnectionStatus) {
    this._status = status;
  }
}

// ── Singleton ──

let instance: OpenClawClient | null = null;

export function getOpenClawClient(): OpenClawClient {
  if (!instance) {
    instance = new OpenClawClient();
  }
  return instance;
}
