import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export type AppConfig = {
  serviceToken: string;
  openclaw: {
    wsUrl: string;
    password?: string;
    requestTimeoutMs: number;
    autoRegisterPlugin: boolean;
    deviceIdentityPath: string;
    clientId: string;
    clientMode: string;
    scopes: string[];
  };
};

type Env = Record<string, string | undefined>;

function parseDotEnv(content: string): Env {
  const env: Env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function findNearestEnvFile(startDirectory: string) {
  let current = startDirectory;
  const root = parse(current).root;

  while (true) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return undefined;
    }
    current = dirname(current);
  }
}

export function loadRuntimeEnv(startDirectory = process.cwd(), processEnv: Env = process.env): Env {
  const envFile = findNearestEnvFile(startDirectory);
  const fileEnv = envFile ? parseDotEnv(readFileSync(envFile, 'utf8')) : {};
  return {
    ...fileEnv,
    ...processEnv,
  };
}

function optionalEnv(env: Env, key: string) {
  const value = env[key]?.trim();
  return value || undefined;
}

function normalizeTimeoutMs(value: string | undefined) {
  const timeoutMs = Number(value ?? 30000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
}

function normalizeScopes(value: string | undefined) {
  const raw = value ?? 'operator.read,operator.write,operator.admin';
  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function loadConfig(env: Env = loadRuntimeEnv()): AppConfig {
  const wsUrl = optionalEnv(env, 'OPENCLAW_WS_URL') ?? 'ws://127.0.0.1:18789';
  const password = optionalEnv(env, 'OPENCLAW_PASSWORD');
  const autoRegisterPlugin = optionalEnv(env, 'OPENCLAW_AUTO_REGISTER_PLUGIN') !== 'false';

  return {
    serviceToken: optionalEnv(env, 'XUANZHI_API_TOKEN') ?? 'dev-token',
    openclaw: {
      wsUrl,
      password,
      requestTimeoutMs: normalizeTimeoutMs(optionalEnv(env, 'OPENCLAW_REQUEST_TIMEOUT')),
      autoRegisterPlugin,
      deviceIdentityPath: optionalEnv(env, 'OPENCLAW_DEVICE_IDENTITY_PATH') ?? '.openclaw-device.json',
      clientId: optionalEnv(env, 'OPENCLAW_CLIENT_ID') ?? 'gateway-client',
      clientMode: optionalEnv(env, 'OPENCLAW_CLIENT_MODE') ?? 'backend',
      scopes: normalizeScopes(optionalEnv(env, 'OPENCLAW_SCOPES')),
    },
  };
}
