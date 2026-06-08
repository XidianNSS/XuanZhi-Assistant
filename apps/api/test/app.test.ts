import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { FastifyInstance } from 'fastify';
import type { AgentEvent, LoginResponse, Message, Task, TaskIntent, XuanzhiAgentProfile } from '@xuanzhi/shared/protocol';

const gateway = vi.hoisted(() => {
  type Handler = (payload: unknown) => void;

  const handlers = new Map<string, Set<Handler>>();
  const calls: Array<{ method: string; params?: unknown }> = [];
  const agents: Array<{ id: string; name: string; workspace: string }> = [];
  const sessions: Array<{ key: string; title: string; agentId: string; createdAt: string; updatedAt: string; parentSessionKey?: string }> = [];
  const agentFiles = new Map<string, string>();
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

      if (method === 'agents.files.set') {
        if (shouldFailProfileWrites) {
          throw new Error('profile write failed');
        }
        const input = params as { agentId: string; name: string; content: string };
        agentFiles.set(`${input.agentId}:${input.name}`, input.content);
        return { ok: true };
      }

      if (method === 'agents.files.get') {
        const input = params as { agentId: string; name: string };
        const content = agentFiles.get(`${input.agentId}:${input.name}`);
        return content ? { file: { name: input.name, content } } : { file: null };
      }

      if (method === 'agent.identity.get') {
        const input = params as { agentId: string };
        return { agentId: input.agentId, source: 'test-gateway' };
      }

      if (method === 'agents.update') {
        return { ok: true };
      }

      if (method === 'sessions.create') {
        const input = params as { key: string; agentId: string; label?: string; parentSessionKey?: string };
        const key = input.key === 'main'
          ? `agent:${input.agentId}:main`
          : `agent:${input.agentId}:${input.key}`;
        if (
          !sessions.some((session) => session.key === key)
          && input.label
          && sessions.some((session) => session.agentId === input.agentId && session.title === input.label)
        ) {
          throw new Error(`label already in use: ${input.label}`);
        }
        if (!sessions.some((session) => session.key === key)) {
          sessions.push({
            key,
            title: input.label ?? key,
            agentId: input.agentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            parentSessionKey: input.parentSessionKey,
          });
        }
        return { key };
      }

      if (method === 'sessions.list') {
        return { sessions };
      }

      if (method === 'chat.send') {
        const input = params as { sessionKey: string; message: string };
        if (!sessions.some((session) => session.key === input.sessionKey)) {
          throw new Error(`unknown session: ${input.sessionKey}`);
        }
        setTimeout(() => {
          const payload: {
            runId: string;
            sessionKey?: string;
            seq: number;
            state: 'final';
            message: { role: string; content: Array<{ type: string; text: string }> };
          } = {
            runId: `run-${Date.now()}`,
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
          };
          if (!input.message.includes('无 sessionKey 事件')) {
            payload.sessionKey = input.sessionKey;
          }
          emit('chat', payload);
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
      agentFiles.clear();
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

async function sendUserMessage(
  app: FastifyInstance,
  token: string,
  taskId: string,
  content: string,
  contextFileIds?: string[],
) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/tasks/${taskId}/messages`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      role: 'user',
      content,
      contextFileIds,
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
  let workspaceRoot: string;
  let previousWorkspaceRoot: string | undefined;

  beforeEach(async () => {
    previousWorkspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT;
    workspaceRoot = mkdtempSync(join(tmpdir(), 'xuanzhi-workspace-'));
    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
    gateway.reset();
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (previousWorkspaceRoot === undefined) {
      delete process.env.OPENCLAW_WORKSPACE_ROOT;
    } else {
      process.env.OPENCLAW_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    rmSync(workspaceRoot, { recursive: true, force: true });
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
      expect.arrayContaining(['USER.md', 'AGENTS.md', 'IDENTITY.md', 'SOUL.md']),
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

  it('syncs and reads all OpenClaw agent profile bootstrap files', async () => {
    const userA = await login(app, 'alice');
    const agentId = userA.agent?.id;
    expect(agentId).toBeTruthy();

    await app.inject({
      method: 'PATCH',
      url: `/api/agents/${agentId}/profile`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { profile: testProfile },
    });

    const syncResponse = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/sync-profile`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(syncResponse.statusCode).toBe(200);

    const profileResponse = await app.inject({
      method: 'GET',
      url: `/api/agents/${agentId}/openclaw-profile`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(profileResponse.statusCode).toBe(200);
    const body = profileResponse.json<{
      files: Array<{ name: string; available: boolean; content: string }>;
      bootstrapFiles: string[];
    }>();

    expect(body.bootstrapFiles).toEqual(['USER.md', 'AGENTS.md', 'IDENTITY.md', 'SOUL.md']);
    expect(body.files.map((file) => file.name)).toEqual(body.bootstrapFiles);
    expect(body.files.every((file) => file.available)).toBe(true);
    expect(body.files.find((file) => file.name === 'IDENTITY.md')?.content).toContain(testProfile.agentName);
    expect(body.files.find((file) => file.name === 'SOUL.md')?.content).toContain('Default language');
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

  it('opens an Agent main task and creates child OpenClaw conversations', async () => {
    const userA = await login(app, 'alice');
    const agentId = userA.agent?.id;
    expect(agentId).toBeTruthy();

    const mainResponse = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/main-task`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(mainResponse.statusCode).toBe(200);
    const mainTask = mainResponse.json<Task>();
    expect(mainTask).toMatchObject({
      userId: userA.user.id,
      agentId,
      status: 'completed',
    });
    expect(mainTask.sessionKey).toMatch(/^agent:gateway-agent-\d+:main$/);

    const conversationResponse = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/conversations`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { title: 'Follow-up OpenClaw session' },
    });

    expect(conversationResponse.statusCode).toBe(200);
    const childTask = conversationResponse.json<Task>();
    expect(childTask).toMatchObject({
      userId: userA.user.id,
      agentId,
      title: 'Follow-up OpenClaw session',
      status: 'completed',
    });
    expect(childTask.sessionKey).toContain(`task:${childTask.id}`);

    const sessionCreateCalls = gateway.calls.filter((call) => call.method === 'sessions.create');
    expect(sessionCreateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: expect.objectContaining({ key: 'main' }) }),
        expect.objectContaining({
          params: expect.objectContaining({
            key: `task:${childTask.id}`,
            parentSessionKey: mainTask.sessionKey,
          }),
        }),
      ]),
    );
  });

  it('creates repeated default conversations with unique OpenClaw labels', async () => {
    const userA = await login(app, 'alice');
    const agentId = userA.agent?.id;
    expect(agentId).toBeTruthy();

    const createConversation = () => app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/conversations`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { title: '新对话' },
    });

    const firstResponse = await createConversation();
    const secondResponse = await createConversation();

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.json<Task>().title).toBe('新对话');
    expect(secondResponse.json<Task>().title).toBe('新对话');

    const childSessionCalls = gateway.calls.filter((call) => (
      call.method === 'sessions.create'
      && (call.params as { key?: string }).key?.startsWith('task:')
    ));
    const labels = childSessionCalls.map((call) => (call.params as { label?: string }).label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('sends the first user message through a newly created child conversation', async () => {
    const userA = await login(app, 'alice');
    const agentId = userA.agent?.id;
    expect(agentId).toBeTruthy();

    const conversationResponse = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/conversations`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { title: '新对话' },
    });

    expect(conversationResponse.statusCode).toBe(200);
    const childTask = conversationResponse.json<Task>();

    const tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(tasksResponse.json<Task>().find((task) => task.id === childTask.id)?.title).toBe('新对话');

    await sendUserMessage(app, userA.token, childTask.id, '请测试这个新建会话');

    await new Promise((resolve) => setTimeout(resolve, 10));

    const chatSendCall = gateway.calls.find((call) => call.method === 'chat.send');
    expect(chatSendCall?.params).toMatchObject({
      sessionKey: childTask.sessionKey,
      message: '请测试这个新建会话',
    });

    const taskResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${childTask.id}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(taskResponse.json<Task>()).toMatchObject({
      id: childTask.id,
      title: '请测试这个新建会话',
      status: 'completed',
    });
  });

  it('accepts OpenClaw final chat events without a sessionKey field', async () => {
    const userA = await login(app, 'alice');
    const agentId = userA.agent?.id;
    expect(agentId).toBeTruthy();

    const conversationResponse = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/conversations`,
      headers: { authorization: `Bearer ${userA.token}` },
      payload: { title: '新对话' },
    });
    const childTask = conversationResponse.json<Task>();

    await sendUserMessage(app, userA.token, childTask.id, '无 sessionKey 事件也应该完成');
    await new Promise((resolve) => setTimeout(resolve, 10));

    const taskResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${childTask.id}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(taskResponse.json<Task>()).toMatchObject({
      id: childTask.id,
      status: 'completed',
    });

    const messagesResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${childTask.id}/messages`,
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(messagesResponse.json<Message[]>().at(-1)?.content).toContain('无 sessionKey 事件也应该完成');
  });

  it('blocks cross-user access to Agent session management routes', async () => {
    const userA = await login(app, 'alice');
    const userB = await login(app, 'bob');

    const rejectedMainTask = await app.inject({
      method: 'POST',
      url: `/api/agents/${userA.agent?.id}/main-task`,
      headers: { authorization: `Bearer ${userB.token}` },
    });

    const rejectedConversation = await app.inject({
      method: 'POST',
      url: `/api/agents/${userA.agent?.id}/conversations`,
      headers: { authorization: `Bearer ${userB.token}` },
      payload: { title: 'Cross-user attempt' },
    });

    expect(rejectedMainTask.statusCode).toBe(404);
    expect(rejectedConversation.statusCode).toBe(404);
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

  it('starts multiple tasks for an OpenClaw session using service auth', async () => {
    const userA = await login(app, 'main');
    const sessionKey = `agent:${userA.agent?.gatewayAgentId}:main`;

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/openclaw/tasks/start',
      headers: {
        authorization: 'Bearer dev-token',
      },
      payload: {
        sessionKey,
        title: 'Artifact needed',
        summary: 'Need an artifact',
        userId: 'spoofed-user',
      },
    });
    const secondResponse = await app.inject({
      method: 'POST',
      url: '/api/openclaw/tasks/start',
      headers: {
        authorization: 'Bearer dev-token',
      },
      payload: {
        sessionKey,
        title: 'Another artifact needed',
      },
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(201);
    expect(firstResponse.json<Task>()).toMatchObject({
      userId: userA.user.id,
      agentId: userA.agent?.id,
      sessionKey,
      title: 'Artifact needed',
    });
    expect(firstResponse.json<Task>().userId).not.toBe('spoofed-user');
    expect(secondResponse.json<Task>()).toMatchObject({
      userId: userA.user.id,
      agentId: userA.agent?.id,
      sessionKey,
      title: 'Another artifact needed',
    });
    expect(secondResponse.json<Task>().id).not.toBe(firstResponse.json<Task>().id);
  });

  it('rejects starting a task for an unknown OpenClaw agent session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/openclaw/tasks/start',
      headers: {
        authorization: 'Bearer dev-token',
      },
      payload: {
        sessionKey: 'agent:unknown-agent:main',
        title: 'Unknown agent task',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('serves generated workspace files for the owning task and blocks unsafe access', async () => {
    const userA = await login(app, 'alice');
    const userB = await login(app, 'bob');
    const task = await createTask(app, userA.token, 'Generate files');
    const workspace = userA.agent?.workspace;

    expect(workspace).toBeTruthy();
    mkdirSync(join(workspace!, 'outputs'), { recursive: true });
    writeFileSync(join(workspace!, 'outputs', 'report.md'), '# 报告\n\n内容', 'utf8');
    writeFileSync(join(workspace!, 'outputs', 'chart.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
    writeFileSync(join(workspace!, 'outputs', 'page.html'), '<script>alert(1)</script>', 'utf8');

    const download = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/files?path=${encodeURIComponent('outputs/report.md')}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.body).toContain('# 报告');

    const preview = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/files?path=${encodeURIComponent('outputs/chart.svg')}&inline=1&token=${encodeURIComponent(userA.token)}`,
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toContain('image/svg+xml');
    expect(preview.headers['content-disposition']).toContain('inline');
    expect(preview.headers['x-content-type-options']).toBe('nosniff');

    const htmlDownload = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/files?path=${encodeURIComponent('outputs/page.html')}&inline=1`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(htmlDownload.statusCode).toBe(200);
    expect(htmlDownload.headers['content-disposition']).toContain('attachment');

    const traversal = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/files?path=${encodeURIComponent('../report.md')}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(traversal.statusCode).toBe(400);

    const crossUser = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/files?path=${encodeURIComponent('outputs/report.md')}`,
      headers: { authorization: `Bearer ${userB.token}` },
    });

    expect(crossUser.statusCode).toBe(404);
  });

  it('lists task file assets on a separate route without changing generated file downloads', async () => {
    const userA = await login(app, 'alice');
    const task = await createTask(app, userA.token, 'Collect generated files');
    const workspace = userA.agent?.workspace;

    expect(workspace).toBeTruthy();
    mkdirSync(join(workspace!, 'outputs'), { recursive: true });
    writeFileSync(join(workspace!, 'outputs', 'report.md'), '# Report', 'utf8');

    const uploadResponse = await app.inject({
      method: 'POST',
      url: '/api/files/upload',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        name: 'notes.md',
        title: 'Research notes',
        content: '# Notes\n\nImportant context',
        mimeType: 'text/markdown',
        category: 'documents',
        taskId: task.id,
      },
    });

    expect(uploadResponse.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/file-assets`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<Array<{ name: string; workspacePath: string }>>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notes.md',
          workspacePath: expect.stringContaining('notes.md'),
        }),
      ]),
    );

    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}/files?path=${encodeURIComponent('outputs/report.md')}`,
      headers: { authorization: `Bearer ${userA.token}` },
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.body).toContain('# Report');
  });

  it('stores context file ids and sends file context through the OpenClaw session', async () => {
    const userA = await login(app, 'alice');
    const task = await createTask(app, userA.token, 'Use a context file');

    const uploadResponse = await app.inject({
      method: 'POST',
      url: '/api/files/upload',
      headers: { authorization: `Bearer ${userA.token}` },
      payload: {
        name: 'brief.md',
        title: 'Brief',
        content: 'Use this brief as source material.',
        mimeType: 'text/markdown',
        taskId: task.id,
      },
    });
    expect(uploadResponse.statusCode).toBe(201);
    const file = uploadResponse.json<{ id: string }>();

    const message = await sendUserMessage(
      app,
      userA.token,
      task.id,
      'Summarize the attached file',
      [file.id],
    );

    expect(message.contextFileIds).toEqual([file.id]);

    const chatSendCall = gateway.calls.find((call) => call.method === 'chat.send');
    expect(chatSendCall?.params).toMatchObject({
      sessionKey: expect.stringContaining(task.id),
    });
    expect((chatSendCall?.params as { message?: string }).message).toContain('Summarize the attached file');
    expect((chatSendCall?.params as { message?: string }).message).toContain('brief.md');
    expect((chatSendCall?.params as { message?: string }).message).toContain('Use this brief as source material.');
  });
});
