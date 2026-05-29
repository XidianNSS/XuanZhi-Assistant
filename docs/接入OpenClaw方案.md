# demo-Project 连接 WSL OpenClaw 实施方案

> 基于玄知助手设计文档 v2.0 架构规划

---

## 一、当前架构

```
用户输入 → 前端(React) → HTTP :3000 → Fastify 后端
                                         ├── messageService
                                         │   └── runMockAgent (模拟执行)
                                         ├── MemoryStore (内存)
                                         └── StreamHub (SSE 推送)
```

Mock Agent 是硬编码的模拟流程，不具备真实 AI 能力。

## 二、目标架构

```
用户输入 → 前端(React) → HTTP :3000 → Fastify 后端
                                         ├── messageService
                                         │   └── OpenClawClient (新增)
                                         │       └── WebSocket RPC
                                         │           └── ws://127.0.0.1:18789
                                         │               └── OpenClaw Gateway (WSL)
                                         │                   ├── Agent 执行
                                         │                   └── xuanzhi-artifacts 插件
                                         │                       └── HTTP 回调
                                         │                           └── XuanZhi API (:3000)
                                         ├── MemoryStore (内存)
                                         └── StreamHub (SSE 推送)
```

OpenClaw Agent 执行任务后，通过 `xuanzhi-artifacts` 插件回调 XuanZhi API，写入 event/artifact/approval 并通过 SSE 推送给前端。前端体验不变。

---

## 三、详细改动

### 3.1 新增文件：`apps/api/src/agents/openclawClient.ts`

创建 Node.js WebSocket 客户端，用于连接 OpenClaw Gateway。

```typescript
// apps/api/src/agents/openclawClient.ts

import { WebSocket } from 'ws';

// ── 类型定义 ──

interface OpenClawConfig {
  wsUrl: string;
  password?: string;
  requestTimeoutMs: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

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

// ── OpenClaw RPC 客户端 ──

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private config: OpenClawConfig;
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<OpenClawConfig> = {}) {
    this.config = {
      wsUrl: config.wsUrl ?? process.env.OPENCLAW_WS_URL ?? 'ws://127.0.0.1:18789',
      password: config.password ?? process.env.OPENCLAW_PASSWORD,
      requestTimeoutMs: config.requestTimeoutMs ?? 15000,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);
      } catch (err) {
        this.connectPromise = null;
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        this.ws?.close();
        this.connectPromise = null;
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        // 等待 connect.challenge 或直接发送 connect
        this.waitForChallengeOrConnect()
          .then(() => {
            this.connected = true;
            this.connectPromise = null;
            resolve();
          })
          .catch(reject);
      });

      this.ws.on('message', (raw: Buffer) => {
        this.onMessage(raw.toString());
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        this.rejectAllPending(new Error('WebSocket closed'));
        this.connectPromise = null;
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        this.connectPromise = null;
        reject(err);
      });
    });

    return this.connectPromise;
  }

  private waitForChallengeOrConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const challengeTimeout = setTimeout(() => {
        // 没有收到 challenge，直接尝试 connect
        this.sendConnect().then(resolve).catch(reject);
      }, 2000);

      const messageHandler = (raw: Buffer) => {
        const text = raw.toString();
        let frame: unknown;
        try {
          frame = JSON.parse(text);
        } catch {
          return;
        }
        const f = frame as GatewayFrame;
        if (f.type === 'event' && (f as GatewayEventFrame).event === 'connect.challenge') {
          clearTimeout(challengeTimeout);
          this.ws?.removeListener('message', messageHandler);
          this.sendConnect().then(resolve).catch(reject);
        }
      };

      this.ws?.on('message', messageHandler);
    });
  }

  private async sendConnect(): Promise<void> {
    return this.request('connect', {
      minProtocol: 4,
      maxProtocol: 4,
      client: {
        id: 'gateway-client',
        version: '1.0.0',
        platform: 'linux',
        mode: 'backend',
        instanceId: `xuanzhi-api-${Date.now()}`,
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      auth: this.config.password ? { password: this.config.password } : undefined,
    }) as Promise<unknown> as Promise<void>;
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureConnected();

    const id = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${method} timed out after ${this.config.requestTimeoutMs}ms`));
      }, this.config.requestTimeoutMs);

      this.pending.set(id, {
        resolve: (payload) => resolve(payload as T),
        reject,
        timer,
      });

      const frame: GatewayReqFrame = { type: 'req', id, method, params };
      this.ws?.send(JSON.stringify(frame));
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    await this.connect();
  }

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
    }
    // event 帧由上层通过事件监听处理，此处暂不处理
  }

  private rejectAllPending(error: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, 5000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// ── 单例 ──
let instance: OpenClawClient | null = null;

export function getOpenClawClient(): OpenClawClient {
  if (!instance) {
    instance = new OpenClawClient();
  }
  return instance;
}
```

### 3.2 新增文件：`apps/api/src/agents/agentRunner.ts`

将消息发送到 OpenClaw Agent 执行的核心逻辑。

```typescript
// apps/api/src/agents/agentRunner.ts

import type { Task } from '@xuanzhi/shared/protocol';
import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import { getOpenClawClient } from './openclawClient.js';

/**
 * 通过 OpenClaw Gateway 执行任务。
 * 替换原来的 runMockAgent。
 */
export async function runOpenClawAgent(
  task: Task,
  store: MemoryStore,
  stream: StreamHub,
): Promise<void> {
  const client = getOpenClawClient();

  // 1. 更新任务状态为 running
  const updatedTask = store.updateTaskStatus(task.id, 'running');
  if (updatedTask) {
    stream.broadcast(task.id, { type: 'task.updated', data: updatedTask });
  }

  // 2. 发送事件：任务开始执行
  const event = store.addEvent({
    userId: task.userId,
    taskId: task.id,
    type: 'task.dispatched',
    title: '任务已派发到 OpenClaw',
    message: task.userInput,
    status: 'running',
  });
  stream.broadcast(task.id, { type: 'agent.event.created', data: event });

  try {
    // 3. 通过 Gateway RPC 发送消息给 Agent
    //    使用 chat.send 方法（需要先 resolve session）
    //    或者用 agent.invoke 方法（如果有）
    const sessionKey = `agent:main:${task.id}`;
    
    // 尝试 resolve 或创建一个 session
    let session: { key: string } | undefined;
    try {
      session = await client.request<{ key: string }>('sessions.resolve', {
        key: sessionKey,
        title: task.title ?? '玄知任务',
      });
    } catch {
      // session 不存在，创建新 session
      session = await client.request<{ key: string }>('sessions.create', {
        key: sessionKey,
        title: task.title ?? '玄知任务',
      });
    }

    // 4. 发送消息给 Agent
    //    OpenClaw 通过 xuanzhi-artifacts 插件回调 XuanZhi API
    await client.request('chat.send', {
      sessionKey: session.key,
      idempotencyKey: `task-${task.id}`,
      message: task.userInput,
    });

    // 注意：实际的 event/artifact/approval 上报
    // 由 OpenClaw 中的 xuanzhi-artifacts 插件通过 HTTP 回调完成。
    // 回调会打到 XuanZhi API 的 /api/tasks/:taskId/events 等端点，
    // 这些端点会写入 store 并广播 SSE。

    // 5. 发送事件：任务已交付给 OpenClaw
    store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'agent.execution.started',
      title: 'OpenClaw 开始执行',
      status: 'running',
    });

  } catch (error) {
    // 执行失败
    const errMsg = error instanceof Error ? error.message : 'OpenClaw 执行失败';
    store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'agent.execution.failed',
      title: 'OpenClaw 执行失败',
      message: errMsg,
      status: 'failed',
    });
    store.updateTaskStatus(task.id, 'failed');
    stream.broadcast(task.id, {
      type: 'task.updated',
      data: store.getOwnedTask(task.id, task.userId),
    });
  }
}
```

### 3.3 修改文件：`apps/api/src/services/messageService.ts`

将 `runMockAgent` 替换为 `runOpenClawAgent`。

**改动内容**：

```typescript
// 修改前
import { runMockAgent } from '../agents/mockAgent.js';
// ...
if (message.role === 'user' && store.listApprovals(task.id).length === 0) {
  runMockAgent(task, store, stream);
}

// 修改后
import { getOpenClawClient } from '../agents/openclawClient.js';
import { runOpenClawAgent } from '../agents/agentRunner.js';
import { runMockAgent } from '../agents/mockAgent.js';
// ...
if (message.role === 'user' && store.listApprovals(task.id).length === 0) {
  if (getOpenClawClient().isConnected()) {
    runOpenClawAgent(task, store, stream).catch((err) => {
      console.error('OpenClaw agent execution failed:', err);
    });
  } else {
    runMockAgent(task, store, stream);
  }
}
```

### 3.4 环境变量配置（无需修改代码）

`openclawClient.ts` 直接从环境变量读取配置，`env.ts` 无需修改。可用环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENCLAW_WS_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket 地址 |
| `OPENCLAW_PASSWORD` | 无 | Gateway 连接密码（如需要） |
| `OPENCLAW_REQUEST_TIMEOUT` | `15000` | RPC 请求超时毫秒数 |

### 3.5 修改文件：`apps/api/src/services/messageService.ts`

将 `runMockAgent` 替换为 `runOpenClawAgent`，同时保留 Mock Agent 作为 OpenClaw 离线时的回退。

---

## 四、注册 xuanzhi-artifacts 插件（可延后，不影响第一步连接验证）

插件的作用：让 OpenClaw Agent 能通过 HTTP 回调 XuanZhi API 来上报 event/artifact/approval。

> 注：`openclaw` CLI 在 Windows 和 WSL 中均可使用。下列命令直接在 Windows 终端执行即可。

### 4.1 构建插件

```bash
cd plugins/xuanzhi-artifacts
pnpm install
pnpm build    # → 产出 dist/index.js
```

### 4.2 注册插件到 OpenClaw

```bash
# 将构建产物注册为 OpenClaw 插件（使用绝对路径或相对路径）
openclaw plugins add ./plugins/xuanzhi-artifacts/dist/index.js

# 确认注册成功
openclaw plugins list
```

### 4.3 配置插件回调地址（Gateway 环境变量）

插件回调需要知道 XuanZhi API 的地址。两种方式：

**方式 A：通过 OpenClaw gateway 启动时注入环境变量**

编辑 Gateway 服务配置：

```bash
openclaw config set env.XUANZHI_API_BASE_URL http://host.docker.internal:3000
openclaw config set env.XUANZHI_API_TOKEN dev-token
openclaw gateway restart
```

**方式 B：直接在 OpenClaw 配置文件中写入**

编辑 `~/.openclaw/openclaw.json`，添加：

```json5
{
  gateway: {
    port: 18789,
    // ... 已有配置
  },
  env: {
    XUANZHI_API_BASE_URL: "http://host.docker.internal:3000",
    XUANZHI_API_TOKEN: "dev-token",
  },
}
```

然后重启 Gateway：

```bash
openclaw gateway restart
```

---

## 五、需要安装的依赖

在 `apps/api` 中添加 `ws` 包（Node.js WebSocket 客户端）：

```bash
# 在项目根目录执行
pnpm --filter @xuanzhi/api add ws
pnpm --filter @xuanzhi/api add -D @types/ws
```

---

## 六、时序流程（改动后完整链路）

```
用户输入 ──→ POST /api/messages
               │
               ▼
        messageService.createMessage()
               │
               ├── 保存消息到 MemoryStore
               ├── SSE 广播 message.created
               │
               └── runOpenClawAgent()
                      │
                      ├── 更新任务状态 → running （SSE 推送）
                      ├── 发送事件 → task.dispatched（SSE 推送）
                      │
                      ├── WebSocket RPC → OpenClaw Gateway
                      │     ├── sessions.resolve（创建 session）
                      │     └── chat.send（派发任务给 Agent）
                      │
                      ├── OpenClaw Agent 执行
                      │     └── xuanzhi-artifacts 插件
                      │           ├── POST /api/tasks/:id/events
                      │           ├── POST /api/tasks/:id/artifacts
                      │           ├── POST /api/tasks/:id/approvals
                      │           └── PATCH /api/tasks/:id/status
                      │
                      └── XuanZhi API 接收回调
                            ├── 写入 MemoryStore
                            └── SSE 广播给前端
```

---

## 七、改动效果

### 连接前 vs 连接后

| 维度 | 连接前（Mock Agent） | 连接后（OpenClaw Agent） |
|------|---------------------|------------------------|
| **执行引擎** | 本地硬编码的模拟流程 | WSL 中 OpenClaw 真实 AI Agent |
| **意图理解** | 固定输出会议相关模拟数据 | 真实理解用户输入并执行 |
| **事件上报** | `runMockAgent` 直接调用 store | `xuanzhi-artifacts` 插件 HTTP 回调 |
| **可扩展性** | 改代码才能改行为 | OpenClaw 中换 Agent 即可 |
| **前端体验** | 不变 | 不变（同一套 SSE + 消息格式） |
| **回退机制** | 无 | OpenClaw 离线时自动回退 Mock |

### 成功标准

1. 用户在 XuanZhi 前端发消息 → 任务状态变为 `running`
2. OpenClaw Gateway 收到 agent 执行请求
3. `xuanzhi-artifacts` 插件回调 XuanZhi API 写入 event/artifact/approval
4. 前端通过 SSE 实时收到事件推送
5. 任务完成，状态流转正常

---

## 八、风险与注意事项

1. **Gateway 可达性**：后端的 OpenClawClient 需要能通过网络访问 OpenClaw Gateway。如果 Gateway 绑定 `127.0.0.1`，后端需与 Gateway 同机；如果绑定 `0.0.0.0`，则需确保网络和安全组放行。

2. **插件回调地址**：`xuanzhi-artifacts` 插件回调 XuanZhi API 时，需要配置 `XUANZHI_API_BASE_URL` 指向 XuanZhi 后端可访问的地址。如果 Gateway 和 XuanZhi 后端不在同一台机器上，需要使用正确的网络地址（如 `host.docker.internal`、局域网 IP 等）。

3. **SSE 兼容性**：插件回调的 event/artifact/approval 数据格式需要与前端 SSE 消费端一致，按 `packages/shared/src/protocol.ts` 中的类型发送。

4. **RPC 幂等性**：Gateway 的 `chat.send` 需要 `idempotencyKey` 参数防止重复派发，后端应使用 taskId 或 messageId 作为幂等键。

5. **OpenClaw 版本**：建议保持 OpenClaw 为较新版本，`openclaw doctor` 可用于诊断常见问题。
