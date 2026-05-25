# 03. OpenClaw 接入说明

## 1. OpenClaw 在项目中的定位

OpenClaw 在玄知助手中不是前端，也不是业务后端。

OpenClaw 的角色是：

```text
Agent Runtime / Gateway
```

它负责：

- 接收后端派发的任务
- 接收任务所属用户上下文
- 使用模型理解任务
- 生成计划
- 调用工具
- 调用插件
- 产出结果

## 2. 不建议第一版修改 OpenClaw core

MVP 第一版优先采用插件接入，不改 OpenClaw core。

原因：

- 风险低
- 升级 OpenClaw 更容易
- 插件足够支撑 event/artifact/approval 上报
- 便于定位问题

只有当插件无法满足需求时，才考虑改 OpenClaw core。

## 3. OpenClaw 源码放置方式

推荐项目结构：

```text
xuanzhi-assistant/
  openclaw/                 # OpenClaw 源码
  plugins/
    xuanzhi-artifacts/
  apps/
    api/
    web/
```

## 4. 主项目脚本

根目录 `package.json` 建议加入：

```json
{
  "scripts": {
    "claw:setup": "cd openclaw && pnpm openclaw setup",
    "claw:dev": "cd openclaw && pnpm gateway:watch",
    "claw:status": "cd openclaw && pnpm openclaw gateway status",
    "claw:ui": "cd openclaw && pnpm ui:dev",
    "claw:build": "cd openclaw && pnpm build && pnpm ui:build"
  }
}
```

## 5. 开发启动方式

### 终端 1：启动 OpenClaw Gateway

```bash
cd ~/workspace/xuanzhi-assistant
pnpm claw:dev
```

### 终端 2：查看 OpenClaw 状态

```bash
pnpm claw:status
```

正常应该看到：

```text
Listening: 127.0.0.1:18789
Dashboard: http://127.0.0.1:18789/
Connectivity probe: ok
```

## 6. 环境变量

建议在主项目 `.env` 中配置：

```env
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_WS=ws://127.0.0.1:18789

XUANZHI_API_BASE_URL=http://127.0.0.1:3000
XUANZHI_API_TOKEN=dev-token
```

插件读取：

```text
XUANZHI_API_BASE_URL
XUANZHI_API_TOKEN
```

后端读取：

```text
OPENCLAW_GATEWAY_URL
XUANZHI_API_TOKEN
```

说明：

- `XUANZHI_API_TOKEN` 是插件访问玄知后端的服务级 token。
- 用户登录 token 只在前端和玄知后端之间使用。
- OpenClaw 插件不应该接收或保存用户登录 token。
- 插件上报数据时可以携带 `taskId`，但不应该决定 `userId`。
- 后端必须根据 `taskId` 反查任务归属。

## 7. 后端如何调用 OpenClaw

MVP 可以分两步：

### 阶段 1：Mock 执行

后端不调用 OpenClaw，而是模拟 Agent 上报。

用途：验证前端、后端、SSE、Artifact、Approval 流程。

### 阶段 2：真实 OpenClaw 执行

后端收到用户消息后，把以下内容传给 OpenClaw：

```text
userId
taskId
userInput
可用工具说明
要求 Agent 必须调用 xuanzhi_* 工具上报过程
```

其中 `userId` 只作为执行上下文和日志线索。真正的数据归属以后端保存的 `task.userId` 为准。

Prompt 中必须明确要求：

```text
执行任务时，你必须：
1. 调用 xuanzhi_emit_event 上报关键步骤
2. 调用 xuanzhi_create_artifact 保存计划和产物
3. 调用 xuanzhi_request_approval 请求用户确认
4. 调用 xuanzhi_update_task_status 更新任务状态
```

Prompt 中也需要明确：

```text
你不能伪造或修改 userId。
调用 xuanzhi_* 工具时只需要提交 taskId 和业务数据。
玄知后端会根据 taskId 判断数据归属。
```

## 8. OpenClaw 插件安装

在 OpenClaw 源码目录执行：

```bash
cd ~/workspace/xuanzhi-assistant/openclaw

pnpm openclaw plugins install --link ../plugins/xuanzhi-artifacts
pnpm openclaw plugins enable xuanzhi-artifacts
pnpm openclaw plugins list
```

如果插件未生效，检查：

```bash
pnpm openclaw plugins doctor
pnpm openclaw doctor
```

## 9. OpenClaw 第一版验收标准

- `pnpm claw:dev` 能启动
- `pnpm claw:status` 显示 Gateway 可连接
- `xuanzhi-artifacts` 插件能被安装和启用
- Agent 能调用插件工具
- 插件能把数据 POST 到玄知后端
- 前端能看到 OpenClaw 上报的 event/artifact/approval
- 插件上报的数据能归属到正确用户的 task
- 用户 A 无法通过 OpenClaw 上报链路看到用户 B 的任务数据
