import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { createXuanzhiWorkspacePath } from '../agents/workspace.js';
import { getOpenClawClient } from '../agents/openclawClient.js';
import { requireUserAuth } from '../http/taskGuards.js';
import type { Agent } from '@xuanzhi/shared/protocol';

function defaultAgentName(username: string) {
  return username === 'main' ? 'OpenClaw main' : `${username} 的 OpenClaw Agent`;
}

function defaultAgentOptions(username: string) {
  const workspace = createXuanzhiWorkspacePath(username);
  return username === 'main'
    ? { workspace, gatewayAgentId: 'main' }
    : { workspace };
}

function agentDisplayName(agent: Agent) {
  return agent.profile?.agentName?.trim() || agent.name.trim() || agent.id;
}

function syncAgentDisplayToOpenClaw(agent: Agent) {
  if (!agent.gatewayAgentId) return;
  const client = getOpenClawClient();
  void (async () => {
    try {
      if (!client.isConnected()) {
        await client.connect();
      }
      await client.request('agents.update', {
        agentId: agent.gatewayAgentId,
        name: agentDisplayName(agent),
        workspace: agent.workspace,
        emoji: agent.emoji,
      });
    } catch {
      // Login must stay usable even if the Gateway is temporarily unavailable.
    }
  })();
}

export function registerAuthRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as { username?: string; name?: string; password?: string };
    const result = dependencies.services.auth.register(body.username, body.name, body.password);
    if ('error' in result) {
      return reply.status(400).send({ message: result.error });
    }

    const username = result.data.user.username;
    const agent = dependencies.services.agents.createAgent(
      result.data.user.id,
      defaultAgentName(username),
      defaultAgentOptions(username),
    );
    result.data.agent = agent;
    syncAgentDisplayToOpenClaw(agent);

    return reply.status(201).send(result.data);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const login = dependencies.services.auth.login(body.username, body.password);
    if (!login) {
      return reply.status(401).send({ message: '用户名或密码错误' });
    }

    login.agent = dependencies.services.agents.ensureAgent(
      login.user.id,
      defaultAgentName(login.user.username),
      defaultAgentOptions(login.user.username),
    );
    syncAgentDisplayToOpenClaw(login.agent);
    return login;
  });

  app.get('/api/auth/me', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) {
      return;
    }
    const agent = dependencies.services.agents.ensureAgent(
      auth.user.id,
      defaultAgentName(auth.user.username),
      defaultAgentOptions(auth.user.username),
    );
    syncAgentDisplayToOpenClaw(agent);
    return {
      user: auth.user,
      agent,
    };
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
