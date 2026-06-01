// 前后端和插件文档共用的协议单一来源。userId 在业务对象上冗余保存，
// 是为了让权限校验、列表查询和插件上报归属反查都不依赖前端参数。
export type UserRole = 'user' | 'admin';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  token: string;
  createdAt: string;
  expiresAt?: string;
};

export type TaskStatus = 'created' | 'planning' | 'running' | 'waiting_approval' | 'completed' | 'failed';

export type TaskIntent = 'meeting' | 'business' | 'coding' | 'qa' | 'general';

export type MessageStatus = 'streaming' | 'completed' | 'failed';

export type Task = {
  id: string;
  userId: string;
  title: string;
  userInput: string;
  intent: TaskIntent;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  userId: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: MessageStatus;
  createdAt: string;
};

export type AgentEventStatus = 'pending' | 'running' | 'success' | 'error' | 'waiting';

export type AgentEvent = {
  id: string;
  userId: string;
  taskId: string;
  type: string;
  title: string;
  message?: string;
  status?: AgentEventStatus;
  payload?: unknown;
  createdAt: string;
};

export type ArtifactType = 'plan' | 'meeting_draft' | 'code_diff' | 'report' | 'tool_result' | 'final_answer';

export type ArtifactFormat = 'markdown' | 'json' | 'diff' | 'text';

export type Artifact = {
  id: string;
  userId: string;
  taskId: string;
  type: ArtifactType;
  title: string;
  format: ArtifactFormat;
  content: unknown;
  createdAt: string;
};

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type Approval = {
  id: string;
  userId: string;
  taskId: string;
  title: string;
  description: string;
  action: string;
  payload: unknown;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt: string;
};

export type StreamEvent =
  | { type: 'task.updated'; data: Task }
  | { type: 'message.created'; data: Message }
  | { type: 'message.updated'; data: Message }
  | { type: 'agent.event.created'; data: AgentEvent }
  | { type: 'artifact.created'; data: Artifact }
  | { type: 'approval.requested'; data: Approval }
  | { type: 'approval.updated'; data: Approval };

export type LoginResponse = {
  token: string;
  user: User;
};

export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

export type AgentStatus = 'offline' | 'idle' | 'running' | 'error';

export type Agent = {
  id: string;
  userId: string;
  name: string;
  /** OpenClaw Gateway agent ID (returned by agents.create RPC) */
  gatewayAgentId: string | null;
  /** Agent workspace directory on the Gateway host */
  workspace: string;
  sessionKey: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
};
