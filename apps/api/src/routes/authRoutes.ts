import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { getOpenClawClient } from '../agents/openclawClient.js';
import { requireUserAuth } from '../http/taskGuards.js';

export function registerAuthRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as { email?: string; name?: string; password?: string };
    const result = dependencies.services.auth.register(body.email, body.name, body.password);
    if ('error' in result) {
      return reply.status(400).send({ message: result.error });
    }

    // Create local agent record immediately
    const agent = dependencies.services.agents.createAgent(
      result.data.user.id,
      result.data.user.name,
    );

    // Best-effort: create Gateway agent in the background
    const client = getOpenClawClient();
    if (client.isConnected()) {
      const workspace = `xuanzhi-agent-${agent.id}`;
      client.request<{ ok: true; agentId: string; workspace: string }>('agents.create', {
        name: agent.name,
        workspace,
      }).then((created) => {
        dependencies.store.updateAgentGatewayInfo(agent.id, created.agentId, created.workspace);
      }).catch((err) => {
        console.error('[auth] Gateway agent creation failed (will retry on first task):', err.message);
      });
    }

    return reply.status(201).send(result.data);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const login = dependencies.services.auth.login(body.email, body.password);
    if (!login) {
      return reply.status(401).send({ message: '邮箱或密码错误' });
    }
    return login;
  });

  app.get('/api/auth/me', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) {
      return;
    }
    return { user: auth.user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) {
      return;
    }
    dependencies.services.auth.logout(auth.token);
    return reply.status(204).send();
  });
}
