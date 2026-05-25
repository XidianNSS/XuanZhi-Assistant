# AGENTS.md

本文件用于指导后续开发者和 AI 编码助手实现“玄知助手”MVP。开发时以 `docs/` 目录下的实现说明为准，当前目标是完成一个支持多用户数据隔离的可视化 Agent 工作台。

## 1. 产品目标

第一版 MVP 只验证一个闭环：

```text
用户登录
  -> 输入任务
  -> 创建当前用户的 task
  -> 后端保存 task/message
  -> Mock Agent 或 OpenClaw 执行
  -> event/artifact/approval 上报
  -> SSE 实时推送给任务所属用户
  -> 用户确认或拒绝
  -> 任务完成
```

必须保证不同用户的数据互相隔离。用户 A 不能看到、访问、订阅、审批用户 B 的任务。

## 2. 推荐项目结构

```text
xuanzhi-assistant/
  apps/
    web/                    # React + Vite 前端
    api/                    # Node.js + Fastify/NestJS 后端

  packages/
    shared/                 # 前后端共享类型

  plugins/
    xuanzhi-artifacts/      # OpenClaw 上报插件

  openclaw/                 # OpenClaw 源码

  docs/                     # 实现说明文档
```

插件目录名统一使用 `plugins/xuanzhi-artifacts`，不要使用下划线命名。

## 3. 技术约束

- 包管理器统一使用 `pnpm`。
- 不要混用 `npm` 和 `pnpm`，不要提交 `package-lock.json`。
- 当前阶段只是开发阶段，不构建项目，不生成生产发布产物。
- 不要执行 `pnpm build`、`pnpm run build`、`pnpm claw:build`、Docker build、打包部署或发布相关命令，除非用户明确要求。
- 验证以本地开发服务、接口联调、类型检查、lint 和手工演示为主。
- 根目录需要 `pnpm-workspace.yaml`，至少包含：

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "plugins/*"
```

- 如果 Vite 因 `esbuild` 构建脚本被 pnpm 拦截而启动失败，在 `pnpm-workspace.yaml` 中批准：

```yaml
onlyBuiltDependencies:
  - esbuild
```

开发阶段推荐命令只包含：

```bash
pnpm install
pnpm run dev
pnpm lint
pnpm typecheck
pnpm test
```

如果某个包暂时没有 `lint`、`typecheck` 或 `test` 脚本，不需要为了通过验证临时搭建完整工程化链路。

## 4. 共享类型

前后端共用协议类型必须放在 `packages/shared/src/protocol.ts`，避免 web 和 api 各自维护一份。

MVP 至少包含：

- `User`
- `AuthSession`
- `Task`
- `Message`
- `AgentEvent`
- `Artifact`
- `Approval`

`Task` 必须包含 `userId`。`Message`、`AgentEvent`、`Artifact`、`Approval` 也建议冗余 `userId`，便于查询和权限判断。

## 5. 多用户规则

这是最高优先级约束：

- 前端不允许向业务接口传 `userId`。
- 后端只信任认证中间件解析出的 `currentUser`。
- 创建 task 时，后端使用 `currentUser.id` 写入 `task.userId`。
- 查询 task 时，只允许访问 `task.userId === currentUser.id` 的数据。
- 发送 message 前，必须校验 task 属于当前用户。
- 查询 event/artifact/approval 前，必须校验 task 属于当前用户。
- approve/reject 前，必须校验 approval 属于当前用户。
- 建立 SSE 前，必须校验 task 属于当前用户。
- 插件上报时只信任服务级 token，不信任请求体中的 `userId`。
- 插件上报 event/artifact/approval 时，后端必须根据 `taskId` 反查 `task.userId`。

禁止通过前端参数、插件参数或 Agent 输出决定数据归属。

## 6. 前端开发规则

前端只调用玄知后端 API，不直接调用 OpenClaw。

推荐目录：

```text
apps/web/src/
  app/
    App.tsx
    router.tsx

  layouts/
    AssistantLayout.tsx

  pages/
    LoginPage.tsx
    HomePage.tsx
    TaskPage.tsx

  components/
    sidebar/
    chat/
    agent/
    artifacts/
    user/

  services/
    authApi.ts
    taskApi.ts
    messageApi.ts
    approvalApi.ts
    streamClient.ts

  stores/
    authStore.ts
    taskStore.ts

  types/
    protocol.ts
```

前端必须实现：

- `LoginPage`
- `UserMenu`
- `authStore`
- `authApi`
- `TaskSidebar`
- `ChatPanel`
- `MessageComposer`
- `ApprovalCard`
- `AgentWorkspace`
- `AgentTimeline`
- `ArtifactPanel`
- `streamClient`

API 请求统一封装认证头：

```ts
Authorization: Bearer <token>
```

如果使用原生 `EventSource`，注意它不能直接设置 `Authorization` header。MVP 可使用 Cookie Session，或开发阶段使用短期 token 查询参数。无论采用哪种方式，后端必须做 SSE 鉴权。

登出或切换用户时必须：

- 清空 `currentUser`
- 清空 token
- 清空任务、消息、事件、产物、审批缓存
- 关闭所有 SSE 连接

## 7. 后端开发规则

后端是状态中心，负责认证、权限、存储、SSE、OpenClaw 调用和插件上报接收。

推荐目录：

```text
apps/api/src/
  main.ts

  modules/
    auth/
    task/
    message/
    event/
    artifact/
    approval/
    stream/
    openclaw/

  types/
    protocol.ts
```

MVP 先用内存存储 `Map` 即可，不要过早引入数据库、Redis、队列或复杂权限系统。

后端至少实现：

```http
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout

POST /api/tasks
GET  /api/tasks
GET  /api/tasks/:taskId
PATCH /api/tasks/:taskId/status

POST /api/tasks/:taskId/messages
GET  /api/tasks/:taskId/messages

POST /api/tasks/:taskId/events
GET  /api/tasks/:taskId/events

POST /api/tasks/:taskId/artifacts
GET  /api/tasks/:taskId/artifacts

POST /api/tasks/:taskId/approvals
GET  /api/tasks/:taskId/approvals

POST /api/approvals/:approvalId/approve
POST /api/approvals/:approvalId/reject

GET /api/tasks/:taskId/stream
```

所有用户态接口必须先通过认证中间件拿到 `currentUser`。

## 8. Mock Agent 优先

第一阶段先不要急着接 OpenClaw，先在后端实现 Mock Agent，跑通前端、后端、SSE、Artifact、Approval 闭环。

Mock 流程：

```text
1. 写入 event: 已创建任务
2. 写入 event: 已收到用户输入
3. 写入 event: 正在分析任务
4. 写入 artifact: 执行计划
5. 写入 artifact: 会议草稿
6. 写入 approval: 是否确认创建会议
7. 等用户确认
8. 用户确认后写入 event: 用户已确认
9. 更新 task completed
```

Mock 生成的所有数据也必须带正确 `userId`。

## 9. OpenClaw 接入规则

OpenClaw 是 Agent Runtime / Gateway，不是业务后端。

后端调用 OpenClaw 时可以传：

```text
userId
taskId
userInput
可用工具说明
```

但 `userId` 只作为执行上下文和日志线索。最终数据归属以后端保存的 `task.userId` 为准。

不要修改 OpenClaw core，除非插件方案无法满足 MVP。

根目录脚本建议：

```json
{
  "scripts": {
    "claw:setup": "cd openclaw && pnpm openclaw setup",
    "claw:dev": "cd openclaw && pnpm gateway:watch",
    "claw:status": "cd openclaw && pnpm openclaw gateway status",
    "claw:doctor": "cd openclaw && pnpm openclaw doctor",
    "claw:plugins": "cd openclaw && pnpm openclaw plugins list"
  }
}
```

## 10. 插件开发规则

第一版只开发一个插件：

```text
xuanzhi-artifacts
```

插件工具：

- `xuanzhi_emit_event`
- `xuanzhi_create_artifact`
- `xuanzhi_request_approval`
- `xuanzhi_update_task_status`

插件读取：

```env
XUANZHI_API_BASE_URL=http://127.0.0.1:3000
XUANZHI_API_TOKEN=dev-token
```

插件请求后端时使用：

```http
Authorization: Bearer dev-token
```

`XUANZHI_API_TOKEN` 是插件到后端的服务级 token，不是用户登录 token。

插件工具参数不要求、也不应该包含 `userId`。如果请求体出现 `userId`，后端必须忽略。

## 11. 不要做的事

MVP 暂时不做：

- 生产构建
- 部署发布
- Docker 镜像构建
- CI/CD 流水线
- 构建产物优化
- 团队、组织、空间
- 任务共享
- 多人协同审批
- 管理后台
- 复杂 RBAC
- 真实会议创建
- 真实邮件发送
- 真实业务系统修改
- 真实代码仓库写入
- 多 Agent 调度
- 任务回放和审计
- OpenClaw core 深度改造
- 自动拦截所有 OpenClaw 内部工具调用

不要为了这些未来能力提前引入复杂架构。

## 12. 验收标准

开发阶段验收只要求本地可开发、可联调、可演示，不要求生产构建通过。

当前阶段应满足：

- 用户可以登录
- 后端可以识别 `currentUser`
- 用户可以输入任务
- 前端可以创建 task
- 后端可以保存 task/message/event/artifact/approval
- 所有业务对象能正确绑定 `userId`
- 前端可以通过 SSE 实时看到过程
- 前端可以看到中间产物
- 前端可以处理审批
- OpenClaw 插件可以调用后端 API 上报数据
- 用户 A 看不到用户 B 的任务
- 用户 A 不能访问用户 B 的 task detail
- 用户 A 不能订阅用户 B 的 SSE
- 用户 A 不能审批用户 B 的 approval
- 插件上报数据后，数据仍归属正确用户
- 第一版流程可以演示
- 前端和后端可以通过本地 dev 服务联调
- 不要求生成 `dist/`、生产包、Docker 镜像或部署产物

推荐演示输入：

```text
下周三上午帮我预约张三开项目复盘会
```

预期前端展示：

```text
✓ 已创建任务
✓ 已收到用户输入
✓ 正在分析任务
✓ 已生成执行计划
✓ 已生成会议草稿
⚠ 等待用户确认是否创建会议
✓ 用户已确认
✓ 任务已完成
```
