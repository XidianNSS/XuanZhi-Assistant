import type { AgentEventStatus, Task } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import { getOpenClawClient } from './openclawClient.js';

export async function runOpenClawAgent(
  task: Task,
  store: MemoryStore,
  stream: StreamHub,
): Promise<void> {
  const client = getOpenClawClient();

  const agent = store.getAgentByUserId(task.userId);
  if (!agent) {
    store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type: 'agent.not_found',
      title: 'Agent 未找到',
      message: `用户 ${task.userId} 尚未配置 Agent`,
      status: 'error',
    });
    store.updateTaskStatus(task.id, 'failed');
    return;
  }

  const publishTask = (status: Task['status']) => {
    const updated = store.updateTaskStatus(task.id, status);
    if (updated) {
      stream.broadcast(task.id, { type: 'task.updated', data: updated });
    }
  };

  const publishEvent = (type: string, title: string, status: AgentEventStatus, message?: string) => {
    const event = store.addEvent({
      userId: task.userId,
      taskId: task.id,
      type,
      title,
      message,
      status,
    });
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
    return event;
  };

  publishTask('running');
  store.updateAgentStatus(agent.id, 'running');
  publishEvent('task.dispatched', '任务已派发到 OpenClaw', 'running', task.userInput);

  try {
    // Ensure the agent exists on the Gateway
    let gatewayAgentId = agent.gatewayAgentId;
    if (!gatewayAgentId) {
      const workspace = agent.workspace || `xuanzhi-workspace-${agent.id}`;
      try {
        const created = await client.request<{
          ok: true;
          agentId: string;
          name: string;
          workspace: string;
        }>('agents.create', {
          name: agent.name,
          workspace,
        });
        gatewayAgentId = created.agentId;
        store.updateAgentGatewayInfo(agent.id, created.agentId, created.workspace);
        publishEvent('agent.created', `Gateway Agent 已创建: ${created.agentId}`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        publishEvent('agent.create.failed', 'Gateway Agent 创建失败', 'error', msg);
        throw err;
      }
    }

    // Create session for this agent (or reuse existing via session key)
    let session: { key: string };
    try {
      session = await client.request<{ key: string }>('sessions.create', {
        key: agent.sessionKey,
        agentId: gatewayAgentId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      publishEvent('session.create.failed', 'Session 创建失败', 'error', msg);
      throw err;
    }

    publishEvent('agent.execution.started', 'OpenClaw 开始执行', 'running');

    const promptWithContext = [
      `[任务ID: ${task.id}]`,
      `[任务意图: ${task.intent}]`,
      '',
      task.userInput,
    ].join('\n');

    await client.request('chat.send', {
      sessionKey: session.key,
      idempotencyKey: `task-${task.id}`,
      message: promptWithContext,
    });

    publishEvent('agent.execution.delivered', '任务已交付给 OpenClaw Agent', 'success');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'OpenClaw 执行失败';

    publishEvent('agent.execution.failed', 'OpenClaw 执行失败', 'error', errMsg);
    publishTask('failed');
    store.updateAgentStatus(agent.id, 'error');
  }
}
