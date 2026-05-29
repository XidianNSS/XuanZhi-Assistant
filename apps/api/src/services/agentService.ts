import type { AgentStatus } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';

export function createAgentService(store: MemoryStore) {
  return {
    createAgent(userId: string, name: string) {
      return store.createAgent({ userId, name });
    },

    getAgent(agentId: string) {
      return store.getAgent(agentId);
    },

    getAgentByUser(userId: string) {
      return store.getAgentByUserId(userId);
    },

    ensureAgent(userId: string, name: string) {
      const existing = store.getAgentByUserId(userId);
      if (existing) return existing;
      return store.createAgent({ userId, name });
    },

    listAgentsForUser(userId: string) {
      return store.listAgentsByUserId(userId);
    },

    listAllAgents() {
      return store.listAgents();
    },

    updateAgentStatus(agentId: string, status: AgentStatus) {
      return store.updateAgentStatus(agentId, status);
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
