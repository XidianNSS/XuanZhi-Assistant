import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { createXuanzhiWorkspacePath } from '../agents/workspace.js';
import { requireUserAuth } from '../http/taskGuards.js';

export function registerAuthRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as { email?: string; name?: string; password?: string };
    const result = dependencies.services.auth.register(body.email, body.name, body.password);
    if ('error' in result) {
      return reply.status(400).send({ message: result.error });
    }

    const agentName = `${result.data.user.name}的玄知助理`;
    const workspace = createXuanzhiWorkspacePath(result.data.user.id);
    const agent = dependencies.services.agents.createAgent(
      result.data.user.id,
      agentName,
      { workspace },
    );
    result.data.agent = agent;

    return reply.status(201).send(result.data);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const login = dependencies.services.auth.login(body.email, body.password);
    if (!login) {
      return reply.status(401).send({ message: '邮箱或密码错误' });
    }

    login.agent = dependencies.services.agents.ensureAgent(
      login.user.id,
      `${login.user.name}的玄知助理`,
      { workspace: createXuanzhiWorkspacePath(login.user.id) },
    );
    return login;
  });

  app.get('/api/auth/me', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) {
      return;
    }
    const agent = dependencies.services.agents.ensureAgent(
      auth.user.id,
      `${auth.user.name}的玄知助理`,
      { workspace: createXuanzhiWorkspacePath(auth.user.id) },
    );
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
