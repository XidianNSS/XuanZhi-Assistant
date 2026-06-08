import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../src/repositories/memoryStore.js';
import { createSessionService } from '../src/services/sessionService.js';

function workspaceRootForCurrentPlatform(path: string) {
  return process.platform === 'win32' ? `\\\\?\\${path}` : path;
}

function jsonlMessage(role: string, text: string, id: string) {
  return JSON.stringify({
    id,
    timestamp: '2026-06-08T09:41:00.000Z',
    message: {
      role,
      content: [{ type: 'text', text }],
    },
  });
}

describe('session service', () => {
  let previousWorkspaceRoot: string | undefined;
  let tempRoot: string;

  beforeEach(() => {
    previousWorkspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT;
    tempRoot = mkdtempSync(join(tmpdir(), 'xuanzhi-session-'));
    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRootForCurrentPlatform(tempRoot);
  });

  afterEach(() => {
    if (previousWorkspaceRoot === undefined) delete process.env.OPENCLAW_WORKSPACE_ROOT;
    else process.env.OPENCLAW_WORKSPACE_ROOT = previousWorkspaceRoot;
    rmSync(tempRoot, { force: true, recursive: true });
  });

  it('does not replay OpenClaw tool output JSONL entries as chat messages', () => {
    const sessionsDir = join(tempRoot, 'agents', 'gateway-agent', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, 'session-1.jsonl'),
      [
        jsonlMessage('user', '介绍一下密码学', 'user-1'),
        jsonlMessage('assistant', '/bin/bash: line 1: pip3: command not found', 'tool-1'),
        jsonlMessage('assistant', '/usr/bin/python3: No module named pip', 'tool-2'),
        jsonlMessage(
          'assistant',
          'Successfully wrote 15750 bytes to /home/shen/.openclaw/workspace-xuanzhi-shen/密码学入门_HTML演示.html',
          'tool-3',
        ),
        jsonlMessage('assistant', '好了！以下是关于**密码学**的总结。\n\n# 密码学简介', 'assistant-1'),
      ].join('\n'),
      'utf8',
    );

    const sessions = createSessionService(new MemoryStore());

    expect(sessions.readSessionMessages('gateway-agent', 'session-1')).toEqual([
      expect.objectContaining({ id: 'user-1', role: 'user', content: '介绍一下密码学' }),
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        content: '好了！以下是关于**密码学**的总结。\n\n# 密码学简介',
      }),
    ]);
  });

  it('strips leading tool output when the final answer is in the same JSONL entry', () => {
    const sessionsDir = join(tempRoot, 'agents', 'gateway-agent', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, 'session-2.jsonl'),
      jsonlMessage(
        'assistant',
        [
          '/usr/bin/python3: No module named ensurepip',
          '',
          'Successfully wrote 15750 bytes to /home/shen/.openclaw/workspace-xuanzhi-shen/密码学入门_HTML演示.html',
          '',
          '好了！以下是关于**密码学**的总结。\n\n# 密码学简介',
        ].join('\n'),
        'assistant-2',
      ),
      'utf8',
    );

    const sessions = createSessionService(new MemoryStore());

    expect(sessions.readSessionMessages('gateway-agent', 'session-2')).toEqual([
      expect.objectContaining({
        id: 'assistant-2',
        role: 'assistant',
        content: '好了！以下是关于**密码学**的总结。\n\n# 密码学简介',
      }),
    ]);
  });
});
