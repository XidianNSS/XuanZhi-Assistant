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

    // Create local agent record. Agent name defaults to a placeholder —
    // the user will set a proper agent name via the registration wizard.
    const agentName = `默认助手`;
    const agent = dependencies.services.agents.createAgent(
      result.data.user.id,
      agentName,
    );

    // Synchronously create Gateway agent + workspace.
    // Gateway agent name = xuanzhi agent name (the assistant's identity, not the user's).
    const client = getOpenClawClient();
    if (client.isConnected()) {
      try {
        const workspace = `xuanzhi-agent-${agent.id}`;
        const created = await client.request<{
          ok: true;
          agentId: string;
          name: string;
          workspace: string;
        }>('agents.create', {
          name: agent.id,
          workspace,
        });

        // Set Gateway agent display name to the assistant name
        client.request('agents.update', {
          agentId: created.agentId,
          name: agentName,
        }).catch(() => {
          // best-effort
        });

        dependencies.store.updateAgentGatewayInfo(
          agent.id,
          created.agentId,
          created.workspace,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[auth] Gateway agent + workspace creation failed:', message);
      }
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
