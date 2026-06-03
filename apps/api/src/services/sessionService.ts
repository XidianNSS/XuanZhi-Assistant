import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SessionInfo, SessionMessage } from '@xuanzhi/shared/protocol';

import { getOpenClawWorkspaceRoot } from '../agents/workspace.js';
import type { MemoryStore } from '../repositories/memoryStore.js';

// ── Path helpers ──

/**
 * Convert a Linux-style WSL path to a Windows UNC path that Node.js can read.
 * /home/lin123/.openclaw → //wsl.localhost/Ubuntu/home/lin123/.openclaw
 *
 * Falls back to the original path when the translation doesn't apply (e.g.
 * running inside WSL directly, or the path is already a Windows path).
 */
function toWindowsWslPath(linuxPath: string): string {
  if (!linuxPath || linuxPath.startsWith('\\\\') || linuxPath.startsWith('//')) {
    return linuxPath;
  }

  // Only translate if we're on Windows and the path looks like a WSL Linux path
  if (process.platform !== 'win32') {
    return linuxPath;
  }

  // Detect WSL distro name from environment or default to "Ubuntu"
  const distro = process.env.WSL_DISTRO_NAME?.trim() || 'Ubuntu';

  // /home/lin123/.openclaw → //wsl.localhost/Ubuntu/home/lin123/.openclaw
  return `//wsl.localhost/${distro}${linuxPath}`;
}

function getAgentsDir(): string {
  const root = getOpenClawWorkspaceRoot().replace(/\/+$/, '');
  const linuxPath = `${root}/agents`;
  return toWindowsWslPath(linuxPath);
}

function getSessionsDir(gatewayAgentId: string): string {
  return join(getAgentsDir(), gatewayAgentId, 'sessions');
}

// ── JSONL parsing ──

interface JsonlMessage {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  role?: string;
  content?: Array<{ type: string; text?: string }>;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('\n');
}

function normalizeRole(role: string | undefined): SessionMessage['role'] {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return 'system';
}

function parseJsonlLine(line: string, index: number): SessionMessage | null {
  if (!line.trim()) return null;

  let raw: JsonlMessage;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }

  // Extract role and content from both top-level and nested message formats
  const role = raw.message?.role ?? raw.role;
  const content = raw.message?.content ?? raw.content;

  if (!role || !content) return null;

  const text = extractTextContent(content);
  if (!text.trim()) return null;

  return {
    id: raw.id || `session-msg-${index}`,
    role: normalizeRole(role),
    content: text,
    createdAt: raw.timestamp || new Date().toISOString(),
  };
}

// ── Session info from sessions.json ──

interface DiskSessionEntry {
  sessionId?: string;
  sessionKey?: string;
  key?: string;
  status?: string;
  title?: string;
  name?: string;
  label?: string;
  totalTokens?: number;
  estimatedCostUsd?: number;
  runtimeMs?: number;
  modelProvider?: string;
  model?: string;
  startedAt?: number;
  endedAt?: number;
  updatedAt?: number;
  sessionStartedAt?: number;
  parentSessionKey?: string;
  childSessions?: string[];
}

function sessionInfoFromDiskEntry(
  key: string,
  entry: DiskSessionEntry,
  agentId: string,
): SessionInfo {
  const updatedAt = entry.updatedAt || entry.sessionStartedAt || Date.now();
  const createdAt = entry.sessionStartedAt || entry.startedAt || updatedAt;
  const title =
    entry.title?.trim()
    || entry.name?.trim()
    || entry.label?.trim()
    || key.split(':').at(-1)
    || 'OpenClaw Session';

  return {
    sessionId: entry.sessionId || key,
    sessionKey: entry.key || key,
    agentId,
    title: title.slice(0, 80),
    status: entry.status || 'unknown',
    totalTokens: entry.totalTokens,
    estimatedCostUsd: entry.estimatedCostUsd,
    runtimeMs: entry.runtimeMs,
    modelProvider: entry.modelProvider,
    model: entry.model,
    startedAt:
      typeof entry.startedAt === 'number'
        ? new Date(entry.startedAt).toISOString()
        : undefined,
    endedAt:
      typeof entry.endedAt === 'number'
        ? new Date(entry.endedAt).toISOString()
        : undefined,
    parentSessionKey: entry.parentSessionKey,
    childSessions: entry.childSessions,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

// ── Service ──

export function createSessionService(store: MemoryStore) {
  /**
   * Read the sessions.json index for a specific Gateway agent.
   * Returns parsed session metadata entries.
   */
  function readSessionsIndex(gatewayAgentId: string): SessionInfo[] {
    const dir = getSessionsDir(gatewayAgentId);
    const indexPath = join(dir, 'sessions.json');

    if (!existsSync(indexPath)) {
      return [];
    }

    let raw: Record<string, DiskSessionEntry>;
    try {
      raw = JSON.parse(readFileSync(indexPath, 'utf8'));
    } catch {
      return [];
    }

    if (!raw || typeof raw !== 'object') return [];

    return Object.entries(raw)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .map(([key, entry]) => sessionInfoFromDiskEntry(key, entry, gatewayAgentId));
  }

  /**
   * Read session messages from a JSONL file on disk.
   */
  function readSessionMessages(
    gatewayAgentId: string,
    sessionId: string,
  ): SessionMessage[] {
    // Fast path: check MemoryStore first for active sessions
    const localMessages = store.listMessages(sessionId);
    if (localMessages.length > 0) {
      return localMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));
    }

    // Fallback: read JSONL from OpenClaw disk
    const dir = getSessionsDir(gatewayAgentId);
    const jsonlPath = join(dir, `${sessionId}.jsonl`);

    if (!existsSync(jsonlPath)) {
      return [];
    }

    let text: string;
    try {
      text = readFileSync(jsonlPath, 'utf8');
    } catch {
      return [];
    }

    return text
      .split(/\r?\n/)
      .map((line, index) => parseJsonlLine(line, index))
      .filter((msg): msg is SessionMessage => msg !== null);
  }

  /**
   * Get full session detail: metadata + messages.
   */
  function getSessionDetail(gatewayAgentId: string, sessionId: string): {
    session: SessionInfo | null;
    messages: SessionMessage[];
  } {
    const sessions = readSessionsIndex(gatewayAgentId);
    const session = sessions.find((s) => s.sessionId === sessionId) ?? null;
    const messages = readSessionMessages(gatewayAgentId, sessionId);

    return { session, messages };
  }

  /**
   * Resolve a sessionKey (e.g. "agent:main:main") to the OpenClaw sessionId (UUID).
   * Returns undefined if not found in the sessions index.
   */
  function resolveSessionId(gatewayAgentId: string, sessionKey: string): string | undefined {
    const dir = getSessionsDir(gatewayAgentId);
    const indexPath = join(dir, 'sessions.json');

    if (!existsSync(indexPath)) return undefined;

    let raw: Record<string, DiskSessionEntry>;
    try {
      raw = JSON.parse(readFileSync(indexPath, 'utf8'));
    } catch {
      return undefined;
    }

    // Direct key lookup
    if (raw[sessionKey]?.sessionId) {
      return raw[sessionKey].sessionId;
    }

    // Fallback: scan all entries for matching key/sessionId
    return Object.values(raw).find(
      (entry) => entry.key === sessionKey || entry.sessionId === sessionKey,
    )?.sessionId;
  }

  /**
   * List sessions for a given user by looking up their agent's Gateway agent ID
   * and reading its sessions index from disk.
   */
  function listSessionsForUser(userId: string): SessionInfo[] {
    const agent = store.getAgentByUserId(userId);
    if (!agent?.gatewayAgentId) return [];

    return readSessionsIndex(agent.gatewayAgentId);
  }

  return {
    readSessionsIndex,
    readSessionMessages,
    getSessionDetail,
    listSessionsForUser,
    resolveSessionId,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
