import type { FastifyInstance } from 'fastify';
import type { Agent, AgentStatus } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { getOpenClawClient } from '../agents/openclawClient.js';
import { syncAgentProfileFiles } from '../agents/profileFiles.js';
import { createXuanzhiWorkspacePath } from '../agents/workspace.js';
import { requireUserAuth } from '../http/taskGuards.js';
import { isAgentStatus } from '../schemas/protocolValidators.js';

async function syncAgentProfileToGateway(agent: Agent) {
  if (!agent.gatewayAgentId || !agent.profile) {
    return;
  }

  const client = getOpenClawClient();
  try {
    if (!client.isConnected()) {
      await client.connect();
    }
    await syncAgentProfileFiles(client, agent);
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
      { profile, emoji: body.emoji, model: body.model, workspace: createXuanzhiWorkspacePath(auth.user.id) },
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

    void syncAgentProfileToGateway(updated);
    return updated;
  });
}
