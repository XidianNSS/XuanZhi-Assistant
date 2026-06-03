import type { Agent, AgentStatus } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';

export function createAgentService(store: MemoryStore) {
  return {
    createAgent(userId: string, name: string, opts?: {
      profile?: Agent['profile'];
      emoji?: string;
      model?: string;
      workspace?: string;
      gatewayAgentId?: string;
    }) {
      return store.createAgent({ userId, name, ...opts });
    },

    getAgent(agentId: string) {
      return store.getAgent(agentId);
    },

    getAgentByUser(userId: string) {
      return store.getAgentByUserId(userId);
    },

    ensureAgent(userId: string, name: string, opts?: { workspace?: string; gatewayAgentId?: string }) {
      const existing = store.getAgentByUserId(userId);
      if (existing) return existing;
      return store.createAgent({ userId, name, ...opts });
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

    updateAgentProfile(agentId: string, profile: Agent['profile']) {
      return store.updateAgentProfile(agentId, profile);
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
