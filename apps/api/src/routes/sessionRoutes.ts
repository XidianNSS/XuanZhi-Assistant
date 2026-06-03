import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { requireUserAuth } from '../http/taskGuards.js';

export function registerSessionRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies,
) {
  const { store } = dependencies;
  const sessionService = dependencies.services.sessions;

  // ── List sessions for current user ──

  app.get('/api/sessions', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;

    // Try Gateway RPC first (richer metadata), fall back to disk
    return sessionService.listSessionsForUser(auth.user.id);
  });

  // ── Get session detail (metadata + messages) ──

  app.get('/api/sessions/:sessionId', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;

    const { sessionId } = request.params as { sessionId: string };
    const agent = store.getAgentByUserId(auth.user.id);

    if (!agent?.gatewayAgentId) {
      return reply.status(404).send({ message: '当前用户未绑定 Agent' });
    }

    const detail = sessionService.getSessionDetail(
      agent.gatewayAgentId,
      sessionId,
    );

    if (!detail.session) {
      return reply.status(404).send({ message: 'Session 不存在' });
    }

    return detail;
  });

  // ── Get session messages only ──

  app.get('/api/sessions/:sessionId/messages', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) return;

    const { sessionId } = request.params as { sessionId: string };
    const agent = store.getAgentByUserId(auth.user.id);

    if (!agent?.gatewayAgentId) {
      return reply.status(404).send({ message: '当前用户未绑定 Agent' });
    }

    return sessionService.readSessionMessages(
      agent.gatewayAgentId,
      sessionId,
    );
  });
}
