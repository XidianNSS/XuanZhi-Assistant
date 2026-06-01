import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppDependencies } from '../src/app/dependencies.js';
import { loadConfig } from '../src/config/env.js';

async function waitForRuntime() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForCondition(assertion: () => void) {
  let lastError: unknown;
  for (let index = 0; index < 20; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await waitForRuntime();
    }
  }
  throw lastError;
}

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function openAiChunk(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function directDependencies() {
  return createAppDependencies({
    serviceToken: 'dev-token',
    agentRuntime: 'direct',
    directModel: {
      baseUrl: 'https://model.example/v1',
      apiKey: 'test-key',
      model: 'test-model',
      timeoutMs: 30000,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('direct agent runtime', () => {
  it('calls an OpenAI-compatible streaming chat completions API and completes the task', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamResponse([openAiChunk('streamed '), openAiChunk('answer'), 'data: [DONE]\n\n']),
    });
    vi.stubGlobal('fetch', fetchMock);

    const dependencies = directDependencies();
    const task = dependencies.services.tasks.createTask({
      userId: 'user_a',
      title: 'Direct runtime task',
      userInput: 'Summarize this',
      intent: 'general',
    });

    dependencies.services.messages.createMessage(task, {
      role: 'user',
      content: task.userInput,
    });
    await waitForCondition(() => {
      expect(dependencies.store.getOwnedTask(task.id, 'user_a')?.status).toBe('completed');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://model.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        }),
      }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(requestBody).toMatchObject({
      model: 'test-model',
      stream: true,
    });
    expect(requestBody.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Summarize this',
    });
    expect(dependencies.store.listMessages(task.id).at(-1)).toMatchObject({
      role: 'assistant',
      content: 'streamed answer',
      status: 'completed',
    });
    expect(dependencies.store.listEvents(task.id).map((event) => event.type)).toContain('agent.answer.created');
  });

  it('updates the same assistant message while streaming model chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: streamResponse([openAiChunk('**Meeting'), openAiChunk(' topic**'), 'data: [DONE]\n\n']),
      }),
    );

    const dependencies = directDependencies();
    const task = dependencies.services.tasks.createTask({
      userId: 'user_a',
      title: 'Direct runtime streaming',
      userInput: 'Draft a meeting plan',
      intent: 'general',
    });

    dependencies.services.messages.createMessage(task, {
      role: 'user',
      content: task.userInput,
    });
    await waitForCondition(() => {
      expect(dependencies.store.getOwnedTask(task.id, 'user_a')?.status).toBe('completed');
    });

    const messages = dependencies.store.listMessages(task.id);
    expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '**Meeting topic**',
      status: 'completed',
    });
  });

  it('marks the task failed and emits an error event when the model call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'server error',
      }),
    );

    const dependencies = directDependencies();
    const task = dependencies.services.tasks.createTask({
      userId: 'user_a',
      title: 'Direct runtime failure',
      userInput: 'Answer this',
      intent: 'general',
    });

    dependencies.services.messages.createMessage(task, {
      role: 'user',
      content: task.userInput,
    });
    await waitForCondition(() => {
      expect(dependencies.store.getOwnedTask(task.id, 'user_a')?.status).toBe('failed');
    });

    expect(dependencies.store.listEvents(task.id).at(-1)).toMatchObject({
      type: 'agent.error',
      status: 'error',
    });
    expect(dependencies.store.listMessages(task.id).at(-1)).toMatchObject({
      role: 'assistant',
      status: 'failed',
    });
  });

  it('marks the task failed when the model stream has no assistant content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: streamResponse(['data: [DONE]\n\n']),
      }),
    );

    const dependencies = directDependencies();
    const task = dependencies.services.tasks.createTask({
      userId: 'user_a',
      title: 'Direct runtime empty content',
      userInput: 'Answer this',
      intent: 'general',
    });

    dependencies.services.messages.createMessage(task, {
      role: 'user',
      content: task.userInput,
    });
    await waitForCondition(() => {
      expect(dependencies.store.getOwnedTask(task.id, 'user_a')?.status).toBe('failed');
    });

    expect(dependencies.store.listEvents(task.id).at(-1)).toMatchObject({
      type: 'agent.error',
      status: 'error',
      message: 'Model API stream did not include assistant content',
    });
    expect(dependencies.store.listMessages(task.id).at(-1)).toMatchObject({
      role: 'assistant',
      status: 'failed',
    });
  });
});

describe('agent runtime config', () => {
  it('requires model connection settings when direct runtime is selected', () => {
    expect(() =>
      loadConfig({
        XUANZHI_AGENT_RUNTIME: 'direct',
        XUANZHI_MODEL_BASE_URL: 'https://model.example/v1',
        XUANZHI_MODEL_NAME: 'test-model',
      }),
    ).toThrow(/XUANZHI_MODEL_API_KEY/);
  });
});
