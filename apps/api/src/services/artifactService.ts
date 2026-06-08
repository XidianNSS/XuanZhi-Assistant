import { randomUUID } from 'node:crypto';

import type { ArtifactFormat, ArtifactType, Task } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import type { FileAssetService } from './fileAssetService.js';

export function createArtifactService(store: MemoryStore, stream: StreamHub, files: FileAssetService) {
  return {
    createArtifact(task: Task, input: {
      type: ArtifactType;
      title: string;
      format: ArtifactFormat;
      content: unknown;
      fileName?: string;
      mimeType?: string;
    }) {
      const artifactId = `art_${randomUUID()}`;
      const fileAsset = files.createFileFromArtifact({
        task,
        artifactId,
        title: input.title,
        type: input.type,
        format: input.format,
        content: input.content,
        fileName: input.fileName,
        mimeType: input.mimeType,
      });
      const artifact = store.addArtifact({
        id: artifactId,
        userId: task.userId,
        taskId: task.id,
        type: input.type,
        title: input.title,
        format: input.format,
        content: input.content,
        fileAsset,
      });
      stream.broadcast(task.id, { type: 'artifact.created', data: artifact });
      stream.broadcast(task.id, { type: 'file.asset.created', data: fileAsset });
      return artifact;
    },

    listArtifacts(taskId: string) {
      return store.listArtifacts(taskId);
    },
  };
}

export type ArtifactService = ReturnType<typeof createArtifactService>;
