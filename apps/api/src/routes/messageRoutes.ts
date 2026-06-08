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
    const body = request.body as { role?: Message['role']; content?: string; contextFileIds?: unknown };
    const content = body.content?.trim();
    if (!content) {
      return reply.status(400).send({ message: '消息内容不能为空' });
    }
    if (body.contextFileIds !== undefined && !Array.isArray(body.contextFileIds)) {
      return reply.status(400).send({ message: '涓婁笅鏂囨枃浠跺弬鏁版棤鏁?' });
    }
    const contextFileIds = Array.isArray(body.contextFileIds)
      ? body.contextFileIds.filter((id): id is string => typeof id === 'string')
      : undefined;
    const validatedContext = contextFileIds
      ? dependencies.services.files.validateContextFileIds(task.userId, contextFileIds)
      : undefined;
    if (validatedContext && !validatedContext.ok) {
      return reply.status(400).send({ message: validatedContext.message });
    }
    const message = dependencies.services.messages.createMessage(task, {
      role: body.role,
      content,
      contextFileIds: validatedContext?.fileIds,
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
