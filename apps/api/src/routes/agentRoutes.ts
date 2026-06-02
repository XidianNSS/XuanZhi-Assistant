import type { FastifyInstance } from 'fastify';
import type { Agent, AgentStatus } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { requireUserAuth } from '../http/taskGuards.js';
import { isAgentStatus } from '../schemas/protocolValidators.js';

export function registerAgentRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  // Admin-only: create a new agent
  app.post('/api/agents', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    if (auth.user.role !== 'admin') {
      return reply.status(403).send({ message: '仅管理员可创建 Agent' });
    }
    const body = request.body as {
      name?: string;           // agent/assistant name
      profile?: Agent['profile'];
      emoji?: string;
      model?: string;
    };
    // Agent name defaults to profile.agentName or a fallback
    const agentName = body.name?.trim() || body.profile?.agentName?.trim() || '新智能体';
    const profile = body.profile
      ? { ...body.profile, agentName: body.profile.agentName || agentName }
      : null;
    const agent = dependencies.services.agents.createAgent(
      auth.user.id,
      agentName,
      { profile, emoji: body.emoji, model: body.model },
    );
    return reply.status(201).send(agent);
  });

  app.get('/api/agents', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    if (auth.user.role === 'admin') {
      return dependencies.services.agents.listAllAgents();
    }
    return dependencies.services.agents.listAgentsForUser(auth.user.id);
  });

  app.get('/api/agents/:agentId', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (auth.user.role !== 'admin' && agent.userId !== auth.user.id) {
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
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (auth.user.role !== 'admin' && agent.userId !== auth.user.id) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    const updated = dependencies.services.agents.updateAgentStatus(agentId, body.status);
    return updated;
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
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    // Only the agent owner or admin can update profile
    if (auth.user.role !== 'admin' && agent.userId !== auth.user.id) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }

    const updated = dependencies.services.agents.updateAgentProfile(
      agentId,
      body.profile as Agent['profile'],
    );
    if (!updated) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    return updated;
  });
}
