import { WebSocket } from 'ws';

// ── Event bus ──

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
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface GatewayStatus {
  status: ConnectionStatus;
  health: HealthStatus;
  connectedAt: number | null;
  lastHealthCheck: number | null;
  lastHealthOk: boolean;
  consecutiveHealthFailures: number;
  gatewayVersion: string | null;
  gatewayHost: string | null;
  agents: number;
}

type StatusListener = (status: GatewayStatus) => void;

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const createRequestId = () => `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const HEALTH_POLL_INTERVAL_MS = 30_000;
const HEALTH_FAILURE_THRESHOLD = 3;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60_000;

// ── Client ──

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventBus = new EventBus();
  private wsUrl: string;
  private password: string | undefined;
  private requestTimeoutMs: number;

  private _status: ConnectionStatus = 'disconnected';
  private _health: HealthStatus = 'unhealthy';
  private _connectedAt: number | null = null;
  private _lastHealthCheck: number | null = null;
  private _lastHealthOk = false;
  private _consecutiveHealthFailures = 0;
  private _gatewayVersion: string | null = null;
  private _gatewayHost: string | null = null;
  private _agentCount = 0;

  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private healthTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private started = false;

  private listeners = new Set<StatusListener>();

  constructor() {
    this.wsUrl = process.env.OPENCLAW_WS_URL ?? 'ws://127.0.0.1:18789';
    this.password = process.env.OPENCLAW_PASSWORD;
    this.requestTimeoutMs = Number(process.env.OPENCLAW_REQUEST_TIMEOUT ?? '15000');
  }

  // ── Config ──

  configure(options: { wsUrl?: string; password?: string; requestTimeoutMs?: number }) {
    if (options.wsUrl) this.wsUrl = options.wsUrl;
    if (options.password !== undefined) this.password = options.password;
    if (options.requestTimeoutMs !== undefined) this.requestTimeoutMs = options.requestTimeoutMs;
  }

  // ── Status ──

  getConnectionStatus(): GatewayStatus {
    return {
      status: this._status,
      health: this._health,
      connectedAt: this._connectedAt,
      lastHealthCheck: this._lastHealthCheck,
      lastHealthOk: this._lastHealthOk,
      consecutiveHealthFailures: this._consecutiveHealthFailures,
      gatewayVersion: this._gatewayVersion,
      gatewayHost: this._gatewayHost,
      agents: this._agentCount,
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Status listeners ──

  onStatusChange(fn: StatusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private broadcastStatus() {
    const status = this.getConnectionStatus();
    for (const fn of this.listeners) {
      try { fn(status); } catch { /* consumer error */ }
    }
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
    this.stopKeepAlive();
    this.disconnect();
  }

  // ── Connect ──

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connectPromise) return this.connectPromise;

    this.setStatus(this._status === 'reconnecting' ? 'reconnecting' : 'connecting');
    this.broadcastStatus();

    this.connectPromise = this.doConnect()
      .then(() => {
        this.connectPromise = null;
      })
      .catch((err) => {
        this.connectPromise = null;
        this.setHealth('unhealthy');
        this.setStatus('disconnected');
        this.broadcastStatus();
        throw err;
      });

    return this.connectPromise;
  }

  private async doConnect(): Promise<void> {
    await this.openSocket();

    const challenge = await this.waitForChallenge(2000);
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
    this.reconnectAttempts = 0;
    this._consecutiveHealthFailures = 0;
    this._lastHealthOk = true;
    this.setHealth('healthy');
    this.setStatus('connected');
    this.broadcastStatus();
    this.startKeepAlive();
  }

  // ── WebSocket ──

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
        this.handleDisconnect('WebSocket closed');
      });

      this.ws.on('error', () => {
        // close event fires after error
      });

      // Respond to server pings (ws library auto-replies to ping frames,
      // but we listen for pong to verify the connection is alive)
      this.ws.on('pong', () => {
        // connection confirmed alive — resets internal timeout if any
      });
    });
  }

  // ── Challenge ──

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

  // ── Disconnect handler ──

  private handleDisconnect(reason: string) {
    this.ws = null;
    this.rejectAllPending(new Error(reason));
    this.stopKeepAlive();
    this.setHealth('unhealthy');
    this.setStatus('reconnecting');
    this.broadcastStatus();
    this.scheduleReconnect();
  }

  // ── Reconnect with exponential backoff ──

  private scheduleReconnect() {
    if (!this.started) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  // ── Keep-alive: health polling + WebSocket ping ──

  private startKeepAlive() {
    this.stopKeepAlive();

    // Immediate first health check
    this.checkHealth();

    // Periodic health check
    this.healthTimer = setInterval(() => this.checkHealth(), HEALTH_POLL_INTERVAL_MS);

    // WebSocket ping every 15s to detect dead connections early
    // The ws library auto-sends pings if the server expects them;
    // here we send pings and expect pongs
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch {
          this.handleDisconnect('ping failed');
        }
      }
    }, 15_000);
  }

  private stopKeepAlive() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private async checkHealth(): Promise<void> {
    if (!this.isConnected()) return;
    try {
      const result = await this.request<{
        ok?: boolean;
        status?: string;
        server?: { version?: string };
        agents?: Array<unknown>;
      }>('health');

      this._lastHealthCheck = Date.now();
      const ok = result?.ok === true || result?.status === 'ok';
      this._lastHealthOk = ok;

      if (ok) {
        this._consecutiveHealthFailures = 0;
        this.setHealth('healthy');
      } else {
        this._consecutiveHealthFailures++;
        this.setHealth('degraded');
      }

      if (result?.server?.version) {
        this._gatewayVersion = result.server.version;
      }
      if (result?.agents) {
        this._agentCount = result.agents.length;
      }

      this.broadcastStatus();
    } catch {
      this._lastHealthCheck = Date.now();
      this._lastHealthOk = false;
      this._consecutiveHealthFailures++;
      this.setHealth('degraded');
      this.broadcastStatus();

      // Trigger reconnect if health check fails repeatedly
      if (this._consecutiveHealthFailures >= HEALTH_FAILURE_THRESHOLD) {
        this.handleDisconnect(`${HEALTH_FAILURE_THRESHOLD} consecutive health checks failed`);
      }
    }
  }

  // ── Disconnect ──

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopKeepAlive();
    this.ws?.close();
    this.ws = null;
    this._connectedAt = null;
    this._gatewayVersion = null;
    this._agentCount = 0;
    this._consecutiveHealthFailures = 0;
    this.setHealth('unhealthy');
    this.setStatus('disconnected');
    this.broadcastStatus();
    this.rejectAllPending(new Error('Client disconnected'));
    this.eventBus.clear();
  }

  // ── Internal ──

  private setStatus(status: ConnectionStatus) {
    this._status = status;
  }

  private setHealth(health: HealthStatus) {
    this._health = health;
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
