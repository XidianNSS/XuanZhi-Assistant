# 00. 玄知助手 MVP 总体实现说明

## 1. 项目目标

玄知助手的第一版目标不是做一个完整的自动化平台，而是先跑通“支持多用户数据隔离的可视化 Agent 执行闭环”。

MVP 需要证明三件事：

1. 用户登录后输入一个任务，系统能在当前用户上下文中创建任务并启动 Agent。
2. Agent 执行过程中的关键步骤、中间产物、审批请求能够被上报并展示。
3. 用户只能查看、订阅、确认或拒绝属于自己的任务和高风险动作。

## 2. 系统边界

系统由四个部分组成：

```text
前端 React
  负责：登录入口、当前用户状态、任务入口、聊天界面、过程可视化、中间产物展示、审批操作

后端 API
  负责：认证、用户上下文、任务状态中心、消息存储、事件存储、产物存储、审批状态、权限校验、SSE 推送、调用 OpenClaw

OpenClaw Gateway
  负责：Agent 执行、模型调用、工具调用、插件运行

OpenClaw 插件
  负责：把 Agent 的过程、产物、审批请求主动上报给玄知后端
```

多用户 MVP 的边界原则：

```text
前端只持有当前登录用户上下文
后端只信任认证中间件解析出的 currentUser
task/message/event/artifact/approval 必须绑定用户归属
插件只提交 taskId，后端根据 taskId 反查 userId
SSE 连接必须先校验当前用户是否拥有该 task
```

## 3. MVP 不做什么

第一版暂时不做：

- 真实会议创建
- 真实邮件发送
- 真实业务系统修改
- 真实代码仓库写入
- 多 Agent 调度
- 复杂权限体系
- 团队、组织、空间
- 任务共享
- 多人协同审批
- 管理后台
- 任务回放和审计
- OpenClaw core 深度改造
- 自动拦截所有 OpenClaw 内部工具调用

第一版只做一个“模拟会议任务”或“通用任务”的闭环即可。

## 4. 项目推荐目录

```text
xuanzhi-assistant/
  apps/
    web/                    # React + Vite 前端
    api/                    # Node.js 后端 API

  packages/
    shared/                 # 前后端共享类型

  plugins/
    xuanzhi-artifacts/      # OpenClaw 上报插件

  openclaw/                 # OpenClaw 源码

  docs/                     # 项目说明文档
```

## 5. 核心数据对象

MVP 需要 7 类核心对象：

| 对象 | 说明 |
|---|---|
| User | 登录用户，用于标识任务归属 |
| AuthSession | 用户登录会话或访问 token |
| Task | 一个用户任务，例如“预约会议” |
| Message | 用户和 Agent 的聊天消息 |
| Event | Agent 执行过程事件，例如“正在生成计划” |
| Artifact | 中间产物，例如计划、草稿、代码 diff |
| Approval | 用户审批请求，例如“是否确认创建会议” |

其中 `Task` 必须直接包含 `userId`。`Message`、`Event`、`Artifact`、`Approval` 可以直接包含 `userId`，也可以通过 `taskId -> Task.userId` 间接归属；MVP 建议直接冗余 `userId`，便于查询和权限判断。

## 6. 总体调用链路

```text
1. 用户登录，前端获取 currentUser
2. 用户在前端输入任务
3. 前端携带用户 token 调用 POST /api/tasks 创建任务
4. 后端从 currentUser 绑定 task.userId
5. 前端调用 POST /api/tasks/:taskId/messages 发送消息
6. 后端校验 task 属于 currentUser
7. 后端把任务交给 OpenClaw
8. OpenClaw 执行任务
9. OpenClaw 插件调用后端 API 上报 event/artifact/approval
10. 后端校验插件 token，并根据 taskId 反查 userId
11. 后端保存数据
12. 后端通过该 task 的 SSE 通道推送给有权限的前端连接
13. 前端展示过程和产物
14. 当前用户点击确认或拒绝
```

## 7. MVP 验收结果

MVP 完成后，用户应该能看到：

```text
✓ 已创建任务
✓ 已接收用户输入
✓ Agent 已生成执行计划
✓ 已生成中间产物
⚠ 等待用户确认
✓ 用户已确认
✓ 任务已完成
```

这就是第一版的交付目标。

多用户场景下还需要证明：

```text
✓ 用户 A 只能看到用户 A 的任务
✓ 用户 B 只能看到用户 B 的任务
✓ 用户 A 无法访问或订阅用户 B 的任务
✓ 插件上报的数据会归属到正确的 task 和 user
```
