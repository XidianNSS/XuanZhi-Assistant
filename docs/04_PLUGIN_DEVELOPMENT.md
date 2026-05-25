# 04. OpenClaw 插件开发说明

## 1. 插件目标

第一版只开发一个插件：

```text
xuanzhi-artifacts
```

插件作用：

```text
让 OpenClaw Agent 可以主动把执行过程、中间产物、审批请求上报给玄知助手后端。
```

多用户场景下，插件只负责按 `taskId` 上报数据，不负责判断数据属于哪个用户。用户归属由玄知后端根据 `taskId` 反查 `Task.userId` 得出。

## 2. 插件目录结构

```text
plugins/xuanzhi-artifacts/
  package.json
  openclaw.plugin.json
  tsconfig.json
  src/
    index.ts
```

## 3. 插件需要实现的工具

### 3.1 xuanzhi_emit_event

作用：上报执行过程。

示例：

```json
{
  "taskId": "task_001",
  "type": "agent.step",
  "title": "正在生成执行计划",
  "message": "Agent 正在分析用户需求",
  "status": "running",
  "payload": {}
}
```

请求后端：

```http
POST /api/tasks/:taskId/events
```

不要在插件工具参数中要求 Agent 传 `userId`。即使请求体里出现 `userId`，后端也应该忽略。

### 3.2 xuanzhi_create_artifact

作用：上报中间产物。

示例：

```json
{
  "taskId": "task_001",
  "type": "meeting_draft",
  "title": "会议草稿",
  "format": "json",
  "content": {
    "title": "项目复盘会",
    "time": "下周三上午",
    "attendees": ["张三"]
  }
}
```

请求后端：

```http
POST /api/tasks/:taskId/artifacts
```

后端保存 artifact 时使用 task 归属写入 `artifact.userId`。

### 3.3 xuanzhi_request_approval

作用：请求用户确认。

示例：

```json
{
  "taskId": "task_001",
  "title": "确认创建会议",
  "description": "是否确认创建项目复盘会？",
  "action": "calendar.create_meeting",
  "payload": {
    "title": "项目复盘会",
    "attendees": ["张三"]
  }
}
```

请求后端：

```http
POST /api/tasks/:taskId/approvals
```

后端保存 approval 时使用 task 归属写入 `approval.userId`。后续用户确认或拒绝时，再通过 `approval.userId` 做权限校验。

### 3.4 xuanzhi_update_task_status

作用：更新任务状态。

示例：

```json
{
  "taskId": "task_001",
  "status": "completed"
}
```

请求后端：

```http
PATCH /api/tasks/:taskId/status
```

## 4. 插件配置

环境变量：

```env
XUANZHI_API_BASE_URL=http://127.0.0.1:3000
XUANZHI_API_TOKEN=dev-token
```

所有插件请求都带：

```http
Authorization: Bearer dev-token
```

`XUANZHI_API_TOKEN` 是插件到玄知后端的服务级 token，不是任何用户的登录 token。

## 5. HTTP 工具函数

```ts
async function postToXuanzhi(path: string, body: unknown) {
  const baseUrl = process.env.XUANZHI_API_BASE_URL ?? 'http://127.0.0.1:3000';
  const token = process.env.XUANZHI_API_TOKEN ?? 'dev-token';

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xuanzhi API request failed: ${res.status} ${text}`);
  }

  return res.json();
}
```

## 6. 插件工具行为规范

Agent 调用插件时必须遵守：

1. 开始任务时，上报 `task.started`
2. 生成计划后，创建 `plan` artifact
3. 每次重要工具调用前，上报 `tool.call.started`
4. 每次重要工具调用后，上报 `tool.call.completed`
5. 生成草稿、报告、代码 diff 时，创建 artifact
6. 涉及外部影响的动作，必须请求 approval
7. 任务结束时，更新 task 状态

多用户规则：

1. 插件工具输入只需要 `taskId` 和业务数据
2. 插件不接收用户登录 token
3. 插件不写入、覆盖或推断 `userId`
4. 后端收到插件请求后先校验服务 token
5. 后端根据 `taskId` 查询 task
6. 后端使用 `task.userId` 写入 event/artifact/approval

## 7. 第一版模拟会议流程

Agent 可以按这个流程调用插件：

```text
1. xuanzhi_emit_event: 已开始任务
2. xuanzhi_emit_event: 正在理解用户需求
3. xuanzhi_create_artifact: 执行计划
4. xuanzhi_emit_event: 正在生成会议草稿
5. xuanzhi_create_artifact: 会议草稿
6. xuanzhi_request_approval: 确认创建会议
7. 等待用户确认
8. xuanzhi_update_task_status: completed
```

MVP 可以暂时不真的创建会议。

## 8. 插件验收标准

- 插件可以被 OpenClaw 安装
- 插件可以被 OpenClaw 启用
- OpenClaw Agent 可以看到 4 个工具
- 调用工具后，玄知后端能收到 HTTP 请求
- 前端能通过 SSE 看到插件上报的数据
- 插件请求不需要传 userId
- 插件上报数据能被后端归属到正确用户
- 用户不能通过插件链路读取或影响其他用户任务
