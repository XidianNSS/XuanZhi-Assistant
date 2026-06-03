import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FastifyInstance } from 'fastify';
import type { AgentEvent, LoginResponse, Message, Task, TaskIntent, XuanzhiAgentProfile } from '@xuanzhi/shared/protocol';

const gateway = vi.hoisted(() => {
  type Handler = (payload: unknown) => void;

  const handlers = new Map<string, Set<Handler>>();
  const calls: Array<{ method: string; params?: unknown }> = [];
  const agents: Array<{ id: string; name: string; workspace: string }> = [];
  const sessions: Array<{ key: string; title: string; agentId: string; createdAt: string; updatedAt: string }> = [];
  let agentSequence = 0;
  let shouldFailProfileWrites = false;

  const emit = (event: string, payload: unknown) => {
    for (const handler of handlers.get(event) ?? []) {
      handler(payload);
    }
  };

  const client = {
    isConnected: vi.fn(() => true),
    connect: vi.fn(async () => undefined),
    request: vi.fn(async (method: string, params?: unknown) => {
      calls.push({ method, params });

      if (method === 'health') {
        return { ok: true, status: 'ok', agents: [] };
      }

      if (method === 'agents.list') {
        return { agents };
      }

      if (method === 'agents.create') {
        agentSequence += 1;
        const input = params as { workspace?: string };
        const agent = {
          id: `gateway-agent-${agentSequence}`,
          name: `gateway-agent-${agentSequence}`,
          workspace: input.workspace ?? `workspace-${agentSequence}`,
        };
        agents.push(agent);
        return {
          ok: true,
          agentId: agent.id,
          name: agent.name,
          workspace: agent.workspace,
        };
      }

      if (method === 'agents.files.set' && shouldFailProfileWrites) {
        throw new Error('profile write failed');
      }

      if (method === 'agents.update' || method === 'agents.files.set') {
        return { ok: true };
      }

      if (method === 'sessions.create') {
        const input = params as { key: string; agentId: string; label?: string };
        const key = input.key === 'main'
          ? `agent:${input.agentId}:main`
          : `agent:${input.agentId}:${input.key}`;
        if (!sessions.some((session) => session.key === key)) {
          sessions.push({
            key,
            title: input.label ?? key,
            agentId: input.agentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return { key };
      }

      if (method === 'sessions.list') {
        return { sessions };
      }

      if (method === 'chat.send') {
        const input = params as { sessionKey: string; message: string };
        setTimeout(() => {
          emit('chat', {
            runId: `run-${Date.now()}`,
            sessionKey: input.sessionKey,
            seq: 1,
            state: 'final',
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: `OpenClaw response: ${input.message}`,
                },
              ],
            },
          });
        }, 0);
        return { ok: true };
      }

      return { ok: true };
    }),
    on: vi.fn((event: string, handler: Handler) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
      return () => {
        handlers.get(event)?.delete(handler);
      };
    }),
    getConnectionStatus: vi.fn(() => ({
      status: 'connected',
      health: 'healthy',
      connectedAt: Date.now(),
      lastHealthCheck: Date.now(),
      lastHealthOk: true,
      consecutiveHealthFailures: 0,
      gatewayVersion: 'test',
      gatewayHost: '127.0.0.1',
      agents: agentSequence,
      deviceId: 'test-device',
      hasDeviceToken: true,
      lastError: null,
    })),
  };

  return {
    calls,
    client,
    reset() {
      calls.length = 0;
      agents.length = 0;
      sessions.length = 0;
      handlers.clear();
      agentSequence = 0;
      shouldFailProfileWrites = false;
      client.isConnected.mockClear();
      client.connect.mockClear();
      client.request.mockClear();
      client.on.mockClear();
      client.getConnectionStatus.mockClear();
    },
    failProfileWrites() {
      shouldFailProfileWrites = true;
    },
  };
});

vi.mock('../src/agents/openclawClient.js', () => ({
  getOpenClawClient: () => gateway.client,
}));

const { buildApp } = await import('../src/app.js');
const { createXuanzhiWorkspacePath } = await import('../src/agents/workspace.js');

async function login(app: FastifyInstance, username: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username,
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
      title: options.title ?? userInput.trim().slice(0, 28),
      userInput,
      intent: options.intent ?? 'general',
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

const testProfile: XuanzhiAgentProfile = {
  version: 1,
  agentName: '张三的玄知助理',
  identity: {
    displayName: '张三',
    role: '密评工程师',
    organization: '玄知实验室',
    researchFields: ['密评合规', 'SM 系列算法'],
    experience: 'expert',
  },
  requirements: {
    tone: '工程务实',
    depth: '深度研究',
    language: 'zh-CN',
    autoMode: true,
    expertDomains: ['密码协议'],
    notificationPrefs: { wechat: true, email: false },
  },
  access: {
    role: 'user',
    isolatedWorkspace: true,
  },
};

async function waitForCondition(assertion: () => void | Promise<void>) {
  let lastError: unknown;
  for (let index = 0; index < 30; index += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

describe('xuanzhi api with OpenClaw Gateway', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    gateway.reset();
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('authenticates test users and returns the user agent', async () => {
    const { token, user, agent } = await login(app, 'alice');

    expect(agent).toMatchObject({
      userId: user.id,
      workspace: createXuanzhiWorkspacePath(user.username),
    });

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json<LoginResponse>()).toMatchObject({
      user: {
        id: user.id,
        username: 'alice',
      },
      agent: {
        userId: user.id,
      },
    });
  });

  it('creates an isolated local agent during registration and defers Gateway creation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'new-user',
        name: 'New User',
        password: 'dev-password',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<LoginResponse>();
    expect(body.agent).toMatchObject({
      userId: body.user.id,
      gatewayAgentId: null,
      workspace: createXuanzhiWorkspacePath(body.user.username),
    });
    expect(gateway.calls.some((call) => call.method === 'agents.create')).toBe(false);
    expect(gateway.calls.some((call) => call.method === 'agents.update')).toBe(false);
  });

  it('binds tasks to currentUser and keeps task lists isolated', async () => {
    const userA = await login(app, 'alice');
    const userB = await login(app, 'bob');

    const taskA = await createTask(app, userA.token, 'Summarize document A');
    const taskB = await createTask(app, userB.token, 'Summarize document B');

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

  it('keeps user agent lists isolated between accounts', async () => {
    const userA = await login(app, 'alice');
    const userB = await login(app, 'bob');

    const [agentsAResponse, agentsBResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/agents',
        headers: { authorization: `Bearer ${userB.token}` },
      }),
    ]);

    expect(agentsAResponse.statusCode).toBe(200);
    expect(agentsBResponse.statusCode).toBe(200);

    const agentsA = agentsAResponse.json<LoginResponse['agent'][]>();
    const agentsB = agentsBResponse.json<LoginResponse['agent'][]>();

    expect(agentsA).toHaveLength(1);
    expect(agentsB).toHaveLength(1);
    expect(agentsA[0]).toMatchObject({
      userId: userA.user.id,
      workspace: createXuanzhiWorkspacePath(userA.user.username),
    });
    expect(agentsB[0]).toMatchObject({
      userId: userB.user.id,
      workspace: createXuanzhiWorkspacePath(userB.user.username),
    });
    expect(agentsA[0]?.id).not.toBe(agentsB[0]?.id);
  });

  it('dispatches user messages to OpenClaw sessions and stores the assistant reply', async () => {
    const userA = await login(app, 'alice');
    await app.inject({
      method: 'PATCH',
      url: `/api/agents/${userA.agent?.id}/profile`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { profile: testProfile },
    });
    const task = await createTask(app, userA.token, 'Explain the uploaded notes');

    await sendUserMessage(app, userA.token, task.id, task.userInput);

    await waitForCondition(async () => {
      const taskResponse = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(taskResponse.json<Task>().status).toBe('completed');
    });

    const [messagesResponse, eventsResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/messages`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/events`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
    ]);

    const messages = messagesResponse.json<Message[]>();
    const events = eventsResponse.json<AgentEvent[]>();

    expect(gateway.calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(['agents.create', 'agents.files.set', 'sessions.create', 'chat.send']),
    );
    const fileSetCalls = gateway.calls.filter((call) => call.method === 'agents.files.set');
    expect(fileSetCalls.map((call) => (call.params as { name: string }).name)).toEqual(
      expect.arrayContaining(['USER.md', 'AGENTS.md']),
    );
    expect(JSON.stringify(fileSetCalls.map((call) => call.params))).toContain('张三');
    expect(JSON.stringify(fileSetCalls.map((call) => call.params))).toContain('密评工程师');
    const chatSendCall = gateway.calls.find((call) => call.method === 'chat.send');
    expect(chatSendCall?.params).toMatchObject({
      message: 'Explain the uploaded notes',
    });
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'completed',
    });
    expect(messages.at(-1)?.content).toContain('Explain the uploaded notes');
    expect(events.map((event) => event.type)).toContain('agent.answer.created');
  });

  it('continues chat when profile file sync fails', async () => {
    gateway.failProfileWrites();
    const userA = await login(app, 'alice');
    await app.inject({
      method: 'PATCH',
      url: `/api/agents/${userA.agent?.id}/profile`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { profile: testProfile },
    });
    const task = await createTask(app, userA.token, 'Continue even if profile sync fails');

    await sendUserMessage(app, userA.token, task.id, task.userInput);

    await waitForCondition(async () => {
      const taskResponse = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(taskResponse.json<Task>().status).toBe('completed');
    });

    const [messagesResponse, eventsResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/messages`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/events`,
        headers: { authorization: `Bearer ${userA.token}` },
      }),
    ]);

    expect(messagesResponse.json<Message[]>().at(-1)?.content).toContain('Continue even if profile sync fails');
    expect(eventsResponse.json<AgentEvent[]>().map((event) => event.type)).toEqual(
      expect.arrayContaining(['agent.profile.sync_skipped', 'agent.answer.created']),
    );
    expect(gateway.calls.map((call) => call.method)).toContain('chat.send');
  });

  it('reuses the user agent for follow-up messages', async () => {
    const userA = await login(app, 'alice');
    const task = await createTask(app, userA.token, 'Start a research thread');

    await sendUserMessage(app, userA.token, task.id, task.userInput);
    await waitForCondition(async () => {
      const taskResponse = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(taskResponse.json<Task>().status).toBe('completed');
    });

    await sendUserMessage(app, userA.token, task.id, 'Add implementation risks');
    await waitForCondition(async () => {
      const messagesResponse = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}/messages`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(messagesResponse.json<Message[]>()).toHaveLength(4);
    });

    const agentCreateCalls = gateway.calls.filter((call) => call.method === 'agents.create');
    const chatSendCalls = gateway.calls.filter((call) => call.method === 'chat.send');

    expect(agentCreateCalls).toHaveLength(1);
    expect(chatSendCalls).toHaveLength(2);
  });

  it('projects OpenClaw sessions back into the task list after API state is rebuilt', async () => {
    const userA = await login(app, 'alice');
    const task = await createTask(app, userA.token, 'Persist this OpenClaw session');

    await sendUserMessage(app, userA.token, task.id, task.userInput);
    await waitForCondition(async () => {
      const taskResponse = await app.inject({
        method: 'GET',
        url: `/api/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userA.token}` },
      });
      expect(taskResponse.json<Task>().status).toBe('completed');
    });

    await app.close();
    app = buildApp();
    await app.ready();

    const restoredUser = await login(app, 'alice');
    const restoredTasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${restoredUser.token}` },
    });

    expect(restoredTasksResponse.statusCode).toBe(200);
    const restoredTasks = restoredTasksResponse.json<Task[]>();
    expect(restoredTasks.some((item) => item.id === task.id)).toBe(true);
    expect(restoredTasks.find((item) => item.id === task.id)).toMatchObject({
      agentId: restoredUser.agent?.id,
      sessionKey: expect.stringContaining(task.id),
    });
  });

  it('shows the OpenClaw main direct session in the task list', async () => {
    const main = await login(app, 'main');
    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${main.token}` },
      payload: {
        agentId: main.agent?.id,
        title: 'Prime main session',
        userInput: 'Prime main session',
      },
    });
    const gatewayAgentId = main.agent?.gatewayAgentId ?? 'main';
    await gateway.client.request('sessions.create', {
      key: 'main',
      agentId: gatewayAgentId,
      label: 'Main direct session',
    });

    const tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${main.token}` },
    });

    expect(tasksResponse.statusCode).toBe(200);
    expect(tasksResponse.json<Task[]>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: main.agent?.id,
          sessionKey: `agent:${gatewayAgentId}:main`,
        }),
      ]),
    );
  });

  it('rejects cross-user stream access', async () => {
    const userA = await login(app, 'alice');
    const userB = await login(app, 'bob');
    const task = await createTask(app, userA.token, 'Private task');

    const rejectedStream = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/stream?token=${encodeURIComponent(userB.token)}`,
    });

    expect(rejectedStream.statusCode).toBe(404);
  });

  it('accepts plugin writes with service token and ignores spoofed userId in payloads', async () => {
    const userA = await login(app, 'alice');
    const task = await createTask(app, userA.token, 'Generate project plan');

    const eventResponse = await app.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/events`,
      headers: {
        authorization: 'Bearer dev-token',
      },
      payload: {
        userId: 'user_b',
        type: 'plugin.event',
        title: 'Plugin event',
        status: 'success',
      },
    });

    expect(eventResponse.statusCode).toBe(201);
    expect(eventResponse.json<AgentEvent>()).toMatchObject({
      userId: userA.user.id,
      taskId: task.id,
      title: 'Plugin event',
    });
  });
});
