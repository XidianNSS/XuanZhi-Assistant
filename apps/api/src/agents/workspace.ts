import { loadRuntimeEnv } from '../config/env.js';

const DEFAULT_OPENCLAW_WORKSPACE_ROOT = '/home/lin123/.openclaw';

function sanitizeWorkspaceSegment(value: string) {
  return value
    .trim()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function getOpenClawWorkspaceRoot() {
  return loadRuntimeEnv().OPENCLAW_WORKSPACE_ROOT?.trim() || DEFAULT_OPENCLAW_WORKSPACE_ROOT;
}

export function createXuanzhiWorkspacePath(username: string) {
  const root = getOpenClawWorkspaceRoot().replace(/\/+$/, '');
  const safeUsername = sanitizeWorkspaceSegment(username) || 'user';
  if (safeUsername.toLowerCase() === 'main') {
    return `${root}/workspace`;
  }
  return `${root}/workspace-xuanzhi-${safeUsername}`;
}
