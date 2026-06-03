# OpenClaw 原生能力优先设计

更新时间：2026-06-03

## 1. 设计目标

玄知助手不再设计为一个独立的数据平台，也不再维护自己的数据库或持久化 Store。新的目标是：

> 以 OpenClaw 作为运行时、workspace、agent、session、工具与记忆的事实来源；玄知只做 OpenClaw 当前不直接提供的团队登录、配置向导、权限隔离与前端展示适配。

这个设计来自当前产品定位：玄知是面向小团队的 OpenClaw 前端工作台，而不是另一个独立 agent 平台。

## 2. 为什么不使用数据库

### 2.1 避免双事实来源

如果玄知后端保存用户 agent、任务、消息、事件和产物，而 OpenClaw 也保存 agent、session、workspace 和工具轨迹，就会出现两个事实来源：

- 玄知认为某个 agent 存在，但 OpenClaw 中已被删除。
- OpenClaw 中有 session 记录，但玄知数据库没有。
- profile 在玄知里更新了，但 OpenClaw agent 文件没有同步成功。
- 重启后需要 reconciliation，复杂度会上升。

因此，长期方案不应让玄知维护一套与 OpenClaw 平行的数据系统。

### 2.2 更符合 OpenClaw 的能力边界

当前已经确认 OpenClaw 提供或参考实现使用了这些能力：

| OpenClaw 能力 | 用途 |
|---|---|
| `agents.list` | 查看 Gateway 中真实 agent |
| `agents.create` | 创建用户对应 agent |
| `agents.update` | 更新 agent 名称、模型等配置 |
| `agents.files.get` | 读取 agent workspace 文件 |
| `agents.files.set` | 写入 `USER.md`、`AGENTS.md` 等配置文件 |
| `sessions.create` | 创建或复用会话 |
| `sessions.list` | 读取会话列表，映射为任务列表 |
| `chat.send` | 发送用户消息 |
| `tools.catalog` | 读取当前可用工具 |
| `doctor.memory.*` / memory-wiki | 读取 OpenClaw 记忆与知识状态 |

这些已经覆盖了玄知第一版最重要的数据对象：agent、配置、会话、任务投影、工具和记忆。

### 2.3 降低小团队部署成本

10 人以下团队更需要稳定、少组件、少维护：

- 不需要 SQLite/Postgres。
- 不需要数据库迁移。
- 不需要备份两套数据。
- OpenClaw workspace 成为统一可检查、可迁移、可恢复的位置。

## 3. 玄知负责什么

玄知只负责 OpenClaw 当前不适合直接承担的产品层能力。

| 能力 | 玄知职责 |
|---|---|
| 登录界面 | 用户名/密码、小团队账号切换、最近账号但不保存密码 |
| 登录态 | 当前前端会话 token；后续可替换为 OpenClaw identity |
| 用户隔离 | 根据当前用户推导 workspace 和 agent，只展示自己的内容 |
| 首次配置 | 收集姓名、角色、领域、偏好 |
| profile 转换 | 把配置转换为 OpenClaw 可读的 `USER.md`、`AGENTS.md` |
| UI 适配 | 把 OpenClaw agent/session/tool/memory 映射成玄知工作台 |
| 错误提示 | Gateway offline、profile sync failed、agent missing 等状态展示 |

## 4. 推荐数据流

### 4.1 登录与 agent 准备

```text
用户登录
  -> 玄知根据当前用户生成稳定 userId
  -> 生成 workspace: /home/lin123/.openclaw/workspace-xuanzhi-<userId>
  -> 调 agents.list
  -> 按 workspace 查找 OpenClaw agent
  -> 找到则复用
  -> 找不到则 agents.create
  -> 写 USER.md / AGENTS.md
  -> 返回当前用户的 agent 给前端
```

后端不需要保存 `gatewayAgentId` 作为长期事实。`gatewayAgentId` 每次都可以从 `agents.list + workspace` 推导回来。

### 4.2 首次配置

```text
用户填写配置
  -> 玄知校验表单
  -> agents.files.set(USER.md)
  -> agents.files.set(AGENTS.md)
  -> 可选 agents.update(name/model)
```

配置的真实落点是 OpenClaw agent workspace 文件，而不是玄知数据库。

### 4.3 任务列表

```text
前端请求任务列表
  -> 后端调用 sessions.list
  -> 按当前用户 agent/session key 过滤
  -> 映射成前端 TaskSummary
```

如果 OpenClaw 暂时没有足够详细的 session detail，玄知只做轻量投影，不伪造完整历史。

### 4.4 对话

```text
用户发送消息
  -> sessions.create 或复用 session
  -> chat.send
  -> OpenClaw 执行 agent、工具、记忆、workspace 操作
  -> 玄知监听 chat/tool events 并展示
```

玄知不再把任务 ID 或任务意图拼入用户消息。内部元数据应通过 OpenClaw session 参数、agent 文件或后续 metadata 通道传递。

## 5. 当前代码调整方向

当前应撤掉：

- `FileStore`
- `OpenClawWorkspaceStore`
- `XUANZHI_STORE_MODE`
- `XUANZHI_STORE_PATH`
- SQLite/file/memory 作为产品运行模式的说法

当前保留：

- `MemoryStore` 作为进程内运行态和测试夹具。
- OpenClaw Gateway client。
- profile 文件同步。
- workspace 推导。
- session/chat stream。

新增方向：

- `openclawNative.ts`：集中封装 OpenClaw 原生能力。
- 后续将 `/api/agents`、`/api/tasks`、`/api/gateway/*` 逐步从内存状态切到 OpenClaw RPC 投影。

## 6. 实施阶段

### 阶段一：OpenClaw 能力适配

- 封装 `agents.list`、`sessions.list`、`tools.catalog`、`agents.files.get/set`。
- 网关路由优先使用适配层。
- 保持现有前端能运行。

### 阶段二：agent 事实来源切换

- `/api/agents` 改为来自 `agents.list`。
- 按 workspace 过滤当前用户 agent。
- 登录后不依赖本地持久化映射。

### 阶段三：任务事实来源切换

- `/api/tasks` 改为来自 `sessions.list`。
- 当前聊天流只保留运行时状态，历史任务从 OpenClaw session 投影。
- **已完成 (2026-06-03):** session 列表通过 `taskFromSession()` 投影到侧边栏。
- **已完成 (2026-06-03):** 历史消息通过 `sessionService` 读取 JSONL fallback 实现，`messageService.listMessages()` 自动切换。
- 如果 OpenClaw 支持 `sessions.get` 或 `sessions.preview`，则优先使用 RPC 替代磁盘读取。

### 阶段四：配置与记忆

- Agent 设置页读取 `agents.files.get(USER.md/AGENTS.md)`。
- 设置保存写 `agents.files.set`。
- 记忆页读取 `doctor.memory.*` / memory-wiki。

## 7. 风险与约束

| 风险 | 处理 |
|---|---|
| OpenClaw 暂不支持完整 session detail | **已部分解决 (2026-06-03):** 新增 `sessionService` 直接读取 OpenClaw 磁盘 JSONL 文件获取历史消息。后续如 OpenClaw 提供 `sessions.get` RPC 则优先使用 |
| `agents.files.set` 不支持任意 JSON 文件名 | 只写 OpenClaw 已验证支持的 Markdown 文件 |
| 后端重启后本地会话 token 丢失 | 第一版接受重新登录；长期接 OpenClaw identity |
| Gateway offline | 前端明确提示，不用本地数据库伪装可用 |
| OpenClaw agent 被删除 | 登录时通过 workspace 查找，找不到则提示重建或自动创建 |

## 8. 结论

OpenClaw 原生能力优先的设计更适合玄知：

1. 数据事实来源统一。
2. 后端复杂度下降。
3. 小团队部署更轻。
4. 用户 agent 与 workspace 隔离更自然。
5. 后续可以直接继承 OpenClaw 的 session、memory、tools、workspace 能力。

玄知的价值不在于重新实现 OpenClaw 的存储和运行时，而在于把 OpenClaw 变成一个适合小团队使用的前端工作台。
