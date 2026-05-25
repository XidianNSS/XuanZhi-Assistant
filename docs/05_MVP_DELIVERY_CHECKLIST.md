# 05. MVP 交付清单

## 1. 总目标

第一版 MVP 只验证一个目标：

```text
多用户场景下，Agent 的执行过程、中间产物、人工确认可以被所属用户在前端实时看见，并且不同用户的数据互相隔离。
```

## 2. 前端交付项

### 页面

- [ ] 登录页 LoginPage
- [ ] 首页 HomePage
- [ ] 任务页 TaskPage
- [ ] 左侧任务列表 TaskSidebar
- [ ] 中间聊天区 ChatPanel
- [ ] 右侧执行工作台 AgentWorkspace

### 组件

- [ ] MessageComposer
- [ ] AgentTimeline
- [ ] ArtifactPanel
- [ ] ArtifactViewer
- [ ] ApprovalCard
- [ ] AgentStatusBar
- [ ] UserMenu

### 能力

- [ ] 用户登录
- [ ] 获取当前用户 currentUser
- [ ] API 请求携带认证信息
- [ ] 创建任务
- [ ] 发送用户消息
- [ ] 订阅 SSE
- [ ] 实时展示 Event
- [ ] 实时展示 Artifact
- [ ] 展示 ApprovalCard
- [ ] 点击确认
- [ ] 点击拒绝
- [ ] 用户登出后清空本地状态
- [ ] 用户登出或切换任务时关闭 SSE
- [ ] 用户 A 看不到用户 B 的任务

## 3. 后端交付项

### API

- [ ] POST /api/auth/login
- [ ] GET /api/auth/me
- [ ] POST /api/auth/logout
- [ ] POST /api/tasks
- [ ] GET /api/tasks
- [ ] GET /api/tasks/:taskId
- [ ] POST /api/tasks/:taskId/messages
- [ ] GET /api/tasks/:taskId/messages
- [ ] POST /api/tasks/:taskId/events
- [ ] GET /api/tasks/:taskId/events
- [ ] POST /api/tasks/:taskId/artifacts
- [ ] GET /api/tasks/:taskId/artifacts
- [ ] POST /api/tasks/:taskId/approvals
- [ ] GET /api/tasks/:taskId/approvals
- [ ] POST /api/approvals/:approvalId/approve
- [ ] POST /api/approvals/:approvalId/reject
- [ ] PATCH /api/tasks/:taskId/status
- [ ] GET /api/tasks/:taskId/stream

### 能力

- [ ] 内存存储 User
- [ ] 内存存储 AuthSession 或 token
- [ ] 认证中间件解析 currentUser
- [ ] 内存存储 Task
- [ ] 内存存储 Message
- [ ] 内存存储 Event
- [ ] 内存存储 Artifact
- [ ] 内存存储 Approval
- [ ] Task 绑定 userId
- [ ] Message 绑定 userId
- [ ] Event 绑定 userId
- [ ] Artifact 绑定 userId
- [ ] Approval 绑定 userId
- [ ] GET /api/tasks 只返回当前用户任务
- [ ] task detail 权限校验
- [ ] message/event/artifact/approval 读写权限校验
- [ ] approve/reject 权限校验
- [ ] SSE 建连权限校验
- [ ] SSE 广播
- [ ] Mock Agent 执行器
- [ ] OpenClaw 调用入口预留
- [ ] 插件 Token 校验
- [ ] 插件上报时根据 taskId 反查 userId

## 4. OpenClaw 交付项

- [ ] OpenClaw 源码放到 `openclaw/`
- [ ] `pnpm claw:setup` 可执行
- [ ] `pnpm claw:dev` 可启动 Gateway
- [ ] `pnpm claw:status` 显示正常
- [ ] 后端配置 `OPENCLAW_GATEWAY_URL`
- [ ] 能安装本地插件
- [ ] 能启用本地插件
- [ ] 后端调用 OpenClaw 时传入 taskId 和 userId 上下文
- [ ] OpenClaw 不接收用户登录 token

## 5. 插件交付项

- [ ] 创建 `plugins/xuanzhi-artifacts`
- [ ] 编写 `package.json`
- [ ] 编写 `openclaw.plugin.json`
- [ ] 实现 `xuanzhi_emit_event`
- [ ] 实现 `xuanzhi_create_artifact`
- [ ] 实现 `xuanzhi_request_approval`
- [ ] 实现 `xuanzhi_update_task_status`
- [ ] 插件读取 `XUANZHI_API_BASE_URL`
- [ ] 插件读取 `XUANZHI_API_TOKEN`
- [ ] 插件请求后端 API 成功
- [ ] 插件工具参数不要求传 `userId`
- [ ] 插件使用服务级 token 访问后端
- [ ] 后端忽略插件请求体中的 `userId`
- [ ] 插件上报数据归属到正确用户

## 6. MVP 演示脚本

演示用户：

```text
用户 A：user-a@example.com
用户 B：user-b@example.com
```

用户 A 演示输入：

```text
下周三上午帮我预约张三开项目复盘会
```

期望前端展示：

```text
✓ 已创建任务
✓ 已收到用户输入
✓ 正在分析任务
✓ 已生成执行计划
✓ 已生成会议草稿
⚠ 等待用户确认是否创建会议
```

点击确认后：

```text
✓ 用户已确认
✓ 任务已完成
```

Artifact 面板应显示：

- 执行计划
- 会议草稿
- 最终结果

用户 B 登录后：

```text
不应看到用户 A 的任务、Timeline、Artifact、Approval
```

## 7. 完成标准

满足以下条件即可认为 MVP 完成：

- 用户能登录
- 后端能识别 currentUser
- 用户能输入任务
- 前端能创建 task
- 后端能保存 task/message/event/artifact/approval
- task/message/event/artifact/approval 能正确绑定 userId
- 前端能通过 SSE 实时看到过程
- 前端能看到中间产物
- 前端能处理审批
- OpenClaw 插件能调用后端 API 上报数据
- 用户 A 看不到用户 B 的任务
- 用户 A 不能访问用户 B 的 task detail
- 用户 A 不能订阅用户 B 的 SSE
- 用户 A 不能审批用户 B 的 approval
- 插件上报数据后，数据仍归属正确用户
- 第一版流程可演示
