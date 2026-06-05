import type { Agent, Task, TaskIntent, TaskStatus } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import { listOpenClawAgents, listOpenClawSessions, type OpenClawSessionRow } from '../agents/openclawNative.js';

function titleFromInput(userInput: string) {
  const title = userInput.trim().replace(/\s+/g, ' ').slice(0, 28);
  return title || 'æ–°ä»»åŠ¡';
}

function stripInternalSessionLabel(title: string) {
  return title.replace(/\s\([a-zA-Z0-9-]{8}\)$/, '');
}

export function createTaskService(store: MemoryStore, stream: StreamHub) {
  function getSessionKey(session: OpenClawSessionRow) {
    return session.sessionKey ?? session.key ?? session.id ?? '';
  }

  function sessionBelongsToAgent(session: OpenClawSessionRow, agent: Agent) {
    const key = getSessionKey(session);
    return Boolean(
      agent.gatewayAgentId
        && (
          session.agentId === agent.gatewayAgentId
          || key.startsWith(`agent:${agent.gatewayAgentId}:`)
          || key.includes(`task:${agent.gatewayAgentId}:`)
        ),
    );
  }

  function taskIdFromSession(session: OpenClawSessionRow, agent: Agent) {
    const key = getSessionKey(session);
    const marker = agent.gatewayAgentId ? `task:${agent.gatewayAgentId}:` : '';
    const markerIndex = marker ? key.indexOf(marker) : -1;
    if (markerIndex >= 0) {
      const taskId = key.slice(markerIndex + marker.length);
      if (taskId.startsWith('task_')) return taskId;
    }
    const taskId = key.match(/task_[a-zA-Z0-9-]+/)?.[0];
    if (taskId) return taskId;
    return `session_${key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 96)}`;
  }

  function isoFromSessionDate(value: string | number | undefined) {
    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }
    return new Date().toISOString();
  }

  function taskFromSession(session: OpenClawSessionRow, agent: Agent): Task {
    const key = getSessionKey(session);
    const updatedAt = isoFromSessionDate(session.updatedAt ?? session.createdAt);
    const fallbackTitle = key.endsWith(':main')
      ? `${agent.name} main`
      : `OpenClaw session ${session.sessionKey?.slice(0, 8) || session.id?.slice(0, 8) || key.split(':').at(-1) || ''}`.trim();
    const title = stripInternalSessionLabel(
      session.displayName?.trim()
      || session.label?.trim()
      || session.title?.trim()
      || session.name?.trim()
      || fallbackTitle
      || 'OpenClaw session',
    );
    return {
      id: taskIdFromSession(session, agent),
      userId: agent.userId,
      agentId: agent.id,
      sessionKey: key,
      title: title.slice(0, 80),
      userInput: title,
      intent: 'general',
      status: session.status === 'running' ? 'running' : 'completed',
      createdAt: isoFromSessionDate(session.createdAt),
      updatedAt,
    };
  }

  async function listSessionTasksForUser(userId: string) {
    const localAgents = store.listAgentsByUserId(userId);
    const openClawAgents = await listOpenClawAgents().catch(() => []);
    const agents = localAgents
      .map((agent) => {
        if (agent.gatewayAgentId) return agent;
        const matched = openClawAgents.find((item) => item.workspace === agent.workspace);
        if (!matched?.id) return agent;
        return store.updateAgentGatewayInfo(agent.id, matched.id, matched.workspace ?? agent.workspace) ?? agent;
      })
      .filter((agent) => agent.gatewayAgentId);
    if (agents.length === 0) {
      return [];
    }
    try {
      const sessions = await listOpenClawSessions(200);
      return sessions
        .flatMap((session) => {
          const agent = agents.find((item) => sessionBelongsToAgent(session, item));
          return agent ? [taskFromSession(session, agent)] : [];
        })
        .filter((task) => task.sessionKey);
    } catch {
      return [];
    }
  }

  function mergeLocalAndSessionTask(localTask: Task | undefined, sessionTask: Task | undefined): Task {
    if (!localTask && sessionTask) return sessionTask;
    if (!sessionTask && localTask) return localTask;
    if (!localTask || !sessionTask) {
      throw new Error('Cannot merge empty task records');
    }

    const sessionIsNewer = sessionTask.updatedAt.localeCompare(localTask.updatedAt) > 0;
    const shouldUseSessionTitle =
      sessionIsNewer
      && !localTask.title.trim();
    const title = shouldUseSessionTitle ? sessionTask.title : localTask.title;

    return {
      ...localTask,
      agentId: localTask.agentId ?? sessionTask.agentId,
      sessionKey: sessionTask.sessionKey ?? localTask.sessionKey,
      title,
      userInput: localTask.userInput === localTask.title ? title : localTask.userInput,
      status: localTask.status === 'running' ? localTask.status : sessionTask.status,
      createdAt: localTask.createdAt || sessionTask.createdAt,
      updatedAt: sessionIsNewer ? sessionTask.updatedAt : localTask.updatedAt,
    };
  }

  return {
    createTask(input: { userId: string; agentId?: string; title?: string; userInput: string; intent: TaskIntent }) {
      const task = store.createTask({
        userId: input.userId,
        agentId: input.agentId,
        title: input.title?.trim() || titleFromInput(input.userInput),
        userInput: input.userInput,
        intent: input.intent,
      });
      const event = store.addEvent({
        userId: task.userId,
        taskId: task.id,
        type: 'task.created',
        title: 'å·²åˆ›å»ºä»»åŠ¡',
        status: 'success',
      });
      stream.broadcast(task.id, { type: 'agent.event.created', data: event });
      return task;
    },

    async listTasksForUser(userId: string) {
      const localTasks = store.listTasksForUser(userId);
      const sessionTasks = await listSessionTasksForUser(userId);
      sessionTasks.forEach((task) => store.upsertTask(task));
      const merged = new Map<string, Task>();
      localTasks.forEach((task) => {
        merged.set(task.id, mergeLocalAndSessionTask(task, undefined));
      });
      sessionTasks.forEach((task) => {
        merged.set(task.id, mergeLocalAndSessionTask(merged.get(task.id), task));
      });
      return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    getOwnedTask(taskId: string, userId: string) {
      return store.getOwnedTask(taskId, userId);
    },

    getWritableTask(taskId: string, userId?: string) {
      const task = store.tasks.get(taskId);
      if (!task || (userId && task.userId !== userId)) {
        return undefined;
      }
      return task;
    },

    updateStatus(taskId: string, status: TaskStatus, userId?: string) {
      const task = this.getWritableTask(taskId, userId);
      if (!task) {
        return undefined;
      }
      const updated = store.updateTaskStatus(taskId, status);
      if (updated) {
        stream.broadcast(taskId, { type: 'task.updated', data: updated });
      }
      return updated;
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
