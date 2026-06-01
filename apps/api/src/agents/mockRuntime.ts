import { runMockAgent, runMockFollowup } from './mockAgent.js';
import type { AgentRuntime } from './runtime.js';
import type { MemoryStore } from '../repositories/memoryStore.js';
import type { StreamHub } from '../realtime/streamHub.js';

export function createMockAgentRuntime(store: MemoryStore, stream: StreamHub): AgentRuntime {
  return {
    runTask(task) {
      runMockAgent(task, store, stream);
    },

    runFollowup(task, content) {
      runMockFollowup(task, content, store, stream);
    },
  };
}
