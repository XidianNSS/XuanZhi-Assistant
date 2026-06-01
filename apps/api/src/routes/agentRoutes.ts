import type { FastifyInstance } from 'fastify';
import type { AgentStatus } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { requireUserAuth } from '../http/taskGuards.js';
import { isAgentStatus } from '../schemas/protocolValidators.js';

export function registerAgentRoutes(app: FastifyInstance, dependencies: AppDependencies) {
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
}
