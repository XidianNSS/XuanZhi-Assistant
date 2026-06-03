import type { Agent, AgentEventStatus, MessagePlanStep, MessageStatus, Task } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import { getOpenClawClient } from './openclawClient.js';
import { syncAgentProfileFiles } from './profileFiles.js';
import { createXuanzhiWorkspacePath } from './workspace.js';

// ── Types ──

type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }>;
  };
  errorMessage?: string;
  errorKind?: 'refusal' | 'timeout' | 'rate_limit' | 'context_length' | 'unknown';
};

type GatewayAgentEvent = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};

type AgentHandle = {
  id: string;
  userId: string;
  name: string;
  gatewayAgentId: string | null;
  sessionKey: string;
  workspace: string;
  profile?: Agent['profile'];
  emoji?: string;
  model?: string;
};

const ASSISTANT_RESPONSE_TIMEOUT = 120_000;

// ── Text merge (Gateway sends deltas, not full text) ──

function mergeStreamText(current: string, incoming: string): string {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.startsWith(current)) return incoming;
  if (current.endsWith(incoming)) return current;
  const maxOverlap = Math.min(current.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (current.slice(-overlap) === incoming.slice(0, overlap)) {
      return current + incoming.slice(overlap);
    }
  }
  return current + incoming;
}

// ── Plan step helpers ──

function upsertStep(
  steps: MessagePlanStep[],
  text: string,
  status: MessagePlanStep['status'],
  stepId?: string,
): { steps: MessagePlanStep[]; id: string } {
  const id = stepId ?? `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idx = steps.findIndex((s) => s.id === id);
  const step: MessagePlanStep = { id, text, status };
  if (idx >= 0) {
    const updated = [...steps];
    updated[idx] = step;
    return { steps: updated, id };
  }
  return { steps: [...steps, step], id };
}

function parseToolData(data: Record<string, unknown>): { id?: string; label: string; detail: string } {
  const id = (data.toolCallId ?? data.callId ?? data.tool_use_id ?? data.id) as string | undefined;
  const label = (data.toolName ?? data.name ?? data.function_name ?? data.tool ?? data.command ?? data.action) as string | undefined;
  const detail = (data.arguments ?? data.args ?? data.input ?? data.params ?? data.query ?? data.text ?? data.message ?? data.output ?? data.content ?? data.result ?? data.value ?? data.description ?? data.summary ?? data.title ?? data.path ?? data.url ?? data.file ?? data.pattern ?? data.keyword) as string | undefined;
  return {
    id: typeof id === 'string' ? id : undefined,
    label: typeof label === 'string' ? label.replace(/^[^:]+:/, '') : '未知操作',
    detail: typeof detail === 'string' ? detail.slice(0, 200) : '',
  };
}

function extractChatText(payload: ChatEventPayload): string | null {
  return (
    payload.message?.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
      .trim() || null
  );
}

// ── Agent helpers factory ──

type AgentHelpers = ReturnType<typeof createAgentHelpers>;

async function syncProfileFilesSafely(
  client: ReturnType<typeof getOpenClawClient>,
  agent: AgentHandle,
  helpers: AgentHelpers,
) {
  if (!agent.profile || !agent.gatewayAgentId) {
    return;
  }

  try {
    await syncAgentProfileFiles(client, agent);
    helpers.publishEvent('agent.profile.synced', 'Agent 配置已同步到 OpenClaw', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[agents] profile sync skipped:', message);
    helpers.publishEvent(
      'agent.profile.sync_skipped',
      'Agent 配置同步失败，已继续执行对话',
      'error',
      message,
    );
  }
}

function createAgentHelpers(task: Task, store: MemoryStore, stream: StreamHub) {
  const publishTaskStatus = (status: Task['status']) => {
    const updated = store.updateTaskStatus(task.id, status);
    if (updated) {
      stream.broadcast(task.id, { type: 'task.updated', data: updated });
    }
  };

  const publishEvent = (
    type: string,
    title: string,
    status: AgentEventStatus,
    message?: string,
  ) => {
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

  return {
    publishTaskStatus,

    publishEvent,

    createStreamingMessage(): string {
      const msg = store.addMessage({
        userId: task.userId,
        taskId: task.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
      });
      stream.broadcast(task.id, { type: 'message.created', data: msg });
      return msg.id;
    },

    updateStreamingMessage(messageId: string, content: string, planSteps?: MessagePlanStep[]): void {
      const updated = store.updateMessage(task.id, messageId, {
        content,
        status: 'streaming' as MessageStatus,
        planSteps,
      });
      if (updated) {
        stream.broadcast(task.id, { type: 'message.updated', data: updated });
      }
    },

    finalizeMessage(messageId: string, content: string, planSteps?: MessagePlanStep[]): void {
      const updated = store.updateMessage(task.id, messageId, {
        content,
        status: 'completed' as MessageStatus,
        planSteps,
      });
      if (updated) {
        stream.broadcast(task.id, { type: 'message.updated', data: updated });
      }
    },

    publishCompletedMessage(content: string) {
      const msg = store.addMessage({
        userId: task.userId,
        taskId: task.id,
        role: 'assistant',
        content,
        status: 'completed' as MessageStatus,
      });
      stream.broadcast(task.id, { type: 'message.created', data: msg });
      return msg;
    },
  };
}

// ── Gateway agent lifecycle ──

async function ensureGatewayAgent(
  client: ReturnType<typeof getOpenClawClient>,
  agent: AgentHandle,
  store: MemoryStore,
  helpers: AgentHelpers,
): Promise<string> {
  if (agent.gatewayAgentId) {
    await syncProfileFilesSafely(client, agent, helpers);
    return agent.gatewayAgentId;
  }

  // Fallback: search existing Gateway agents by agent.id (which is globally unique)
  try {
    const listResult = await client.request<{
      agents?: Array<{ id: string; name?: string; workspace?: string }>;
    }>('agents.list');
    const existing = listResult?.agents?.find((a) =>
      a.name === agent.id || a.workspace === agent.workspace,
    );
    if (existing?.id) {
      const updated = store.updateAgentGatewayInfo(agent.id, existing.id, existing.workspace ?? '');
      if (updated) {
        await syncProfileFilesSafely(client, updated, helpers);
      }
      helpers.publishEvent(
        'agent.found',
        `Gateway Agent 已存在: ${existing.id}`,
        'success',
      );
      return existing.id;
    }
  } catch {
    // list failed — fall through to create
  }

  helpers.publishEvent(
    'agent.create.starting',
    '正在创建 Gateway Agent',
    'running',
  );

  // Use agent.id (UUID) as the name to guarantee uniqueness
  const workspace = agent.workspace || createXuanzhiWorkspacePath(agent.userId);
  try {
    const created = await client.request<{
      ok: true;
      agentId: string;
      name: string;
      workspace: string;
    }>('agents.create', {
      name: agent.id,
      workspace,
    });

    const updated = store.updateAgentGatewayInfo(agent.id, created.agentId, created.workspace);

    // Update display name
    if (updated?.profile) {
      await syncProfileFilesSafely(client, updated, helpers);
    } else {
      client.request('agents.update', {
        agentId: created.agentId,
        name: agent.name,
      }).catch(() => {});
    }

    helpers.publishEvent(
      'agent.created',
      `Gateway Agent 已创建: ${created.agentId}`,
      'success',
    );
    return created.agentId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    helpers.publishEvent('agent.create.failed', 'Gateway Agent 创建失败', 'error', msg);
    throw err;
  }
}

async function ensureSession(
  client: ReturnType<typeof getOpenClawClient>,
  gatewayAgentId: string,
  store: MemoryStore,
  agent: AgentHandle,
  task: Task,
): Promise<{ key: string }> {
  if (task.sessionKey) {
    return { key: task.sessionKey };
  }

  // Create/reuse main session. Using key "main" — the Gateway resolves it to
  // "agent:{gatewayAgentId}:main" and returns the canonical key in the response.
  const mainResult = await client.request<{ key: string }>('sessions.create', {
    key: 'main',
    agentId: gatewayAgentId,
    label: `${agent.name} 的主对话`,
  });

  // Task child session: linked to main via the canonical parentSessionKey
  // (must use the full "agent:{gatewayAgentId}:{rest}" format for lookup to work)
  const taskSessionKey = `task:${gatewayAgentId}:${task.id}`;
  return client.request<{ key: string }>('sessions.create', {
    key: taskSessionKey,
    agentId: gatewayAgentId,
    label: task.title || task.userInput.slice(0, 50),
    parentSessionKey: mainResult.key,
  });
}

// ── Stream response with real-time delta forwarding + agent events ──

function streamResponse(
  client: ReturnType<typeof getOpenClawClient>,
  sessionKey: string,
  taskId: string,
  messageId: string,
  helpers: AgentHelpers,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let accumulatedText = '';
    let planSteps: MessagePlanStep[] = [];
    let stepCounter = 0;

    const timer = setTimeout(() => {
      unsubChat();
      unsubAgent();
      console.warn(`[OpenClawAgent] response timeout for task ${taskId}`);
      resolve(accumulatedText || null);
    }, ASSISTANT_RESPONSE_TIMEOUT);

    const broadcastSteps = () => {
      helpers.updateStreamingMessage(messageId, accumulatedText, planSteps);
    };

    // ── Chat stream (text deltas) ──

    const unsubChat = client.on<ChatEventPayload>('chat', (payload) => {
      if (payload.sessionKey !== sessionKey) return;

      if (payload.state === 'delta') {
        const text = extractChatText(payload);
        if (text) {
          accumulatedText = mergeStreamText(accumulatedText, text);
          helpers.updateStreamingMessage(messageId, accumulatedText, planSteps);
        }
        return;
      }

      if (payload.state === 'final') {
        clearTimeout(timer);
        unsubChat();
        unsubAgent();
        const text = extractChatText(payload);
        if (text) accumulatedText = text;
        // Mark any remaining "running" steps as "done"
        if (planSteps.some((s) => s.status === 'running')) {
          planSteps = planSteps.map((s) =>
            s.status === 'running' ? { ...s, status: 'done' as const } : s,
          );
        }
        helpers.finalizeMessage(messageId, accumulatedText, planSteps);
        resolve(accumulatedText);
        return;
      }

      if (payload.state === 'aborted' || payload.state === 'error') {
        clearTimeout(timer);
        unsubChat();
        unsubAgent();
        const reason = payload.errorMessage ?? `Agent ${payload.state}`;
        console.warn(`[OpenClawAgent] task ${taskId} ${payload.state}: ${reason}`);
        const text = extractChatText(payload);
        if (text) accumulatedText = text;
        helpers.finalizeMessage(messageId, accumulatedText, planSteps);
        resolve(accumulatedText);
      }
    });

    // ── Agent events (tool calls, reasoning, status) ──

    const unsubAgent = client.on<GatewayAgentEvent>('agent', (payload) => {
      if (payload.sessionKey && payload.sessionKey !== sessionKey) return;

      const { stream, data } = payload;

      // "assistant" stream carries text chunks inside data — merge as regular text
      if (stream === 'assistant') {
        const text = extractRawText(data);
        if (text) {
          accumulatedText = mergeStreamText(accumulatedText, text);
          helpers.updateStreamingMessage(messageId, accumulatedText, planSteps);
        }
        return;
      }

      // Phase events (start/end)
      if ((data as { phase?: string }).phase === 'end') {
        planSteps = planSteps.map((s) =>
          s.status === 'running' ? { ...s, status: 'done' as const } : s,
        );
        broadcastSteps();
        return;
      }
      if ((data as { phase?: string }).phase === 'start') {
        const { label } = parseToolData(data);
        stepCounter++;
        const result = upsertStep(planSteps, label || '开始执行…', 'running', `phase-${stepCounter}`);
        planSteps = result.steps;
        broadcastSteps();
        return;
      }

      // Lifecycle / liveness — no visual step
      if (stream === 'lifecycle' || stream === 'liveness') return;

      // Tool call streams → create "running" step
      const toolStreams = new Set([
        'tool_call', 'tool_use', 'item', 'exec', 'process',
        'task', 'read', 'write', 'search', 'browse', 'agent',
      ]);
      if (toolStreams.has(stream)) {
        const { id, label, detail } = parseToolData(data);
        stepCounter++;
        const stepId = id || `tool-${stepCounter}`;
        const stepText = detail ? `${label}: ${detail}` : label;
        const result = upsertStep(planSteps, stepText, 'running', stepId);
        planSteps = result.steps;
        helpers.publishEvent('tool.started', label, 'running', detail);
        broadcastSteps();
        return;
      }

      // Tool result streams → mark matching step as "done"
      const resultStreams = new Set(['tool_result', 'command_output', 'output', 'result']);
      if (resultStreams.has(stream)) {
        const { id, label, detail } = parseToolData(data);
        if (id) {
          const idx = planSteps.findIndex((s) => s.id === id);
          if (idx >= 0) {
            planSteps[idx] = { ...planSteps[idx], status: 'done' };
          }
        } else {
          // Mark most recent "running" step as done
          const lastRunning = [...planSteps].reverse().find((s) => s.status === 'running');
          if (lastRunning) {
            planSteps = planSteps.map((s) =>
              s.id === lastRunning.id ? { ...s, status: 'done' as const } : s,
            );
          }
        }
        helpers.publishEvent('tool.completed', label || '操作完成', 'success', detail);
        broadcastSteps();
        return;
      }

      // Reasoning / thinking — add as transient step
      if (stream === 'reasoning' || stream === 'think') {
        const text = (data.text ?? data.message ?? '') as string;
        if (text) {
          const shortText = typeof text === 'string' ? text.slice(0, 80) : String(text).slice(0, 80);
          stepCounter++;
          const result = upsertStep(planSteps, `思考: ${shortText}`, 'running', `think-${stepCounter}`);
          planSteps = result.steps;
          broadcastSteps();
        }
        return;
      }

      // Status update
      if (stream === 'status') {
        const text = (data.text ?? data.message ?? '') as string;
        if (text && typeof text === 'string') {
          stepCounter++;
          const result = upsertStep(planSteps, String(text).slice(0, 100), 'running', `status-${stepCounter}`);
          planSteps = result.steps;
          broadcastSteps();
        }
        return;
      }

      // Error
      if (stream === 'error') {
        const msg = (data.message ?? data.text ?? '执行出错') as string;
        stepCounter++;
        const result = upsertStep(planSteps, `✗ ${String(msg).slice(0, 150)}`, 'error', `error-${stepCounter}`);
        planSteps = result.steps;
        helpers.publishEvent('tool.error', '操作出错', 'error', String(msg).slice(0, 500));
        broadcastSteps();
        return;
      }

      // Fallback for unknown streams
      const { label, detail } = parseToolData(data);
      if (label && label !== '未知操作') {
        stepCounter++;
        const stepText = detail ? `${label}: ${detail}` : label;
        const result = upsertStep(planSteps, stepText, 'running', `generic-${stepCounter}`);
        planSteps = result.steps;
        broadcastSteps();
      }
    });
  });
}

function extractRawText(data: Record<string, unknown>): string | null {
  if (typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.delta === 'string') return data.delta;
  if (data.message && typeof data.message === 'object') {
    const m = data.message as Record<string, unknown>;
    if (typeof m.content === 'string') return m.content;
    if (typeof m.text === 'string') return m.text;
  }
  return null;
}

// ── Single entry point ──

export async function runOpenClawSession(
  task: Task,
  content: string,
  store: MemoryStore,
  stream: StreamHub,
  isFollowup = false,
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

  const helpers = createAgentHelpers(task, store, stream);

  try {
    helpers.publishTaskStatus('running');
    store.updateAgentStatus(agent.id, 'running');

    // 1. Ensure Gateway agent exists
    const gatewayAgentId = await ensureGatewayAgent(client, agent, store, helpers);

    // 2. Create/reuse main + task session on the Gateway
    const session = await ensureSession(client, gatewayAgentId, store, agent, task);

    // 3. Publish dispatch event
    if (isFollowup) {
      helpers.publishEvent(
        'task.followup.dispatched',
        '跟进消息已派发到 OpenClaw',
        'running',
        content,
      );
    } else {
      helpers.publishEvent(
        'task.dispatched',
        '任务已派发到 OpenClaw',
        'running',
        task.userInput,
      );
    }

    // 4. Send message to the Gateway agent
    const dispatchContent = content;
    const idempotencyKey = isFollowup
      ? `followup-${task.id}-${Date.now()}`
      : `task-${task.id}`;

    await client.request('chat.send', {
      sessionKey: session.key,
      idempotencyKey,
      message: dispatchContent,
    });

    helpers.publishEvent(
      'agent.execution.delivered',
      '任务已交付给 OpenClaw Agent',
      'success',
    );

    // 5. Stream the assistant response + agent events
    const messageId = helpers.createStreamingMessage();
    const responseText = await streamResponse(client, session.key, task.id, messageId, helpers);

    if (responseText) {
      helpers.publishEvent('agent.answer.created', 'Agent 已生成回复', 'success');
    }

    helpers.publishTaskStatus('completed');
    store.updateAgentStatus(agent.id, 'idle');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'OpenClaw 执行失败';

    helpers.publishEvent('agent.execution.failed', 'OpenClaw 执行失败', 'error', errMsg);
    helpers.publishTaskStatus('failed');
    store.updateAgentStatus(agent.id, 'error');
  }
}
