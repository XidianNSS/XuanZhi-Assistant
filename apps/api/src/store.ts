import { randomUUID } from 'node:crypto';

import type {
  AgentEvent,
  AgentEventStatus,
  Approval,
  ApprovalStatus,
  Artifact,
  ArtifactFormat,
  ArtifactType,
  AuthSession,
  Message,
  Task,
  TaskIntent,
  TaskStatus,
  User,
} from '@xuanzhi/shared/protocol';

const nowIso = () => new Date().toISOString();

// NOTE(auth): MVP 用固定测试账号验证多用户隔离；接入真实认证后应替换这里，
// 但仍要保留“业务对象归属以后端 currentUser 为准”的规则。
export const testUsers: User[] = [
  {
    id: 'user_a',
    name: '用户 A',
    email: 'user-a@example.com',
    createdAt: nowIso(),
  },
  {
    id: 'user_b',
    name: '用户 B',
    email: 'user-b@example.com',
    createdAt: nowIso(),
  },
];

// NOTE(storage): 第一阶段只需要验证 Agent 工作台闭环，内存 Map 可以让权限和 SSE
// 行为保持清晰。对象上冗余 userId 是为了让查询、审批和插件上报的归属判断更直接。
export class MemoryStore {
  readonly users = new Map<string, User>(testUsers.map((user) => [user.id, user]));
  readonly sessions = new Map<string, AuthSession>();
  readonly tasks = new Map<string, Task>();
  readonly messages = new Map<string, Message[]>();
  readonly events = new Map<string, AgentEvent[]>();
  readonly artifacts = new Map<string, Artifact[]>();
  readonly approvals = new Map<string, Approval>();

  findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email === email);
  }

  createSession(userId: string) {
    const session: AuthSession = {
      id: `session_${randomUUID()}`,
      userId,
      token: `token_${userId}_${randomUUID()}`,
      createdAt: nowIso(),
    };
    this.sessions.set(session.token, session);
    return session;
  }

  deleteSession(token: string) {
    this.sessions.delete(token);
  }

  getUserByToken(token: string) {
    const session = this.sessions.get(token);
    if (!session) {
      return undefined;
    }
    return this.users.get(session.userId);
  }

  createTask(input: { userId: string; title: string; userInput: string; intent: TaskIntent }) {
    const task: Task = {
      id: `task_${randomUUID()}`,
      userId: input.userId,
      title: input.title,
      userInput: input.userInput,
      intent: input.intent,
      status: 'created',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  updateTaskStatus(taskId: string, status: TaskStatus) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }
    const updated: Task = {
      ...task,
      status,
      updatedAt: nowIso(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  listTasksForUser(userId: string) {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getOwnedTask(taskId: string, userId: string) {
    const task = this.tasks.get(taskId);
    // 对调用方隐藏“任务不存在”和“任务属于其他用户”的区别，避免泄露跨用户资源。
    if (!task || task.userId !== userId) {
      return undefined;
    }
    return task;
  }

  addMessage(input: { userId: string; taskId: string; role: Message['role']; content: string }) {
    const message: Message = {
      id: `msg_${randomUUID()}`,
      userId: input.userId,
      taskId: input.taskId,
      role: input.role,
      content: input.content,
      createdAt: nowIso(),
    };
    this.messages.set(input.taskId, [...(this.messages.get(input.taskId) ?? []), message]);
    return message;
  }

  listMessages(taskId: string) {
    return this.messages.get(taskId) ?? [];
  }

  addEvent(input: {
    userId: string;
    taskId: string;
    type: string;
    title: string;
    message?: string;
    status?: AgentEventStatus;
    payload?: unknown;
  }) {
    const event: AgentEvent = {
      id: `evt_${randomUUID()}`,
      userId: input.userId,
      taskId: input.taskId,
      type: input.type,
      title: input.title,
      message: input.message,
      status: input.status,
      payload: input.payload,
      createdAt: nowIso(),
    };
    this.events.set(input.taskId, [...(this.events.get(input.taskId) ?? []), event]);
    return event;
  }

  listEvents(taskId: string) {
    return this.events.get(taskId) ?? [];
  }

  addArtifact(input: {
    userId: string;
    taskId: string;
    type: ArtifactType;
    title: string;
    format: ArtifactFormat;
    content: unknown;
  }) {
    const artifact: Artifact = {
      id: `art_${randomUUID()}`,
      userId: input.userId,
      taskId: input.taskId,
      type: input.type,
      title: input.title,
      format: input.format,
      content: input.content,
      createdAt: nowIso(),
    };
    this.artifacts.set(input.taskId, [...(this.artifacts.get(input.taskId) ?? []), artifact]);
    return artifact;
  }

  listArtifacts(taskId: string) {
    return this.artifacts.get(taskId) ?? [];
  }

  addApproval(input: {
    userId: string;
    taskId: string;
    title: string;
    description: string;
    action: string;
    payload: unknown;
  }) {
    const approval: Approval = {
      id: `appr_${randomUUID()}`,
      userId: input.userId,
      taskId: input.taskId,
      title: input.title,
      description: input.description,
      action: input.action,
      payload: input.payload,
      status: 'pending',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  updateApprovalStatus(approvalId: string, status: ApprovalStatus) {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return undefined;
    }
    const updated: Approval = {
      ...approval,
      status,
      updatedAt: nowIso(),
    };
    this.approvals.set(approvalId, updated);
    return updated;
  }

  getApproval(approvalId: string) {
    return this.approvals.get(approvalId);
  }

  listApprovals(taskId: string) {
    return [...this.approvals.values()].filter((approval) => approval.taskId === taskId);
  }
}
