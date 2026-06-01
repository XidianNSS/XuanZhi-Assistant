import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig, loadRuntimeEnv } from '../src/config/env.js';

let tempRoot: string | undefined;

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe('env file loading', () => {
  it('loads configuration from the nearest ancestor .env file', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'xuanzhi-env-'));
    const nestedDirectory = join(tempRoot, 'apps', 'api');
    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(
      join(tempRoot, '.env'),
      [
        'XUANZHI_API_TOKEN=file-token',
        'XUANZHI_AGENT_RUNTIME=direct',
        'XUANZHI_MODEL_BASE_URL=https://model.example/v1',
        'XUANZHI_MODEL_API_KEY=file-key',
        'XUANZHI_MODEL_NAME=file-model',
      ].join('\n'),
    );

    const config = loadConfig(loadRuntimeEnv(nestedDirectory, {}));

    expect(config).toMatchObject({
      serviceToken: 'file-token',
      agentRuntime: 'direct',
      directModel: {
        baseUrl: 'https://model.example/v1',
        apiKey: 'file-key',
        model: 'file-model',
      },
    });
  });

  it('lets process environment values override .env values', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'xuanzhi-env-'));
    writeFileSync(
      join(tempRoot, '.env'),
      [
        'XUANZHI_API_TOKEN=file-token',
        'XUANZHI_AGENT_RUNTIME=mock',
      ].join('\n'),
    );

    const config = loadConfig(
      loadRuntimeEnv(tempRoot, {
        XUANZHI_API_TOKEN: 'process-token',
      }),
    );

    expect(config.serviceToken).toBe('process-token');
    expect(config.agentRuntime).toBe('mock');
  });
});
