import type { Message, Task } from '@xuanzhi/shared/protocol';

import { getOpenClawClient } from '../agents/openclawClient.js';
import { runOpenClawSession } from '../agents/agentRunner.js';
import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import type { FileAssetService } from './fileAssetService.js';
import type { SessionService } from './sessionService.js';

export function createMessageService(
  store: MemoryStore,
  stream: StreamHub,
  sessionService?: SessionService,
  fileService?: FileAssetService,
) {
  const handleRuntimeFailure = (task: Task, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const assistantMessage = store.addMessage({
      userId: task.userId,
      taskId: task.id,
      role: 'assistant',
      content: 'Agent 运行失败，请稍后重试。',
    });
    stream.broadcast(task.id, { type: 'message.created', data: assistantMessage });

    const updated = store.updateTaskStatus(task.id, 'failed');
    if (updated) {
      stream.broadcast(task.id, { type: 'task.updated', data: updated });
    }

    const event = store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'agent.error',
      title: 'Agent 运行失败',
      message,
      status: 'error',
    });
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
  };

  const runAgent = (task: Task, handler: () => Promise<void> | void) => {
    void Promise.resolve(handler()).catch((error) => handleRuntimeFailure(task, error));
  };

  return {
    createMessage(task: Task, input: { role?: Message['role']; content: string; contextFileIds?: string[] }) {
      const message = store.addMessage({
        userId: task.userId,
        taskId: task.id,
        role: input.role === 'assistant' || input.role === 'system' ? input.role : 'user',
        content: input.content,
        contextFileIds: input.contextFileIds,
      });
      stream.broadcast(task.id, { type: 'message.created', data: message });

      // 所有消息走 OpenClaw Gateway Agent
      if (message.role === 'user') {
        const client = getOpenClawClient();
        const agent = store.getAgentByUserId(task.userId);
        const contextText = input.contextFileIds?.length && fileService
          ? fileService.buildContextText(task.userId, input.contextFileIds)
          : '';
        const runtimeContent = contextText
          ? `${message.content}\n\n---\n以下文件已加入本轮上下文：\n${contextText}`
          : message.content;

        if (input.contextFileIds?.length && fileService) {
          fileService.recordUsedInChat(task.userId, input.contextFileIds, task.id);
        }

        if (client.isConnected()) {
          const isFollowup = !!agent?.gatewayAgentId;
          runAgent(task, () =>
            runOpenClawSession(task, runtimeContent, store, stream, isFollowup),
          );
        } else {
          // OpenClaw 未连接，先触发连接再执行
          runAgent(task, async () => {
            await client.connect();
            const freshAgent = store.getAgentByUserId(task.userId);
            const isFollowup = !!freshAgent?.gatewayAgentId;
            await runOpenClawSession(task, runtimeContent, store, stream, isFollowup);
          });
        }
      }

      return message;
    },

    listMessages(taskId: string) {
      const local = store.listMessages(taskId);
      if (local.length > 0) return local;

      // Fallback: try loading from OpenClaw session JSONL on disk
      if (sessionService) {
        const task = store.tasks.get(taskId);
        if (task?.sessionKey) {
          const agent = store.getAgentByUserId(task.userId);
          if (agent?.gatewayAgentId) {
            const sessionId = sessionService.resolveSessionId(
              agent.gatewayAgentId,
              task.sessionKey,
            );
            if (sessionId) {
              const sessionMessages = sessionService.readSessionMessages(
                agent.gatewayAgentId,
                sessionId,
              );
              if (sessionMessages.length > 0) {
                return sessionMessages.map((sm) => ({
                  id: sm.id,
                  userId: task.userId,
                  taskId: task.id,
                  role: sm.role,
                  content: sm.content,
                  status: 'completed' as const,
                  createdAt: sm.createdAt,
                }));
              }
            }
          }
        }
      }

      return [];
    },
  };
}

export type MessageService = ReturnType<typeof createMessageService>;
