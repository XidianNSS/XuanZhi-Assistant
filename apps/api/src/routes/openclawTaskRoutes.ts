import type { FastifyInstance } from 'fastify';

import type { TaskIntent } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { getAuth } from '../http/auth.js';
import { normalizeTaskIntent } from '../schemas/protocolValidators.js';

export function registerOpenClawTaskRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/openclaw/tasks/start', async (request, reply) => {
    const auth = getAuth(request, dependencies.store, dependencies.config);
    if (!auth || auth.kind !== 'service') {
      return reply.status(401).send({ message: '未授权' });
    }

    const body = request.body as {
      sessionKey?: string;
      agentId?: string;
      agentName?: string;
      title?: string;
      summary?: string;
      intent?: TaskIntent;
    };
    const sessionKey = body.sessionKey?.trim();
    if (!sessionKey) {
      return reply.status(400).send({ message: 'sessionKey 不能为空' });
    }

    const task = dependencies.services.tasks.startTaskForOpenClawSession({
      sessionKey,
      agentId: body.agentId,
      agentName: body.agentName,
      title: body.title,
      summary: body.summary,
      intent: normalizeTaskIntent(body.intent),
    });
    if (!task) {
      return reply.status(404).send({ message: 'OpenClaw 会话无法匹配玄知 Agent' });
    }
    return reply.status(201).send(task);
  });
}
