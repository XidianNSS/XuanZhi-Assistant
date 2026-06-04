import type { Agent } from '@xuanzhi/shared/protocol';

import { getOpenClawClient } from './openclawClient.js';
import { syncAgentProfileFiles } from './profileFiles.js';

export type OpenClawAgentRow = {
  id: string;
  name?: string;
  workspace?: string;
  status?: string;
};

export type OpenClawSessionRow = {
  id?: string;
  key?: string;
  sessionKey?: string;
  title?: string;
  name?: string;
  label?: string;
  displayName?: string;
  status?: string;
  mode?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  progress?: number;
  agentId?: string;
};

export type OpenClawToolRow = {
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  tags?: string[];
};

async function ensureConnected() {
  const client = getOpenClawClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  return client;
}

function getList<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const object = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(object[key])) {
      return object[key] as T[];
    }
  }
  return [];
}

export async function listOpenClawAgents() {
  const client = await ensureConnected();
  const payload = await client.request('agents.list');
  return getList<OpenClawAgentRow>(payload, ['agents', 'items']);
}

export async function listOpenClawSessions(limit = 50) {
  const client = await ensureConnected();
  const payload = await client.request('sessions.list', { limit });
  return getList<OpenClawSessionRow>(payload, ['sessions', 'items']);
}

export async function listOpenClawTools() {
  const client = await ensureConnected();
  const payload = await client.request<{ groups?: Array<{ tools?: OpenClawToolRow[] }>; tools?: OpenClawToolRow[] }>(
    'tools.catalog',
  );
  if (Array.isArray(payload.tools)) {
    return payload.tools;
  }
  return payload.groups?.flatMap((group) => group.tools ?? []) ?? [];
}

export async function readOpenClawAgentFile(agentId: string, name: string) {
  const client = await ensureConnected();
  return client.request<{ file?: { content?: string } }>('agents.files.get', { agentId, name });
}

export async function writeOpenClawAgentFile(agentId: string, name: string, content: string) {
  const client = await ensureConnected();
  return client.request('agents.files.set', { agentId, name, content });
}

export async function syncProfileToOpenClaw(agent: Agent) {
  const client = await ensureConnected();
  await syncAgentProfileFiles(client, agent);
}

export function isXuanzhiAgentForWorkspace(agent: OpenClawAgentRow, workspace: string) {
  return Boolean(agent.id) && agent.workspace === workspace;
}
