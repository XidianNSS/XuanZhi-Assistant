# 01. 前端实现说明

## 1. 前端职责

前端负责把 Agent 执行过程做成可视化工作台，并在多用户场景下维护当前登录用户上下文。

前端不直接调用 OpenClaw。前端只调用玄知后端 API。

```text
前端 React -> 玄知后端 API -> OpenClaw
```

所有需要访问用户数据的 API 请求都必须携带认证信息：

```http
Authorization: Bearer <token>
```

前端不直接传 `userId` 给业务接口。任务归属由后端根据当前登录用户决定。

## 2. 第一版需要实现的页面

### 2.1 登录页 LoginPage

用途：用户进入系统前完成身份识别。

MVP 可以先使用简单账号登录，不需要接入完整 SSO。

需要包含：

- 邮箱或用户名输入框
- 密码输入框，或 MVP 临时登录码
- 登录按钮
- 登录失败提示

调用：

```http
POST /api/auth/login
GET /api/auth/me
```

登录成功后：

- 保存 token
- 拉取 currentUser
- 进入 HomePage 或最近任务页

### 2.2 首页 HomePage

用途：用户进入系统后的默认页面。

需要包含：

- 欢迎语
- 当前用户信息入口
- 任务输入框
- 快捷任务卡片
- 能力开关，例如“工具调用”“知识库”“联网搜索”，MVP 可先只是 UI 状态
- 左侧任务列表入口

### 2.3 任务页 TaskPage

用途：展示某个任务的完整执行过程。

推荐三栏布局：

```text
左侧：任务列表
中间：聊天消息 + 输入框 + 审批卡片
右侧：执行过程 Timeline + 中间产物 Artifact
```

TaskPage 加载时必须确认：

- 当前用户已登录
- 当前 task 由后端鉴权通过
- SSE 只订阅当前 task
- 组件卸载或切换 task 时关闭旧 SSE

## 3. 第一版需要实现的组件

### 3.1 TaskSidebar

职责：

- 展示当前用户的任务列表
- 支持点击切换任务
- 展示任务状态

状态样式建议：

| 状态 | 展示 |
|---|---|
| created | 已创建 |
| planning | 规划中 |
| running | 执行中 |
| waiting_approval | 等待确认 |
| completed | 已完成 |
| failed | 失败 |

### 3.2 ChatPanel

职责：

- 展示用户消息
- 展示 Agent 消息
- 显示系统提示
- 承载 ApprovalCard

建议使用 Ant Design X 的 Bubble / Conversations / Sender 等组件。

### 3.3 MessageComposer

职责：

- 用户输入任务或补充信息
- 发送消息到后端
- 发送成功后清空输入框

调用：

```http
POST /api/tasks/:taskId/messages
```

### 3.4 AgentTimeline

职责：

- 展示 Agent 执行过程
- 根据 SSE event 实时更新

事件示例：

```json
{
  "type": "agent.plan.created",
  "title": "已生成执行计划",
  "status": "success"
}
```

### 3.5 ArtifactPanel

职责：

- 展示中间产物列表
- 点击后展示详情
- 支持不同产物类型

MVP 支持：

| 类型 | 展示方式 |
|---|---|
| plan | Markdown |
| meeting_draft | JSON/表单卡片 |
| tool_result | JSON |
| final_answer | Markdown |

### 3.6 ApprovalCard

职责：

- 展示等待用户确认的动作
- 用户可以点击“确认”或“拒绝”

调用：

```http
POST /api/approvals/:approvalId/approve
POST /api/approvals/:approvalId/reject
```

### 3.7 UserMenu

职责：

- 展示当前用户名称
- 提供退出登录入口
- 退出登录后清空本地 token、currentUser、任务状态
- 退出登录或切换用户时关闭所有 SSE 连接

## 4. 前端目录建议

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
      TaskSidebar.tsx

    chat/
      ChatPanel.tsx
      MessageComposer.tsx
      ApprovalCard.tsx

    user/
      UserMenu.tsx

    agent/
      AgentTimeline.tsx
      AgentStatusBar.tsx
      ToolCallCard.tsx

    artifacts/
      ArtifactPanel.tsx
      ArtifactList.tsx
      ArtifactViewer.tsx
      PlanViewer.tsx
      MeetingDraftViewer.tsx
      JsonViewer.tsx

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

## 5. 前端调用 API

建议统一封装请求方法，避免每个接口重复处理认证头：

```ts
export async function authFetch(path: string, init: RequestInit = {}) {
  const token = getAuthToken();

  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json');
  }
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  return fetch(path, {
    ...init,
    headers,
  });
}
```

### 5.1 创建任务

```ts
export async function createTask(input: {
  title?: string;
  userInput: string;
  intent?: string;
}) {
  const res = await authFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

注意：创建任务时不要传 `userId`。后端必须根据认证 token 中的 currentUser 写入 `userId`。

### 5.2 发送消息

```ts
export async function sendTaskMessage(taskId: string, content: string) {
  const res = await authFetch(`/api/tasks/${taskId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      role: 'user',
      content,
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### 5.3 订阅任务流

```ts
export function subscribeTaskStream(
  taskId: string,
  onMessage: (data: any) => void,
  onError?: (error: Event) => void,
) {
  const source = new EventSource(`/api/tasks/${taskId}/stream`);

  source.onmessage = (event) => {
    onMessage(JSON.parse(event.data));
  };

  source.onerror = (error) => {
    onError?.(error);
  };

  return () => source.close();
}
```

如果使用 `EventSource` 无法自定义 `Authorization` header，MVP 可以使用以下方式之一：

1. 使用同站 Cookie 保存会话。
2. 使用 `/api/tasks/:taskId/stream?token=...`，但仅限开发阶段，生产环境不建议把长期 token 放在 URL。

无论采用哪种方式，后端都必须校验当前用户是否拥有该 task。

### 5.4 审批确认

```ts
export async function approveApproval(approvalId: string) {
  const res = await authFetch(`/api/approvals/${approvalId}/approve`, {
    method: 'POST',
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

## 6. 前端状态管理

MVP 可使用 Zustand，也可以先用 React state。

建议状态：

```ts
type User = {
  id: string;
  name: string;
  email?: string;
};

type TaskState = {
  currentUser?: User;
  token?: string;
  tasks: Task[];
  currentTaskId?: string;
  messages: Record<string, Message[]>;
  events: Record<string, AgentEvent[]>;
  artifacts: Record<string, Artifact[]>;
  approvals: Record<string, Approval[]>;
};
```

多用户状态规则：

- 登录成功后写入 `currentUser` 和 `token`
- `GET /api/tasks` 只返回当前用户任务
- 切换用户或登出时必须清空所有任务缓存
- 切换任务或登出时必须关闭 SSE
- 不允许前端通过修改 `userId` 访问其他用户数据

## 7. MVP 前端验收标准

完成后前端需要做到：

- 可以登录
- 可以获取当前用户
- 可以创建任务
- 可以发送消息
- 可以展示任务列表
- 可以通过 SSE 实时收到事件
- 可以展示 Timeline
- 可以展示 Artifact
- 可以展示 ApprovalCard
- 可以点击确认/拒绝
- 任务完成后能显示最终状态
- 用户 A 登录后看不到用户 B 的任务
- 用户登出后本地任务数据和 SSE 连接被清理
