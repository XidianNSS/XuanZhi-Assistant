# 02. 后端实现说明

## 1. 后端职责

后端是玄知助手的状态中心。

它负责：

- 管理用户 User
- 解析登录态并生成 currentUser
- 管理任务 Task
- 保存消息 Message
- 保存执行事件 Event
- 保存中间产物 Artifact
- 保存审批 Approval
- 校验用户只能访问自己的数据
- 调用 OpenClaw Gateway
- 接收 OpenClaw 插件上报
- 通过 SSE 向有权限的前端实时推送任务过程

## 2. 技术选择

MVP 推荐：

```text
Node.js + Fastify
内存存储 Map
简单 Bearer Token 或 Cookie Session
SSE 实时推送
```

后续可升级：

```text
PostgreSQL / SQLite
Redis PubSub
WebSocket
队列系统
```

## 3. 后端模块

```text
apps/api/src/
  main.ts

  modules/
    task/
      task.routes.ts
      task.service.ts
      task.store.ts

    auth/
      auth.routes.ts
      auth.service.ts
      auth.store.ts
      auth.middleware.ts

    message/
      message.routes.ts
      message.service.ts

    event/
      event.routes.ts
      event.service.ts

    artifact/
      artifact.routes.ts
      artifact.service.ts

    approval/
      approval.routes.ts
      approval.service.ts

    stream/
      stream.routes.ts
      stream.service.ts

    openclaw/
      openclaw.client.ts
      openclaw.service.ts

  types/
    protocol.ts
```

## 4. 核心数据结构

### 4.1 User

```ts
export type User = {
  id: string;
  name: string;
  email?: string;
  createdAt: string;
};
```

### 4.2 AuthSession

```ts
export type AuthSession = {
  id: string;
  userId: string;
  token: string;
  createdAt: string;
  expiresAt?: string;
};
```

### 4.3 Task

```ts
export type TaskStatus =
  | 'created'
  | 'planning'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed';

export type Task = {
  id: string;
  userId: string;
  title: string;
  userInput: string;
  intent: 'meeting' | 'business' | 'coding' | 'qa' | 'general';
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};
```

### 4.4 Message

```ts
export type Message = {
  id: string;
  userId: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};
```

### 4.5 AgentEvent

```ts
export type AgentEvent = {
  id: string;
  userId: string;
  taskId: string;
  type: string;
  title: string;
  message?: string;
  status?: 'pending' | 'running' | 'success' | 'error' | 'waiting';
  payload?: unknown;
  createdAt: string;
};
```

### 4.6 Artifact

```ts
export type Artifact = {
  id: string;
  userId: string;
  taskId: string;
  type: 'plan' | 'meeting_draft' | 'code_diff' | 'report' | 'tool_result' | 'final_answer';
  title: string;
  format: 'markdown' | 'json' | 'diff' | 'text';
  content: unknown;
  createdAt: string;
};
```

### 4.7 Approval

```ts
export type Approval = {
  id: string;
  userId: string;
  taskId: string;
  title: string;
  description: string;
  action: string;
  payload: unknown;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
};
```

## 5. API 设计

### 5.1 认证 API

```http
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

登录请求：

```json
{
  "email": "user-a@example.com",
  "password": "dev-password"
}
```

登录响应：

```json
{
  "token": "dev-token-user-a",
  "user": {
    "id": "user_001",
    "name": "用户 A",
    "email": "user-a@example.com"
  }
}
```

MVP 阶段可以内置少量测试用户。后续再替换为真实账号系统、OAuth 或企业 SSO。

### 5.2 任务 API

```http
POST /api/tasks
GET  /api/tasks
GET  /api/tasks/:taskId
PATCH /api/tasks/:taskId/status
```

创建任务请求：

```json
{
  "title": "预约项目复盘会",
  "userInput": "下周三上午帮我预约张三开项目复盘会",
  "intent": "meeting"
}
```

创建任务时，后端必须从认证中间件得到 `currentUser.id`，并写入 `task.userId`。前端请求体不允许传 `userId`。

`GET /api/tasks` 的语义是：只返回当前用户的任务。

### 5.3 消息 API

```http
POST /api/tasks/:taskId/messages
GET  /api/tasks/:taskId/messages
```

发送消息请求：

```json
{
  "role": "user",
  "content": "下周三上午帮我预约张三开项目复盘会"
}
```

后端收到用户消息后，MVP 可以做两种处理：

1. Mock 模式：直接生成 event/artifact/approval。
2. OpenClaw 模式：调用 OpenClaw Gateway，让 Agent 执行。

建议第一天先做 Mock 模式，确认前端链路跑通；然后接 OpenClaw。

发送消息前必须校验：

```text
task.userId === currentUser.id
```

### 5.4 事件 API

```http
POST /api/tasks/:taskId/events
GET  /api/tasks/:taskId/events
```

这个接口主要给 OpenClaw 插件调用。

插件调用写接口时，后端使用插件 token 校验服务身份，然后根据 `taskId` 反查 `task.userId`，再写入 `event.userId`。

用户调用读接口时，后端必须校验 `task.userId === currentUser.id`。

### 5.5 产物 API

```http
POST /api/tasks/:taskId/artifacts
GET  /api/tasks/:taskId/artifacts
```

这个接口主要给 OpenClaw 插件调用。

插件写入 artifact 时同样不信任请求体中的 `userId`，只根据 `taskId` 归属写入。

### 5.6 审批 API

```http
POST /api/tasks/:taskId/approvals
GET  /api/tasks/:taskId/approvals

POST /api/approvals/:approvalId/approve
POST /api/approvals/:approvalId/reject
```

审批确认或拒绝前必须校验：

```text
approval.userId === currentUser.id
```

### 5.7 SSE API

```http
GET /api/tasks/:taskId/stream
```

推送事件类型：

```ts
type StreamEvent =
  | { type: 'task.updated'; data: Task }
  | { type: 'message.created'; data: Message }
  | { type: 'agent.event.created'; data: AgentEvent }
  | { type: 'artifact.created'; data: Artifact }
  | { type: 'approval.requested'; data: Approval }
  | { type: 'approval.updated'; data: Approval };
```

建立 SSE 连接前必须校验：

```text
task.userId === currentUser.id
```

如果使用 Cookie Session，可以直接让浏览器携带 Cookie。如果使用 Bearer Token，原生 `EventSource` 不能设置 header，MVP 可临时使用短期 token 查询参数，或改用 fetch-based SSE 客户端。

## 6. 权限校验规则

所有用户态 API 都必须先经过认证中间件，得到：

```ts
type RequestContext = {
  currentUser: User;
};
```

统一规则：

- 创建 task：使用 `currentUser.id` 写入 `task.userId`
- 查询 task：只允许 `task.userId === currentUser.id`
- 写 message：必须确认 task 属于 currentUser
- 读 message/event/artifact/approval：必须确认 task 属于 currentUser
- approve/reject：必须确认 approval 属于 currentUser
- SSE：建立连接前必须确认 task 属于 currentUser
- 插件写 event/artifact/approval：校验服务 token 后，根据 taskId 反查 userId
- 后端不要信任前端或插件传入的 userId

## 7. SSE 推送设计

后端所有写入动作都应该广播：

```text
createEvent -> 保存 event -> stream.broadcast(taskId, { type: 'agent.event.created', data: event })
createArtifact -> 保存 artifact -> stream.broadcast(taskId, { type: 'artifact.created', data: artifact })
createApproval -> 保存 approval -> stream.broadcast(taskId, { type: 'approval.requested', data: approval })
```

SSE 连接表按 `taskId` 维护即可，但加入连接前必须完成用户权限校验。因为一个 task 只属于一个 user，广播到该 task 的连接不会泄露给其他用户。

## 8. OpenClaw 调用

MVP 后端只需要一个 OpenClawClient：

```ts
type RunAgentInput = {
  userId: string;
  taskId: string;
  userInput: string;
};

async function runAgent(input: RunAgentInput): Promise<void> {
  // 第一版可以先不真正调用 OpenClaw
  // 接入阶段再调用 OpenClaw Gateway 或 CLI
}
```

建议在后端保留配置：

```env
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
XUANZHI_API_TOKEN=dev-token
```

后端调用 OpenClaw 时可以传 `userId` 作为上下文，但不能让 OpenClaw 或插件决定数据归属。最终写入归属仍以后端 task 表中的 `task.userId` 为准。

`XUANZHI_API_TOKEN` 是 OpenClaw 插件调用玄知后端的服务级 token，不是用户登录 token。

## 9. MVP Mock 执行器

在 OpenClaw 未接入前，后端可以直接模拟：

```text
1. 写入 event: 已创建任务
2. 写入 event: 已生成执行计划
3. 写入 artifact: 会议草稿
4. 写入 approval: 是否确认创建会议
5. 等用户确认
6. 用户确认后写入 event: 用户已确认
7. 更新 task completed
```

这能先保证前端可视化链路正确。

Mock 执行器生成的数据也必须带上当前 task 对应的 `userId`。

## 10. 后端验收标准

- `POST /api/auth/login` 可登录测试用户
- `GET /api/auth/me` 可获取当前用户
- `POST /api/tasks` 可创建任务
- `POST /api/tasks/:taskId/messages` 可发送消息
- `GET /api/tasks/:taskId/stream` 可实时推送
- 插件能调用 event/artifact/approval 写接口
- 前端能实时看到事件和产物
- 用户能确认或拒绝审批
- 确认后任务状态能更新为 completed
- 用户 A 看不到用户 B 的任务
- 用户 A 不能访问用户 B 的 task detail
- 用户 A 不能订阅用户 B 的 SSE
- 用户 A 不能审批用户 B 的 approval
