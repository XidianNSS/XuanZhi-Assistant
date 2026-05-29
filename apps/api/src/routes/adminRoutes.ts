import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { requireAdmin } from '../http/adminGuard.js';
import { getOpenClawClient } from '../agents/openclawClient.js';

export function registerAdminRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.get('/api/admin/users', async (request, reply) => {
    const auth = requireAdmin(request, reply, dependencies);
    if (!auth) return;
    return dependencies.store.listUsers();
  });

  app.get('/api/admin/agents', async (request, reply) => {
    const auth = requireAdmin(request, reply, dependencies);
    if (!auth) return;
    return dependencies.services.agents.listAllAgents();
  });

  app.get('/api/admin/agents/:agentId/tasks', async (request, reply) => {
    const auth = requireAdmin(request, reply, dependencies);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };
    const agent = dependencies.services.agents.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    return dependencies.store.listTasksForUser(agent.userId);
  });

  app.get('/api/admin/gateway/agents', async (request, reply) => {
    const auth = requireAdmin(request, reply, dependencies);
    if (!auth) return;
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      return reply.status(503).send({ message: 'Gateway 未连接', agents: [] });
    }
    try {
      const health = await client.request<{
        ok?: boolean;
        agents?: Array<unknown>;
      }>('health');
      return { ok: health.ok, agents: health.agents ?? [] };
    } catch {
      return reply.status(502).send({ message: 'Gateway 健康检查失败', agents: [] });
    }
  });

  app.get('/api/admin/stats', async (request, reply) => {
    const auth = requireAdmin(request, reply, dependencies);
    if (!auth) return;
    const stats = dependencies.store.getStats();
    const gatewayStatus = getOpenClawClient().getConnectionStatus();
    return { ...stats, gateway: gatewayStatus };
  });

  app.get('/api/admin/tasks', async (request, reply) => {
    const auth = requireAdmin(request, reply, dependencies);
    if (!auth) return;
    return dependencies.store.listAllTasks();
  });
}
