import type { FastifyInstance } from 'fastify';
import type { Message } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { requireOwnedTask } from '../http/taskGuards.js';

export function registerMessageRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/tasks/:taskId/messages', async (request, reply) => {
    const task = requireOwnedTask(request, reply, dependencies);
    if (!task) {
      return;
    }
    const body = request.body as { role?: Message['role']; content?: string; contextFileIds?: string[] };
    const content = body.content?.trim();
    if (!content) {
      return reply.status(400).send({ message: '消息内容不能为空' });
    }
    const contextValidation = Array.isArray(body.contextFileIds)
      ? dependencies.services.files.validateContextFileIds(task.userId, body.contextFileIds)
      : { ok: true as const, fileIds: undefined };
    if (!contextValidation.ok) {
      return reply.status(400).send({ message: contextValidation.message });
    }
    const message = dependencies.services.messages.createMessage(task, {
      role: body.role,
      content,
      contextFileIds: contextValidation.fileIds,
    });
    return reply.status(201).send(message);
  });

  app.get('/api/tasks/:taskId/messages', async (request, reply) => {
    const task = requireOwnedTask(request, reply, dependencies);
    if (!task) {
      return;
    }
    return dependencies.services.messages.listMessages(task.id);
  });
}
