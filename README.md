# 玄知助手

玄知助手是一个面向密码学研究与工程场景的多用户 Agent 工作台。当前架构已经切换为“前端/后端/ OpenClaw Gateway”三层模式：前端只连接玄知后端，后端长期连接 OpenClaw，并把用户消息派发到对应的 OpenClaw Agent session。

## 当前链路

```text
用户登录或注册
  -> 后端为用户绑定唯一 Agent
  -> 后端为 Agent 分配独立 workspace
  -> 用户发送消息
  -> 后端保存 task/message
  -> 后端通过 OpenClaw Gateway 创建或复用 Agent 与 session
  -> OpenClaw Agent 执行并通过 Gateway 事件返回
  -> 后端写入 message/event/artifact/approval
  -> 前端通过 SSE 实时接收当前 task 的更新
```

后端不再提供本地模拟执行器或 direct model runtime 作为主路径。所有对话执行都应经过 OpenClaw Gateway。

## 技术栈

- 包管理器：`pnpm`，通过 `corepack` 固定版本
- 前端：React + Vite + TypeScript + Ant Design
- 后端：Node.js + Fastify + TypeScript
- 测试：Vitest
- 共享协议：`packages/shared`
- OpenClaw 上报插件：`plugins/xuanzhi-artifacts`

## 目录结构

```text
.
|-- apps/
|   |-- api/                 # Fastify 后端 API
|   `-- web/                 # React + Vite 前端工作台
|-- packages/
|   `-- shared/              # 前后端共享协议类型
|-- plugins/
|   `-- xuanzhi-artifacts/   # OpenClaw 上报插件
|-- docs/
|   `-- OpenClaw后端连接配置.md
|-- AGENTS.md                # 给其他设备/AI 优先读取的项目说明
|-- package.json
`-- pnpm-workspace.yaml
```

## 用户与 Agent 模型

- 一个用户对应一个玄知 Agent。
- 用户注册后，后端自动创建本地 Agent。
- Agent 的 workspace 使用 `xuanzhi-user-<userId>`，用于在 OpenClaw 侧隔离用户数据。
- 登录、注册和 `/api/auth/me` 都会返回当前用户的 Agent。
- 普通用户不能手动创建多个 Agent；管理员可以通过管理接口创建和查看。
- 初始化向导会收集用户身份、角色、单位、研究方向、回复风格、分析深度和助理名称，并保存为 Agent profile。

## OpenClaw 后端连接

默认 Gateway 地址：

```text
ws://127.0.0.1:18789
```

即使 OpenClaw 运行在 WSL 中，玄知后端也把它当作 Windows 本机服务访问。后端使用 Gateway token 完成首次配对，并生成设备身份文件用于后续持久连接。

新设备接入：

1. 复制 `apps/api/.env.example` 为 `apps/api/.env`。
2. 在 OpenClaw 所在环境执行：

   ```bash
   openclaw config get gateway.auth.token
   ```

3. 将 token 写入 `apps/api/.env` 的 `OPENCLAW_PASSWORD`。
4. 启动后端：

   ```bash
   corepack.cmd pnpm dev:api
   ```

5. 保留自动生成的 `apps/api/.openclaw-device.json`。这是当前设备的稳定身份，不要提交到仓库。

完整说明见：

```text
AGENTS.md
docs/OpenClaw后端连接配置.md
```

## 常用命令

安装依赖：

```bash
corepack.cmd pnpm install
```

启动前后端：

```bash
corepack.cmd pnpm dev
```

只启动后端：

```bash
corepack.cmd pnpm dev:api
```

只启动前端：

```bash
corepack.cmd pnpm dev:web
```

构建全部 workspace：

```bash
corepack.cmd pnpm build
```

运行测试：

```bash
corepack.cmd pnpm test
```

## 关键环境变量

```bash
PORT=3000
HOST=127.0.0.1

XUANZHI_API_TOKEN=dev-token

OPENCLAW_WS_URL=ws://127.0.0.1:18789
OPENCLAW_PASSWORD=<OpenClaw Gateway token>
OPENCLAW_REQUEST_TIMEOUT=15000
OPENCLAW_DEVICE_IDENTITY_PATH=.openclaw-device.json
OPENCLAW_CLIENT_ID=gateway-client
OPENCLAW_CLIENT_MODE=backend
OPENCLAW_SCOPES=operator.read,operator.write,operator.admin
```

`OPENCLAW_PASSWORD` 和 `.openclaw-device.json` 都是本机私密配置，不应提交。

## 开发约定

- 默认中文沟通和中文文档。
- 不在前端保存 OpenClaw token。
- 不让前端直接连接 OpenClaw Gateway。
- 后端根据登录态决定用户归属，插件和前端 payload 中的 `userId` 不可信。
- SSE 只按当前登录用户可访问的 task 建连。
- OpenClaw Gateway 连接状态可通过 `/api/gateway/status` 查看。
