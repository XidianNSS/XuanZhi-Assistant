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
  it('loads OpenClaw Gateway configuration from the nearest ancestor .env file', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'xuanzhi-env-'));
    const nestedDirectory = join(tempRoot, 'apps', 'api');
    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(
      join(tempRoot, '.env'),
      [
        'XUANZHI_API_TOKEN=file-token',
        'OPENCLAW_WS_URL=ws://127.0.0.1:18789',
        'OPENCLAW_PASSWORD=file-gateway-token',
        'OPENCLAW_REQUEST_TIMEOUT=45000',
        'OPENCLAW_DEVICE_IDENTITY_PATH=.test-openclaw-device.json',
        'OPENCLAW_CLIENT_ID=xuanzhi-test-client',
        'OPENCLAW_CLIENT_MODE=backend-test',
        'OPENCLAW_SCOPES=operator.read, operator.write',
      ].join('\n'),
    );

    const config = loadConfig(loadRuntimeEnv(nestedDirectory, {}));

    expect(config).toMatchObject({
      serviceToken: 'file-token',
      openclaw: {
        wsUrl: 'ws://127.0.0.1:18789',
        password: 'file-gateway-token',
        requestTimeoutMs: 45000,
        deviceIdentityPath: '.test-openclaw-device.json',
        clientId: 'xuanzhi-test-client',
        clientMode: 'backend-test',
        scopes: ['operator.read', 'operator.write'],
      },
    });
  });

  it('lets process environment values override .env values', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'xuanzhi-env-'));
    writeFileSync(
      join(tempRoot, '.env'),
      [
        'XUANZHI_API_TOKEN=file-token',
        'OPENCLAW_WS_URL=ws://file.example:18789',
      ].join('\n'),
    );

    const config = loadConfig(
      loadRuntimeEnv(tempRoot, {
        XUANZHI_API_TOKEN: 'process-token',
        OPENCLAW_WS_URL: 'ws://process.example:18789',
      }),
    );

    expect(config.serviceToken).toBe('process-token');
    expect(config.openclaw.wsUrl).toBe('ws://process.example:18789');
  });
});
