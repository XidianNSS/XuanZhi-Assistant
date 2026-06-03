import { loadRuntimeEnv } from '../config/env.js';

const DEFAULT_OPENCLAW_WORKSPACE_ROOT = '/home/lin123/.openclaw';

function sanitizeWorkspaceSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function getOpenClawWorkspaceRoot() {
  return loadRuntimeEnv().OPENCLAW_WORKSPACE_ROOT?.trim() || DEFAULT_OPENCLAW_WORKSPACE_ROOT;
}

export function createXuanzhiWorkspacePath(userId: string) {
  const safeUserId = sanitizeWorkspaceSegment(userId) || 'user';
  return `${getOpenClawWorkspaceRoot().replace(/\/+$/, '')}/workspace-xuanzhi-${safeUserId}`;
}
