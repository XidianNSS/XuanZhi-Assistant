import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

import type {
  AgentEventStatus,
  ArtifactFormat,
  ArtifactType,
  Message,
  TaskIntent,
  TaskStatus,
  User,
} from '@xuanzhi/shared/protocol';

import { runMockAgent } from './mockAgent.js';
import { MemoryStore } from './store.js';
import { StreamHub } from './stream.js';

type AuthContext =
  | {
      kind: 'user';
      user: User;
      token: string;
    }
  | {
      kind: 'service';
    };

// NOTE(auth): 这是 OpenClaw 插件到玄知后端的服务级凭证，不是用户登录 token。
// 业务数据归属仍然只能由 taskId 反查 task.userId 决定。
const serviceToken = process.env.XUANZHI_API_TOKEN ?? 'dev-token';

const taskStatuses = new Set<TaskStatus>(['created', 'planning', 'running', 'waiting_approval', 'completed', 'failed']);
const taskIntents = new Set<TaskIntent>(['meeting', 'business', 'coding', 'qa', 'general']);
const artifactTypes = new Set<ArtifactType>(['plan', 'meeting_draft', 'code_diff', 'report', 'tool_result', 'final_answer']);
const artifactFormats = new Set<ArtifactFormat>(['markdown', 'json', 'diff', 'text']);
const eventStatuses = new Set<AgentEventStatus>(['pending', 'running', 'success', 'error', 'waiting']);

function bearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }
  return authorization.slice('Bearer '.length).trim();
}

function queryToken(request: FastifyRequest) {
  const query = request.query as { token?: string };
  return typeof query.token === 'string' ? query.token : undefined;
}

function getAuth(request: FastifyRequest, store: MemoryStore): AuthContext | undefined {
  const token = bearerToken(request);
  if (!token) {
    return undefined;
  }
  if (token === serviceToken) {
    return { kind: 'service' };
  }
  const user = store.getUserByToken(token);
  if (!user) {
    return undefined;
  }
  return { kind: 'user', user, token };
}

function getUserAuth(request: FastifyRequest, store: MemoryStore) {
  // NOTE(sse): 原生 EventSource 不能设置 Authorization header，MVP 开发期允许
  // token 放在查询参数里；后续仍必须在具体资源上做 userId 归属校验。
  const token = bearerToken(request) ?? queryToken(request);
  if (!token || token === serviceToken) {
    return undefined;
  }
  const user = store.getUserByToken(token);
  if (!user) {
    return undefined;
  }
  return { user, token };
}

function titleFromInput(userInput: string) {
  const title = userInput.trim().replace(/\s+/g, ' ').slice(0, 28);
  return title || '新任务';
}

export function buildApp() {
  const app = Fastify({ logger: false });
  const store = new MemoryStore();
  const stream = new StreamHub();

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
    reply.header('access-control-allow-headers', 'content-type,authorization');
  });

  app.options('/*', async (_request, reply) => reply.status(204).send());

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const user = body.email ? store.findUserByEmail(body.email) : undefined;
    if (!user || body.password !== 'dev-password') {
      return reply.status(401).send({ message: '邮箱或密码错误' });
    }
    const session = store.createSession(user.id);
    return { token: session.token, user };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    return { user: auth.user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    store.deleteSession(auth.token);
    return reply.status(204).send();
  });

  app.post('/api/tasks', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    const body = request.body as { title?: string; userInput?: string; intent?: TaskIntent };
    const userInput = body.userInput?.trim();
    if (!userInput) {
      return reply.status(400).send({ message: '请输入任务内容' });
    }
    const intent = body.intent && taskIntents.has(body.intent) ? body.intent : 'general';
    const task = store.createTask({
      // WARNING(auth): 前端不允许决定 userId，创建任务时只能使用认证中间件解析出的当前用户。
      userId: auth.user.id,
      title: body.title?.trim() || titleFromInput(userInput),
      userInput,
      intent,
    });
    const event = store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'task.created',
      title: '已创建任务',
      status: 'success',
    });
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
    return reply.status(201).send(task);
  });

  app.get('/api/tasks', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    return store.listTasksForUser(auth.user.id);
  });

  app.get('/api/tasks/:taskId', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    const { taskId } = request.params as { taskId: string };
    const task = store.getOwnedTask(taskId, auth.user.id);
    if (!task) {
      return reply.status(404).send({ message: '任务不存在' });
    }
    return task;
  });

  app.patch('/api/tasks/:taskId/status', async (request, reply) => {
    const auth = getAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未授权' });
    }
    const { taskId } = request.params as { taskId: string };
    const body = request.body as { status?: TaskStatus };
    if (!body.status || !taskStatuses.has(body.status)) {
      return reply.status(400).send({ message: '任务状态无效' });
    }
    const task = store.tasks.get(taskId);
    if (!task || (auth.kind === 'user' && task.userId !== auth.user.id)) {
      return reply.status(404).send({ message: '任务不存在' });
    }
    const updated = store.updateTaskStatus(taskId, body.status);
    if (!updated) {
      return reply.status(404).send({ message: '任务不存在' });
    }
    stream.broadcast(taskId, { type: 'task.updated', data: updated });
    return updated;
  });

  app.post('/api/tasks/:taskId/messages', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    const { taskId } = request.params as { taskId: string };
    const task = store.getOwnedTask(taskId, auth.user.id);
    if (!task) {
      return reply.status(404).send({ message: '任务不存在' });
    }
    const body = request.body as { role?: Message['role']; content?: string };
    const content = body.content?.trim();
    if (!content) {
      return reply.status(400).send({ message: '消息内容不能为空' });
    }
    const message = store.addMessage({
      userId: auth.user.id,
      taskId,
      role: body.role === 'assistant' || body.role === 'system' ? body.role : 'user',
      content,
    });
    stream.broadcast(taskId, { type: 'message.created', data: message });

    if (message.role === 'user' && store.listApprovals(taskId).length === 0) {
      // NOTE(mock-agent): MVP 阶段只在首条用户消息后启动一次 Mock Agent，
      // 避免同一任务重复生成审批链，便于验证端到端闭环。
      runMockAgent(task, store, stream);
    }

    return reply.status(201).send(message);
  });

  app.get('/api/tasks/:taskId/messages', async (request, reply) => {
    const task = requireOwnedTask(request, reply, store);
    if (!task) return;
    return store.listMessages(task.id);
  });

  app.post('/api/tasks/:taskId/events', async (request, reply) => {
    const task = requireWritableTask(request, reply, store);
    if (!task) return;
    const body = request.body as { type?: string; title?: string; message?: string; status?: AgentEventStatus; payload?: unknown };
    if (!body.type || !body.title) {
      return reply.status(400).send({ message: '事件 type 和 title 必填' });
    }
    const event = store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: body.type,
      title: body.title,
      message: body.message,
      status: body.status && eventStatuses.has(body.status) ? body.status : undefined,
      payload: body.payload,
    });
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
    return reply.status(201).send(event);
  });

  app.get('/api/tasks/:taskId/events', async (request, reply) => {
    const task = requireOwnedTask(request, reply, store);
    if (!task) return;
    return store.listEvents(task.id);
  });

  app.post('/api/tasks/:taskId/artifacts', async (request, reply) => {
    const task = requireWritableTask(request, reply, store);
    if (!task) return;
    const body = request.body as {
      type?: ArtifactType;
      title?: string;
      format?: ArtifactFormat;
      content?: unknown;
    };
    if (!body.type || !artifactTypes.has(body.type) || !body.title || !body.format || !artifactFormats.has(body.format)) {
      return reply.status(400).send({ message: '产物参数无效' });
    }
    const artifact = store.addArtifact({
      userId: task.userId,
      taskId: task.id,
      type: body.type,
      title: body.title,
      format: body.format,
      content: body.content,
    });
    stream.broadcast(task.id, { type: 'artifact.created', data: artifact });
    return reply.status(201).send(artifact);
  });

  app.get('/api/tasks/:taskId/artifacts', async (request, reply) => {
    const task = requireOwnedTask(request, reply, store);
    if (!task) return;
    return store.listArtifacts(task.id);
  });

  app.post('/api/tasks/:taskId/approvals', async (request, reply) => {
    const task = requireWritableTask(request, reply, store);
    if (!task) return;
    const body = request.body as { title?: string; description?: string; action?: string; payload?: unknown };
    if (!body.title || !body.description || !body.action) {
      return reply.status(400).send({ message: '审批 title、description 和 action 必填' });
    }
    const approval = store.addApproval({
      userId: task.userId,
      taskId: task.id,
      title: body.title,
      description: body.description,
      action: body.action,
      payload: body.payload,
    });
    stream.broadcast(task.id, { type: 'approval.requested', data: approval });
    return reply.status(201).send(approval);
  });

  app.get('/api/tasks/:taskId/approvals', async (request, reply) => {
    const task = requireOwnedTask(request, reply, store);
    if (!task) return;
    return store.listApprovals(task.id);
  });

  app.post('/api/approvals/:approvalId/approve', async (request, reply) => {
    return updateApproval(request, reply, store, stream, 'approved');
  });

  app.post('/api/approvals/:approvalId/reject', async (request, reply) => {
    return updateApproval(request, reply, store, stream, 'rejected');
  });

  app.get('/api/tasks/:taskId/stream', async (request, reply) => {
    const auth = getUserAuth(request, store);
    if (!auth) {
      return reply.status(401).send({ message: '未登录' });
    }
    const { taskId } = request.params as { taskId: string };
    const task = store.getOwnedTask(taskId, auth.user.id);
    if (!task) {
      return reply.status(404).send({ message: '任务不存在' });
    }

    // WARNING(sse): 必须先完成用户认证和 task 归属校验，再 hijack 响应；
    // 否则长连接会绕过普通 JSON 错误返回，造成跨用户订阅风险。
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    });
    reply.raw.write(': connected\n\n');
    const remove = stream.add(taskId, reply.raw);
    request.raw.on('close', remove);
    reply.hijack();
  });

  return app;
}

function requireOwnedTask(request: FastifyRequest, reply: FastifyReply, store: MemoryStore) {
  const auth = getUserAuth(request, store);
  if (!auth) {
    void reply.status(401).send({ message: '未登录' });
    return undefined;
  }
  const { taskId } = request.params as { taskId: string };
  const task = store.getOwnedTask(taskId, auth.user.id);
  if (!task) {
    void reply.status(404).send({ message: '任务不存在' });
    return undefined;
  }
  return task;
}

function requireWritableTask(request: FastifyRequest, reply: FastifyReply, store: MemoryStore) {
  const auth = getAuth(request, store);
  if (!auth) {
    void reply.status(401).send({ message: '未授权' });
    return undefined;
  }
  const { taskId } = request.params as { taskId: string };
  const task = store.tasks.get(taskId);
  // 用户态写入必须拥有任务；服务态写入只用 taskId 定位任务，并由后端反查 userId。
  // 对“不存在”和“无权访问”统一返回 404，避免暴露其他用户的任务存在性。
  if (!task || (auth.kind === 'user' && task.userId !== auth.user.id)) {
    void reply.status(404).send({ message: '任务不存在' });
    return undefined;
  }
  return task;
}

function updateApproval(
  request: FastifyRequest,
  reply: FastifyReply,
  store: MemoryStore,
  stream: StreamHub,
  status: 'approved' | 'rejected',
) {
  const auth = getUserAuth(request, store);
  if (!auth) {
    return reply.status(401).send({ message: '未登录' });
  }
  const { approvalId } = request.params as { approvalId: string };
  const approval = store.getApproval(approvalId);
  // 审批是状态流转入口，必须先按 approval.userId 校验，再更新审批和任务状态。
  if (!approval || approval.userId !== auth.user.id) {
    return reply.status(404).send({ message: '审批不存在' });
  }
  const updated = store.updateApprovalStatus(approvalId, status);
  if (!updated) {
    return reply.status(404).send({ message: '审批不存在' });
  }
  stream.broadcast(updated.taskId, { type: 'approval.updated', data: updated });

  const userEvent = store.addEvent({
    userId: updated.userId,
    taskId: updated.taskId,
    type: status === 'approved' ? 'approval.approved' : 'approval.rejected',
    title: status === 'approved' ? '用户已确认' : '用户已拒绝',
    status: status === 'approved' ? 'success' : 'error',
  });
  stream.broadcast(updated.taskId, { type: 'agent.event.created', data: userEvent });

  const task = store.updateTaskStatus(updated.taskId, status === 'approved' ? 'completed' : 'failed');
  if (task) {
    const finalEvent = store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: status === 'approved' ? 'task.completed' : 'task.failed',
      title: status === 'approved' ? '任务已完成' : '任务已取消',
      status: status === 'approved' ? 'success' : 'error',
    });
    stream.broadcast(task.id, { type: 'agent.event.created', data: finalEvent });
    stream.broadcast(task.id, { type: 'task.updated', data: task });
  }

  return updated;
}
