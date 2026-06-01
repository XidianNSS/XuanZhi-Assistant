import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

import type { FastifyInstance } from 'fastify';
import type { AgentEvent, Approval, Artifact, LoginResponse, Message, Task, TaskIntent } from '@xuanzhi/shared/protocol';

async function login(app: FastifyInstance, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email,
      password: 'dev-password',
    },
  });

  expect(response.statusCode).toBe(200);
  return response.json<LoginResponse>();
}

async function createTask(
  app: FastifyInstance,
  token: string,
  userInput: string,
  options: { intent?: TaskIntent; title?: string } = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      title: (options.title ?? userInput.trim().slice(0, 28)) || '新任务',
      userInput,
      intent: options.intent ?? 'meeting',
      userId: 'spoofed-user',
    },
  });

  expect(response.statusCode).toBe(201);
  return response.json<Task>();
}

async function sendUserMessage(app: FastifyInstance, token: string, taskId: string, content: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/tasks/${taskId}/messages`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      role: 'user',
      content,
    },
  });

  expect(response.statusCode).toBe(201);
  return response.json<Message>();
}

describe('xuanzhi api mvp', () => {
  let app: FastifyInstance;
  const previousAgentRuntime = process.env.XUANZHI_AGENT_RUNTIME;

  beforeEach(async () => {
    process.env.XUANZHI_AGENT_RUNTIME = 'mock';
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (previousAgentRuntime === undefined) {
      delete process.env.XUANZHI_AGENT_RUNTIME;
    } else {
      process.env.XUANZHI_AGENT_RUNTIME = previousAgentRuntime;
    }
  });

  it('authenticates test users and resolves currentUser from bearer token', async () => {
    const { token, user } = await login(app, 'user-a@example.com');

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json<{ user: LoginResponse['user'] }>().user).toMatchObject({
      id: user.id,
      email: 'user-a@example.com',
    });
  });

  it('binds tasks to currentUser and keeps task lists isolated', async () => {
    const userA = await login(app, 'user-a@example.com');
    const userB = await login(app, 'user-b@example.com');

    const taskA = await createTask(app, userA.token, '下周三上午帮我预约张三开项目复盘会');
    const taskB = await createTask(app, userB.token, '整理销售周报');

    expect(taskA.userId).toBe(userA.user.id);
    expect(taskB.userId).toBe(userB.user.id);

    const tasksAResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
    });
    const tasksBResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${userB.token}`,
      },
    });

    expect(tasksAResponse.json<Task[]>()).toHaveLength(1);
    expect(tasksAResponse.json<Task[]>()[0].id).toBe(taskA.id);
    expect(tasksBResponse.json<Task[]>()).toHaveLength(1);
    expect(tasksBResponse.json<Task[]>()[0].id).toBe(taskB.id);

    const forbiddenDetail = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskB.id}`,
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
    });

    expect(forbiddenDetail.statusCode).toBe(404);
  });

  it('creates mock agent events, artifacts, and approval after a user message', async () => {
    const userA = await login(app, 'user-a@example.com');
    const task = await createTask(app, userA.token, '下周三上午帮我预约张三开项目复盘会');

    await sendUserMessage(app, userA.token, task.id, task.userInput);

    const [eventsResponse, artifactsResponse, approvalsResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/events`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/artifacts`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/approvals`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
    ]);

    const events = eventsResponse.json<AgentEvent[]>();
    const artifacts = artifactsResponse.json<Artifact[]>();
    const approvals = approvalsResponse.json<Approval[]>();

    expect(events.map((event) => event.title)).toEqual([
      '已创建任务',
      '已收到用户输入',
      '正在分析任务',
      '已生成执行计划',
      '已生成会议草稿',
      '等待用户确认是否创建会议',
    ]);
    expect(artifacts.map((artifact) => artifact.type)).toEqual(['plan', 'meeting_draft']);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      userId: userA.user.id,
      taskId: task.id,
      status: 'pending',
    });
  });

  it('answers knowledge-base questions without requesting a calendar approval on the first message', async () => {
    const userA = await login(app, 'user-a@example.com');
    const prompt = '基于上传的知识库资料，回答用户问题时如何展示来源和置信度？';
    const task = await createTask(app, userA.token, prompt);

    await sendUserMessage(app, userA.token, task.id, task.userInput);

    const [taskResponse, messagesResponse, artifactsResponse, approvalsResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/messages`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/artifacts`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/approvals`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
    ]);

    const messages = messagesResponse.json<Message[]>();
    const artifacts = artifactsResponse.json<Artifact[]>();
    const approvals = approvalsResponse.json<Approval[]>();

    expect(taskResponse.json<Task>().status).toBe('completed');
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages.at(-1)?.content).toContain('来源');
    expect(artifacts.map((artifact) => artifact.type)).not.toContain('meeting_draft');
    expect(approvals).toHaveLength(0);
  });

  it('keeps a task conversation open for follow-up user messages', async () => {
    const userA = await login(app, 'user-a@example.com');
    const task = await createTask(app, userA.token, '帮我创建一封邮件');

    await sendUserMessage(app, userA.token, task.id, task.userInput);
    await sendUserMessage(app, userA.token, task.id, '再补充一下收件人是张三');

    const messagesResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/messages`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const eventsResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/events`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    const messages = messagesResponse.json<Message[]>();
    const events = eventsResponse.json<AgentEvent[]>();

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages.at(-1)?.content).toContain('再补充一下收件人是张三');
    expect(events.at(-1)).toMatchObject({
      type: 'task.followup.responded',
      status: 'success',
    });
  });

  it('prevents another user from reading streams or approving approvals they do not own', async () => {
    const userA = await login(app, 'user-a@example.com');
    const userB = await login(app, 'user-b@example.com');
    const task = await createTask(app, userA.token, '下周三上午帮我预约张三开项目复盘会');
    await sendUserMessage(app, userA.token, task.id, task.userInput);

    const approvalsResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/approvals`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const approval = approvalsResponse.json<Approval[]>()[0];

    const rejectedApproval = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/approve`,
      headers: { authorization: `Bearer ${userB.token}` },
    });

    const rejectedStream = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/stream?token=${encodeURIComponent(userB.token)}`,
    });

    expect(rejectedApproval.statusCode).toBe(404);
    expect(rejectedStream.statusCode).toBe(404);
  });

  it('approves owned approvals and completes the mock task', async () => {
    const userA = await login(app, 'user-a@example.com');
    const task = await createTask(app, userA.token, '下周三上午帮我预约张三开项目复盘会');
    await sendUserMessage(app, userA.token, task.id, task.userInput);

    const approvalsResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/approvals`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const approval = approvalsResponse.json<Approval[]>()[0];

    const approveResponse = await app.inject({
      method: 'POST',
      url: `/api/approvals/${approval.id}/approve`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json<Approval>()).toMatchObject({
      status: 'approved',
      userId: userA.user.id,
    });

    const taskResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const eventsResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/events`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const messagesResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/messages`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(taskResponse.json<Task>().status).toBe('completed');
    expect(eventsResponse.json<AgentEvent[]>().at(-1)?.title).toBe('任务已完成');
    expect(messagesResponse.json<Message[]>().at(-1)).toMatchObject({
      role: 'assistant',
      content: '已确认创建会议，任务已完成。',
    });
  });

  it('accepts plugin writes with service token and ignores spoofed userId in payloads', async () => {
    const userA = await login(app, 'user-a@example.com');
    const task = await createTask(app, userA.token, '生成项目计划');

    const eventResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/events`,
      headers: {
        authorization: 'Bearer dev-token',
      },
      payload: {
        userId: 'user_b',
        type: 'plugin.event',
        title: '插件事件',
        status: 'success',
      },
    });

    expect(eventResponse.statusCode).toBe(201);
    expect(eventResponse.json<AgentEvent>()).toMatchObject({
      userId: userA.user.id,
      taskId: task.id,
      title: '插件事件',
    });
  });
});
