import type { FastifyInstance } from 'fastify';
import type { ArtifactFormat, ArtifactType } from '@xuanzhi/shared/protocol';

import type { AppDependencies } from '../app/dependencies.js';
import { requireOwnedTask, requireWritableTask } from '../http/taskGuards.js';
import { isArtifactFormat, isArtifactType } from '../schemas/protocolValidators.js';

export function registerArtifactRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  app.post('/api/tasks/:taskId/artifacts', async (request, reply) => {
    const task = requireWritableTask(request, reply, dependencies);
    if (!task) {
      return;
    }
    const body = request.body as {
      type?: ArtifactType;
      title?: string;
      format?: ArtifactFormat;
      content?: unknown;
      fileName?: string;
      mimeType?: string;
    };
    if (!isArtifactType(body.type) || !body.title || !isArtifactFormat(body.format)) {
      return reply.status(400).send({ message: '产物参数无效' });
    }
    const artifact = dependencies.services.artifacts.createArtifact(task, {
      type: body.type,
      title: body.title,
      format: body.format,
      content: body.content,
      fileName: body.fileName,
      mimeType: body.mimeType,
    });
    return reply.status(201).send(artifact);
  });

  app.get('/api/tasks/:taskId/artifacts', async (request, reply) => {
    const task = requireOwnedTask(request, reply, dependencies);
    if (!task) {
      return;
    }
    return dependencies.services.artifacts.listArtifacts(task.id);
  });
}
