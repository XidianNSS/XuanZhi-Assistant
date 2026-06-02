import { authFetch } from './apiClient';
import type { Agent, XuanzhiAgentProfile } from '../types/protocol';

export function listAgents() {
  return authFetch<Agent[]>('/api/agents');
}

export function getAgent(agentId: string) {
  return authFetch<Agent>(`/api/agents/${agentId}`);
}

export function createAgent(input: {
  name: string;
  profile?: XuanzhiAgentProfile | null;
  emoji?: string;
  model?: string;
}) {
  return authFetch<Agent>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAgentStatus(agentId: string, status: string) {
  return authFetch<Agent>(`/api/agents/${agentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function updateAgentProfile(agentId: string, profile: XuanzhiAgentProfile) {
  return authFetch<Agent>(`/api/agents/${agentId}/profile`, {
    method: 'PATCH',
    body: JSON.stringify({ profile }),
  });
}
