# AGENTS.md

本文件给后续接手本仓库的 AI/开发者优先读取。请默认使用中文沟通，代码标识符、命令、路径、第三方 API 名称保持英文原文。

## 项目定位

玄知助手是一个前后端完整项目：

- `apps/web`：React + Vite 前端工作台。
- `apps/api`：Fastify 后端 API。
- `packages/shared`：前后端共享协议类型。
- `plugins/xuanzhi-artifacts`：OpenClaw 侧上报插件。

当前主路线是：前端连接玄知后端，玄知后端长期连接 OpenClaw Gateway。不要让前端直接连接 OpenClaw，也不要恢复本地模拟执行器或 direct model runtime 作为对话执行路径。

## OpenClaw 连接约定

用户的 OpenClaw 运行在 WSL 中，但玄知后端访问时统一使用 Windows 本机地址：

```text
ws://127.0.0.1:18789
```

后端通过 Gateway token 完成首次连接与设备配对，然后生成本机设备身份文件：

```text
apps/api/.openclaw-device.json
```

该文件包含本设备的私钥和 `deviceToken`，只能保存在本机，不能提交到 Git。

## 新设备接入步骤

1. 安装依赖：

   ```bash
   corepack.cmd pnpm install
   ```

2. 复制环境变量示例：

   ```bash
   Copy-Item apps/api/.env.example apps/api/.env
   ```

3. 在 OpenClaw 所在环境获取 Gateway token：

   ```bash
   openclaw config get gateway.auth.token
   ```

4. 将 token 写入：

   ```text
   apps/api/.env
   ```

   对应字段：

   ```text
   OPENCLAW_PASSWORD=<Gateway token>
   ```

5. 启动后端：

   ```bash
   corepack.cmd pnpm dev:api
   ```

6. 检查状态：

   ```text
   GET http://127.0.0.1:3000/api/gateway/status
   ```

   期望看到 `status=connected`、`health=healthy`。

## 用户/Agent/workspace 模型

- 一个用户一个玄知 Agent。
- 用户注册后自动创建 Agent。
- workspace 按用户隔离，命名为 `xuanzhi-user-<userId>`。
- 登录、注册、`/api/auth/me` 都应返回当前用户 Agent。
- 普通用户不能手动新建多个 Agent。
- 管理员可以通过管理接口创建或查看 Agent。
- Agent profile 初始化界面需要收集身份、角色、单位、研究方向、回复风格、分析深度和助理名称。
- Agent profile 更新后，后端会尽力同步到 OpenClaw Agent，并写入 workspace 文件 `xuanzhi-profile.json`。

## 后端运行方式

后端启动时会读取：

```text
apps/api/.env
```

关键配置：

```text
OPENCLAW_WS_URL=ws://127.0.0.1:18789
OPENCLAW_PASSWORD=<Gateway token>
OPENCLAW_REQUEST_TIMEOUT=15000
OPENCLAW_DEVICE_IDENTITY_PATH=.openclaw-device.json
OPENCLAW_CLIENT_ID=gateway-client
OPENCLAW_CLIENT_MODE=backend
OPENCLAW_SCOPES=operator.read,operator.write,operator.admin
```

`OPENCLAW_PASSWORD` 和 `.openclaw-device.json` 都是私密本地配置。

## 常用命令

```bash
corepack.cmd pnpm install
corepack.cmd pnpm dev
corepack.cmd pnpm dev:api
corepack.cmd pnpm dev:web
corepack.cmd pnpm build
corepack.cmd pnpm test
```

## 测试方向

测试应围绕 OpenClaw Gateway 路线编写：

- 认证与用户隔离。
- 注册后自动创建 Agent/workspace。
- 用户消息通过 `chat.send` 派发到 OpenClaw session。
- Gateway 返回的 chat/agent 事件能正确写入 message/event。
- 插件写入不能通过 payload 伪造 `userId`。

不要新增依赖本地模拟执行器或 direct model runtime 的测试。

## 常见问题

- `NOT_PAIRED: device identity required`：设备身份未完成配对，删除错误的 `.openclaw-device.json` 后用正确 token 重新连接。
- `unauthorized: gateway token missing`：`OPENCLAW_PASSWORD` 未配置或 token 无效。
- `origin not allowed`：OpenClaw Gateway 的 origin 白名单不允许当前来源。
- `WebSocket connection timeout`：确认 OpenClaw Gateway 已启动，且 Windows 能访问 `127.0.0.1:18789`。
