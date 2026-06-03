# OpenClaw 后端连接配置

玄知后端作为 OpenClaw Gateway 的长期 operator 客户端运行。连接目标默认是 Windows 本机端口：

```text
ws://127.0.0.1:18789
```

即使 OpenClaw 运行在 WSL 中，后端也只需要访问这个 Windows 本地端口。

## 必要配置

后端读取 `apps/api/.env` 或上级目录最近的 `.env`。推荐从 `apps/api/.env.example` 复制：

```env
XUANZHI_API_TOKEN=dev-token

OPENCLAW_WS_URL=ws://127.0.0.1:18789
OPENCLAW_REQUEST_TIMEOUT=15000
OPENCLAW_DEVICE_IDENTITY_PATH=.openclaw-device.json
OPENCLAW_CLIENT_ID=gateway-client
OPENCLAW_CLIENT_MODE=backend
OPENCLAW_SCOPES=operator.read,operator.write,operator.admin
```

如果 OpenClaw Gateway 要求共享密码或 token，再配置：

```env
OPENCLAW_PASSWORD=your-gateway-token
```

旧 WebUI 的说明里 token 来源是：

```bash
openclaw config get gateway.auth.token
```

如果 OpenClaw 在 WSL 中运行，就在对应 WSL 发行版里执行该命令，然后把结果填入 Windows 项目的 `apps/api/.env`。

## 设备身份与配对

OpenClaw Gateway 会在 WebSocket 打开后发送 `connect.challenge`。玄知后端会：

1. 读取或创建 `OPENCLAW_DEVICE_IDENTITY_PATH` 指向的 Ed25519 设备身份文件。
2. 用稳定的 `deviceId`、`publicKey` 和 challenge 签名构造 `connect.device`。
3. 优先使用设备文件中保存的 `deviceToken`；没有 `deviceToken` 时使用 `OPENCLAW_PASSWORD`。
4. 发送 `connect` RPC，请求 `operator.read/write/admin` scopes。
5. 如果 Gateway 返回新的 `auth.deviceToken`，后端会写回设备身份文件，后续重连优先使用它。

设备身份路径相对 API 进程工作目录。使用 `pnpm --filter @xuanzhi/api dev` 时，工作目录是 `apps/api`。

设备身份文件必须持久保存，不要随进程重启删除。它代表“玄知后端”这台客户端设备；如果删除，OpenClaw 会把它当作新设备，需要重新配对。

如果日志出现：

```text
NOT_PAIRED: device identity required
```

说明端口已连通，但该 `deviceId` 尚未在 OpenClaw 侧批准。需要在 OpenClaw 的控制台、CLI 或具备 `operator.pairing` 权限的 UI 中查看待配对设备，并批准玄知后端的 `deviceId`。

如果日志出现：

```text
unauthorized: gateway token missing
```

说明 Gateway 要求 token 鉴权，但 `OPENCLAW_PASSWORD` 没有配置，或设备文件里还没有可复用的 `deviceToken`。

`client.id` 和 `client.mode` 必须使用 OpenClaw 允许的值。玄知后端不是浏览器 Control UI，当前默认使用后端客户端身份：

```text
client.id=gateway-client
client.mode=backend
```

旧前端项目使用 `openclaw-control-ui/webchat` 是因为它在浏览器中直接连接 Gateway；后端不要沿用这个身份，否则可能触发 Gateway 的 Control UI Origin 限制。

## 持久连接策略

后端启动时会创建单例 `OpenClawClient` 并非阻塞启动：

- WebSocket 断开后自动进入 `reconnecting`。
- 重连延迟从 5 秒开始指数退避，最大 60 秒。
- 连接成功后每 30 秒调用 `health`。
- 每 15 秒发送 WebSocket ping。
- 连续 3 次健康检查失败会主动断开并重连。

管理接口 `GET /api/admin/stats` 会返回当前 Gateway 状态，包括：

- `status`
- `health`
- `deviceId`
- `lastError`
- `gatewayVersion`
- `agents`

## 用户、Agent 与 workspace

玄知当前采用“一用户一个 Agent”的模型：

- 注册成功后自动创建本地 Agent。
- workspace 固定为 `xuanzhi-user-<userId>`，作为用户隔离边界。
- 首次进入应用时填写初始化资料，保存到本地 Agent profile。
- 如果 Gateway Agent 已创建，profile 会同步到 workspace 文件 `xuanzhi-profile.json`。

后续对话会复用该用户对应的 Gateway Agent，并在该 Agent 下创建主 session 和任务 session。
