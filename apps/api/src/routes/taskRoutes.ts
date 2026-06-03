import type { FastifyInstance } from 'fastify';

import type { TaskIntent, TaskStatus } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { getAuth } from '../http/auth.js';
import { requireOwnedTask, requireUserAuth } from '../http/taskGuards.js';
import { isTaskStatus, normalizeTaskIntent } from '../schemas/protocolValidators.js';

export function registerTaskRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/tasks', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) {
      return;
    }
    const body = request.body as { agentId?: string; title?: string; userInput?: string; intent?: TaskIntent };
    const userInput = body.userInput?.trim();
    if (!userInput) {
      return reply.status(400).send({ message: '请输入任务内容' });
    }
    if (body.agentId) {
      const agent = dependencies.services.agents.getAgent(body.agentId);
      if (!agent || (agent.userId !== auth.user.id && auth.user.role !== 'admin')) {
        return reply.status(404).send({ message: 'Agent 不存在' });
      }
    }
    const task = dependencies.services.tasks.createTask({
      userId: auth.user.id,
      agentId: body.agentId,
      title: body.title,
      userInput,
      intent: normalizeTaskIntent(body.intent),
    });
    return reply.status(201).send(task);
  });

  app.get('/api/tasks', async (request, reply) => {
    const auth = requireUserAuth(request, reply, dependencies);
    if (!auth) {
      return;
    }
    return dependencies.services.tasks.listTasksForUser(auth.user.id);
  });

  app.get('/api/tasks/:taskId', async (request, reply) => {
    const task = requireOwnedTask(request, reply, dependencies);
    if (!task) {
      return;
    }
    return task;
  });

  app.patch('/api/tasks/:taskId/status', async (request, reply) => {
    const auth = getAuth(request, dependencies.store, dependencies.config);
    if (!auth) {
      return reply.status(401).send({ message: '未授权' });
    }
    const { taskId } = request.params as { taskId: string };
    const body = request.body as { status?: TaskStatus };
    if (!isTaskStatus(body.status)) {
      return reply.status(400).send({ message: '任务状态无效' });
    }
    const updated = dependencies.services.tasks.updateStatus(
      taskId,
      body.status,
      auth.kind === 'user' ? auth.user.id : undefined,
    );
    if (!updated) {
      return reply.status(404).send({ message: '任务不存在' });
    }
    return updated;
  });
}
