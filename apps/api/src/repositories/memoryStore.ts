import { hashSync, compareSync } from 'bcryptjs';
import { randomUUID } from 'node:crypto';

import type {
  Agent,
  AgentStatus,
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
  UserRole,
} from '@xuanzhi/shared/protocol';

const nowIso = () => new Date().toISOString();

const BCRYPT_ROUNDS = 10;

const DEV_PASSWORD_HASH = hashSync('dev-password', BCRYPT_ROUNDS);

export const testUsers: User[] = [
  {
    id: 'user_admin',
    name: '管理员',
    email: 'admin@example.com',
    role: 'admin' as UserRole,
    createdAt: nowIso(),
  },
  {
    id: 'user_a',
    name: '用户 A',
    email: 'user-a@example.com',
    role: 'user' as UserRole,
    createdAt: nowIso(),
  },
  {
    id: 'user_b',
    name: '用户 B',
    email: 'user-b@example.com',
    role: 'user' as UserRole,
    createdAt: nowIso(),
  },
];

export class MemoryStore {
  readonly users = new Map<string, User>(testUsers.map((user) => [user.id, user]));
  readonly passwordHashes = new Map<string, string>(
    testUsers.map((user) => [user.id, DEV_PASSWORD_HASH]),
  );
  readonly sessions = new Map<string, AuthSession>();
  readonly tasks = new Map<string, Task>();
  readonly messages = new Map<string, Message[]>();
  readonly events = new Map<string, AgentEvent[]>();
  readonly artifacts = new Map<string, Artifact[]>();
  readonly approvals = new Map<string, Approval>();
  readonly agents = new Map<string, Agent>();

  // ── User ──

  findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email === email);
  }

  getUserById(userId: string) {
    return this.users.get(userId);
  }

  listUsers() {
    return [...this.users.values()];
  }

  createUser(input: { email: string; name: string; password: string; role?: UserRole }) {
    const id = `user_${randomUUID()}`;
    const user: User = {
      id,
      name: input.name,
      email: input.email,
      role: input.role ?? 'user',
      createdAt: nowIso(),
    };
    this.users.set(id, user);
    this.passwordHashes.set(id, hashSync(input.password, BCRYPT_ROUNDS));
    return user;
  }

  verifyPassword(userId: string, password: string) {
    const hash = this.passwordHashes.get(userId);
    if (!hash) return false;
    return compareSync(password, hash);
  }

  // ── Session ──

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

  // ── Task ──

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

  listAllTasks() {
    return [...this.tasks.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getOwnedTask(taskId: string, userId: string) {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return undefined;
    }
    return task;
  }

  // ── Message ──

  addMessage(input: {
    userId: string;
    taskId: string;
    role: Message['role'];
    content: string;
    status?: Message['status'];
  }) {
    const message: Message = {
      id: `msg_${randomUUID()}`,
      userId: input.userId,
      taskId: input.taskId,
      role: input.role,
      content: input.content,
      status: input.status,
      createdAt: nowIso(),
    };
    this.messages.set(input.taskId, [...(this.messages.get(input.taskId) ?? []), message]);
    return message;
  }

  updateMessage(taskId: string, messageId: string, input: { content?: string; status?: Message['status'] }) {
    const messages = this.messages.get(taskId);
    if (!messages) {
      return undefined;
    }

    const current = messages.find((message) => message.id === messageId);
    if (!current) {
      return undefined;
    }

    const updated: Message = {
      ...current,
      content: input.content ?? current.content,
      status: input.status ?? current.status,
    };
    this.messages.set(
      taskId,
      messages.map((message) => (message.id === messageId ? updated : message)),
    );
    return updated;
  }

  listMessages(taskId: string) {
    return this.messages.get(taskId) ?? [];
  }

  // ── Event ──

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

  // ── Artifact ──

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

  // ── Approval ──

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

  // ── Agent ──

  createAgent(input: { userId: string; name: string; gatewayAgentId?: string; workspace?: string }) {
    const id = `agent_${randomUUID()}`;
    const agent: Agent = {
      id,
      userId: input.userId,
      name: input.name,
      gatewayAgentId: input.gatewayAgentId ?? null,
      workspace: input.workspace ?? '',
      sessionKey: `xuanzhi:session:${id}`,
      status: 'offline',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  updateAgentGatewayInfo(agentId: string, gatewayAgentId: string, workspace: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    const updated: Agent = {
      ...agent,
      gatewayAgentId,
      workspace,
      updatedAt: nowIso(),
    };
    this.agents.set(agentId, updated);
    return updated;
  }

  getAgent(agentId: string) {
    return this.agents.get(agentId);
  }

  getAgentByUserId(userId: string) {
    return [...this.agents.values()].find((agent) => agent.userId === userId);
  }

  listAgents() {
    return [...this.agents.values()];
  }

  listAgentsByUserId(userId: string) {
    return [...this.agents.values()].filter((agent) => agent.userId === userId);
  }

  updateAgentStatus(agentId: string, status: AgentStatus) {
    const agent = this.agents.get(agentId);
    if (!agent) return undefined;
    const updated: Agent = {
      ...agent,
      status,
      updatedAt: nowIso(),
    };
    this.agents.set(agentId, updated);
    return updated;
  }

  // ── Stats ──

  getStats() {
    const allTasks = [...this.tasks.values()];
    return {
      users: this.users.size,
      agents: this.agents.size,
      tasks: {
        total: allTasks.length,
        running: allTasks.filter((t) => t.status === 'running').length,
        completed: allTasks.filter((t) => t.status === 'completed').length,
        failed: allTasks.filter((t) => t.status === 'failed').length,
      },
    };
  }
}
