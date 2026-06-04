import type { FastifyInstance } from 'fastify';
import type { Agent, AgentStatus, Task } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { getOpenClawClient } from '../agents/openclawClient.js';
import { readOpenClawAgentFile } from '../agents/openclawNative.js';
import { syncAgentProfileFiles } from '../agents/profileFiles.js';
import { createXuanzhiWorkspacePath } from '../agents/workspace.js';
import { requireUserAuth } from '../http/taskGuards.js';
import { isAgentStatus } from '../schemas/protocolValidators.js';

const PROFILE_FILE_NAMES = ['USER.md', 'AGENTS.md', 'IDENTITY.md', 'SOUL.md'] as const;

function agentDisplayName(agent: Agent) {
  return agent.profile?.agentName?.trim() || agent.name.trim() || agent.id;
}

function workspaceNameSegment(value: string) {
  return value
    .trim()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function taskIdFromSessionKey(sessionKey: string) {
  return `session_${sessionKey.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 96)}`;
}

function taskFromMainSession(agent: Agent, sessionKey: string, label: string): Task {
  const now = new Date().toISOString();
  return {
    id: taskIdFromSessionKey(sessionKey),
    userId: agent.userId,
    agentId: agent.id,
    sessionKey,
    title: label,
    userInput: label,
    intent: 'general',
    status: 'completed',
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureMainSession(agent: Agent) {
  if (!agent.gatewayAgentId) {
    throw new Error('OpenClaw Agent 尚未连接');
  }
  return getOpenClawClient().request<{ key: string }>('sessions.create', {
    key: 'main',
    agentId: agent.gatewayAgentId,
    label: `${agentDisplayName(agent)} 的主对话`,
  });
}

async function ensureGatewayAgent(agent: Agent, dependencies: AppDependencies) {
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }

  if (agent.gatewayAgentId) {
    return agent;
  }

  const listResult = await client.request<{
    agents?: Array<{ id: string; name?: string; workspace?: string }>;
  }>('agents.list');
  const existing = listResult?.agents?.find((item) => item.workspace === agent.workspace);
  if (existing?.id) {
    return dependencies.store.updateAgentGatewayInfo(
      agent.id,
      existing.id,
      existing.workspace ?? agent.workspace,
    ) ?? agent;
  }

  const created = await client.request<{
    agentId: string;
    workspace?: string;
  }>('agents.create', {
    name: agentDisplayName(agent),
    workspace: agent.workspace,
    emoji: agent.emoji,
    model: agent.model,
  });

  return dependencies.store.updateAgentGatewayInfo(
    agent.id,
    created.agentId,
    created.workspace ?? agent.workspace,
  ) ?? agent;
}

async function syncAgentProfileToGateway(agent: Agent, dependencies: AppDependencies) {
  if (!agent.profile) {
    return;
  }

  try {
    const gatewayAgent = await ensureGatewayAgent(agent, dependencies);
    if (!gatewayAgent.gatewayAgentId) {
      return;
    }
    await syncAgentProfileFiles(getOpenClawClient(), gatewayAgent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agents] Gateway profile sync failed:', message);
  }
}

function assertAgentAccess(agent: Agent | undefined, userId: string, isAdmin: boolean) {
  if (!agent) {
    return false;
  }
  return isAdmin || agent.userId === userId;
}

async function readProfileFiles(agent: Agent) {
  if (!agent.gatewayAgentId) {
    return PROFILE_FILE_NAMES.map((name) => ({ name, content: '', available: false }));
  }

  return Promise.all(
    PROFILE_FILE_NAMES.map(async (name) => {
      try {
        const result = await readOpenClawAgentFile(agent.gatewayAgentId!, name);
        const content = result?.file?.content ?? '';
        return { name, content, available: Boolean(content) };
      } catch (error) {
        return {
          name,
          content: '',
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

export function registerAgentRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/agents', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    if (auth.user.role !== 'admin') {
      return reply.status(403).send({ message: '普通用户注册后会自动分配一个 Agent，不能手动新建多个 Agent' });
    }

    const body = request.body as {
      name?: string;
      profile?: Agent['profile'];
      emoji?: string;
      model?: string;
    };
    const agentName = body.name?.trim() || body.profile?.agentName?.trim() || '新的玄知助理';
    const profile = body.profile
      ? { ...body.profile, agentName: body.profile.agentName || agentName }
      : null;
    const agent = dependencies.services.agents.createAgent(
      auth.user.id,
      agentName,
      {
        profile,
        emoji: body.emoji,
        model: body.model,
        workspace: createXuanzhiWorkspacePath(
          `${auth.user.username}-${workspaceNameSegment(agentName) || 'agent'}-${Date.now().toString(36)}`,
        ),
      },
    );
    return reply.status(201).send(agent);
  });

  app.get('/api/agents', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    return dependencies.services.agents.listAgentsForUser(auth.user.id);
  });

  app.get('/api/agents/:agentId', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    return agent;
  });

  app.patch('/api/agents/:agentId/status', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const body = request.body as { status?: AgentStatus };

    if (!isAgentStatus(body.status)) {
      return reply.status(400).send({ message: 'Agent 状态无效' });
    }

    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    return dependencies.services.agents.updateAgentStatus(agentId, body.status);
  });

  app.patch('/api/agents/:agentId/profile', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const body = request.body as { profile?: Record<string, unknown> };

    if (!body.profile || typeof body.profile !== 'object') {
      return reply.status(400).send({ message: 'Profile 数据无效' });
    }

    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    const updated = dependencies.services.agents.updateAgentProfile(
      agentId,
      body.profile as Agent['profile'],
    );
    if (!updated) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    void syncAgentProfileToGateway(updated, dependencies);
    return updated;
  });

  app.post('/api/agents/:agentId/sync-profile', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (!agent?.profile) {
      return reply.status(400).send({ message: 'Agent 尚未完成初始化' });
    }

    await syncAgentProfileToGateway(agent, dependencies);
    const updated = dependencies.services.agents.getAgent(agentId) ?? agent;
    return updated;
  });

  app.get('/api/agents/:agentId/openclaw-profile', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    const gatewayAgent = await ensureGatewayAgent(agent, dependencies).catch(() => agent);
    const files = await readProfileFiles(gatewayAgent);
    const identity = gatewayAgent.gatewayAgentId
      ? await getOpenClawClient()
          .request('agent.identity.get', { agentId: gatewayAgent.gatewayAgentId })
          .catch(() => null)
      : null;

    return {
      agent: gatewayAgent,
      identity,
      files,
      bootstrapFiles: PROFILE_FILE_NAMES,
    };
  });

  app.post('/api/agents/:agentId/main-task', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    const gatewayAgent = await ensureGatewayAgent(agent, dependencies);
    if (!gatewayAgent.gatewayAgentId) {
      return reply.status(502).send({ message: 'OpenClaw Agent 尚未连接' });
    }

    const label = `${agentDisplayName(gatewayAgent)} 的主对话`;
    const expectedSessionKey = `agent:${gatewayAgent.gatewayAgentId}:main`;
    const expectedTaskId = taskIdFromSessionKey(expectedSessionKey);
    const existingTask = dependencies.store.tasks.get(expectedTaskId);
    if (existingTask) {
      return existingTask;
    }

    const session = await ensureMainSession(gatewayAgent);
    const task = taskFromMainSession(gatewayAgent, session.key, label);
    return dependencies.store.upsertTask(task);
  });

  app.post('/api/agents/:agentId/conversations', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const body = request.body as { title?: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!assertAgentAccess(agent, auth.user.id, auth.user.role === 'admin')) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    const gatewayAgent = await ensureGatewayAgent(agent, dependencies);
    if (!gatewayAgent.gatewayAgentId) {
      return reply.status(502).send({ message: 'OpenClaw Agent 尚未连接' });
    }

    const title = body.title?.trim() || '新对话';
    const mainSession = await ensureMainSession(gatewayAgent);
    const task = dependencies.services.tasks.createTask({
      userId: gatewayAgent.userId,
      agentId: gatewayAgent.id,
      title,
      userInput: title,
      intent: 'general',
    });
    const session = await getOpenClawClient().request<{ key: string }>('sessions.create', {
      key: `task:${task.id}`,
      agentId: gatewayAgent.gatewayAgentId,
      label: title,
      parentSessionKey: mainSession.key,
    });
    dependencies.store.updateTaskSessionKey(task.id, session.key);
    return dependencies.services.tasks.updateStatus(task.id, 'completed', gatewayAgent.userId) ?? task;
  });
}
