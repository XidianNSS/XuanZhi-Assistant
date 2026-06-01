import type { Message, Task } from '@xuanzhi/shared/protocol';

import type { AppConfig } from '../config/env.js';
import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import type { AgentRuntime } from './runtime.js';

type DirectModelConfig = NonNullable<AppConfig['directModel']>;

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
};

const directSystemPrompt = [
  '你是玄知助手的临时直连模型运行时。',
  '只生成自然语言回复，不执行外部动作，不创建审批，也不要声称已经操作外部系统。',
  '如果用户请求需要真实工具或外部系统，请说明当前只能提供方案、草稿或建议。',
].join('\n');

function chatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function modelMessages(messages: Message[]) {
  return [
    {
      role: 'system',
      content: directSystemPrompt,
    },
    ...messages.slice(-20).map((message) => ({
      role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
      content: message.content,
    })),
  ];
}

function chunkContent(payload: ChatCompletionChunk) {
  const content = payload.choices?.[0]?.delta?.content;
  return typeof content === 'string' ? content : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readStreamingContent(
  response: Response,
  onContent: (content: string) => void,
) {
  if (!response.body) {
    throw new Error('Model API response did not include a stream body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let accumulated = '';
  let doneSignalReceived = false;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return;
    }

    const data = trimmed.slice('data:'.length).trim();
    if (!data) {
      return;
    }
    if (data === '[DONE]') {
      doneSignalReceived = true;
      return;
    }

    let payload: ChatCompletionChunk;
    try {
      payload = JSON.parse(data) as ChatCompletionChunk;
    } catch {
      throw new Error('Model API returned an invalid stream chunk');
    }

    const content = chunkContent(payload);
    if (content) {
      accumulated += content;
      onContent(accumulated);
    }
  };

  while (!doneSignalReceived) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });

    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line);
      if (doneSignalReceived) {
        break;
      }
    }

    if (done) {
      if (buffered) {
        processLine(buffered);
      }
      break;
    }
  }

  if (!accumulated.trim()) {
    throw new Error('Model API stream did not include assistant content');
  }

  return accumulated;
}

export function createDirectAgentRuntime(
  config: DirectModelConfig,
  store: MemoryStore,
  stream: StreamHub,
): AgentRuntime {
  const publishTask = (task: Task, status: Task['status']) => {
    const updated = store.updateTaskStatus(task.id, status);
    if (updated) {
      stream.broadcast(task.id, { type: 'task.updated', data: updated });
    }
  };

  const publishEvent = (
    task: Task,
    input: {
      type: string;
      title: string;
      message?: string;
      status?: Parameters<MemoryStore['addEvent']>[0]['status'];
      payload?: unknown;
    },
  ) => {
    const event = store.addEvent({
      userId: task.userId,
      taskId: task.id,
      ...input,
    });
    stream.broadcast(task.id, { type: 'agent.event.created', data: event });
    return event;
  };

  const publishAssistantMessage = (task: Task, content: string, status?: Message['status']) => {
    const message = store.addMessage({
      userId: task.userId,
      taskId: task.id,
      role: 'assistant',
      content,
      status,
    });
    stream.broadcast(task.id, { type: 'message.created', data: message });
    return message;
  };

  const publishAssistantMessageUpdate = (
    task: Task,
    message: Message,
    input: { content?: string; status?: Message['status'] },
  ) => {
    const updated = store.updateMessage(task.id, message.id, input);
    if (updated) {
      stream.broadcast(task.id, { type: 'message.updated', data: updated });
      return updated;
    }
    return message;
  };

  const callModel = async (
    task: Task,
    messages: Message[],
    onContent: (content: string) => void,
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(chatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: modelMessages(messages),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Model API request failed: ${response.status} ${detail}`);
      }

      return readStreamingContent(response, onContent);
    } finally {
      clearTimeout(timeout);
    }
  };

  const run = async (task: Task) => {
    publishTask(task, 'running');
    publishEvent(task, {
      type: 'agent.analysis.started',
      title: '正在调用直连模型',
      status: 'running',
    });

    try {
      const requestMessages = store.listMessages(task.id);
      let assistantMessage = publishAssistantMessage(task, '', 'streaming');
      const content = await callModel(task, requestMessages, (nextContent) => {
        assistantMessage = publishAssistantMessageUpdate(task, assistantMessage, {
          content: nextContent,
          status: 'streaming',
        });
      });
      assistantMessage = publishAssistantMessageUpdate(task, assistantMessage, {
        content,
        status: 'completed',
      });
      publishEvent(task, {
        type: 'agent.answer.created',
        title: '已生成回复',
        status: 'success',
      });
      publishTask(task, 'completed');
    } catch (error) {
      const message = errorMessage(error);
      const existingAssistantMessage = [...store.listMessages(task.id)]
        .reverse()
        .find((item) => item.role === 'assistant' && item.status === 'streaming');
      if (existingAssistantMessage) {
        publishAssistantMessageUpdate(task, existingAssistantMessage, {
          content: '模型直连调用失败，请检查配置或稍后重试。',
          status: 'failed',
        });
      } else {
        publishAssistantMessage(task, '模型直连调用失败，请检查配置或稍后重试。', 'failed');
      }
      publishTask(task, 'failed');
      publishEvent(task, {
        type: 'agent.error',
        title: '模型直连调用失败',
        message,
        status: 'error',
      });
    }
  };

  return {
    runTask(task) {
      return run(task);
    },

    runFollowup(task) {
      return run(task);
    },
  };
}
