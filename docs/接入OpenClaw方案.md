# 玄知助手接入 OpenClaw 方案

本文描述当前有效架构：玄知后端长期连接 OpenClaw Gateway，前端只访问玄知后端。

## 架构

```text
React 前端
  -> Fastify 后端
  -> OpenClawClient WebSocket RPC
  -> ws://127.0.0.1:18789
  -> OpenClaw Agent session
```

前端不保存 OpenClaw token，也不直接连接 Gateway。后端负责认证、用户隔离、Agent/workspace 管理、session 派发、事件落库和 SSE 转发。

## 连接配置

后端读取 `apps/api/.env`：

```text
OPENCLAW_WS_URL=ws://127.0.0.1:18789
OPENCLAW_PASSWORD=<Gateway token>
OPENCLAW_REQUEST_TIMEOUT=15000
OPENCLAW_DEVICE_IDENTITY_PATH=.openclaw-device.json
OPENCLAW_CLIENT_ID=gateway-client
OPENCLAW_CLIENT_MODE=backend
OPENCLAW_SCOPES=operator.read,operator.write,operator.admin
```

Gateway token 可在 OpenClaw 所在环境获取：

```bash
openclaw config get gateway.auth.token
```

## 设备身份

首次连接时，后端会生成 Ed25519 设备身份，并将结果保存到：

```text
apps/api/.openclaw-device.json
```

该文件包含私钥和后续重连使用的 `deviceToken`，必须加入忽略列表，不能提交。

## 用户隔离

- 一个玄知用户对应一个 Agent。
- 注册后自动创建 Agent。
- workspace 命名为 `xuanzhi-user-<userId>`。
- 所有 task、message、event、artifact、approval 都由后端根据登录态绑定 `userId`。
- 插件或前端 payload 中传入的 `userId` 不可信。

## 对话流程

1. 用户发送消息到 `/api/tasks/:taskId/messages`。
2. 后端写入用户消息。
3. 后端查找当前用户绑定的 Agent。
4. 如 OpenClaw 侧还没有对应 Agent，则调用 `agents.create`。
5. 后端调用 `sessions.create` 创建或复用主 session 与 task session。
6. 后端调用 `chat.send` 派发用户消息。
7. 后端监听 Gateway `chat` 和 `agent` 事件。
8. 后端将回复、工具步骤和状态写入本地 store。
9. 前端通过 SSE 接收当前 task 的实时更新。

## Profile 同步

用户初始化或更新 Agent profile 后，后端会尽力同步：

- `agents.update`：更新 OpenClaw Agent 显示名称。
- `agents.files.set`：将 profile 写入 workspace 文件 `xuanzhi-profile.json`。

同步失败不会阻塞用户保存本地 profile，但会在后端日志中记录错误。

## 健康检查

后端提供：

```text
GET /api/gateway/status
GET /api/gateway/health
```

正常状态应为：

```text
status=connected
health=healthy
lastError=null
```

## 测试策略

测试使用假的 Gateway client 覆盖 OpenClaw 语义：

- `agents.create`
- `sessions.create`
- `chat.send`
- `chat` final event

这样可以验证后端真实业务链路，而不依赖本地模型可用性或 VPN 状态。
