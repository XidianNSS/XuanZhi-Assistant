import { authFetch } from './apiClient';
import type { Agent, Task, XuanzhiAgentProfile } from '../types/protocol';

export type OpenClawProfileFile = {
  name: string;
  content: string;
  available: boolean;
  error?: string;
};

export type OpenClawAgentProfile = {
  agent: Agent;
  identity: unknown;
  files: OpenClawProfileFile[];
  bootstrapFiles: string[];
};

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

export function syncAgentProfile(agentId: string) {
  return authFetch<Agent>(`/api/agents/${agentId}/sync-profile`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getOpenClawAgentProfile(agentId: string) {
  return authFetch<OpenClawAgentProfile>(`/api/agents/${agentId}/openclaw-profile`);
}

export function openMainTask(agentId: string) {
  return authFetch<Task>(`/api/agents/${agentId}/main-task`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function createConversation(agentId: string, title = '新对话') {
  return authFetch<Task>(`/api/agents/${agentId}/conversations`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}
