import type { AppConfig } from '../config/env.js';
import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';
import { createDirectAgentRuntime } from './directRuntime.js';
import { createMockAgentRuntime } from './mockRuntime.js';
import type { AgentRuntime } from './runtime.js';

export function createAgentRuntime(config: AppConfig, store: MemoryStore, stream: StreamHub): AgentRuntime {
  if (config.agentRuntime === 'direct') {
    if (!config.directModel) {
      throw new Error('Direct agent runtime requires direct model configuration');
    }
    return createDirectAgentRuntime(config.directModel, store, stream);
  }

  return createMockAgentRuntime(store, stream);
}
