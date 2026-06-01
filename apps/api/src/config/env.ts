import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export type AppConfig = {
  serviceToken: string;
  agentRuntime: 'mock' | 'direct';
  directModel?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
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

function normalizeAgentRuntime(value: string | undefined): AppConfig['agentRuntime'] {
  if (!value) {
    return 'mock';
  }
  if (value === 'mock' || value === 'direct') {
    return value;
  }
  throw new Error('XUANZHI_AGENT_RUNTIME must be "mock" or "direct"');
}

function normalizeTimeoutMs(value: string | undefined) {
  const timeoutMs = Number(value ?? 30000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
}

export function loadConfig(env: Env = loadRuntimeEnv()): AppConfig {
  const agentRuntime = normalizeAgentRuntime(optionalEnv(env, 'XUANZHI_AGENT_RUNTIME'));
  const baseUrl = optionalEnv(env, 'XUANZHI_MODEL_BASE_URL');
  const apiKey = optionalEnv(env, 'XUANZHI_MODEL_API_KEY');
  const model = optionalEnv(env, 'XUANZHI_MODEL_NAME');

  if (agentRuntime === 'direct') {
    const missing = [
      ['XUANZHI_MODEL_BASE_URL', baseUrl],
      ['XUANZHI_MODEL_API_KEY', apiKey],
      ['XUANZHI_MODEL_NAME', model],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(`XUANZHI_AGENT_RUNTIME=direct requires ${missing.join(', ')}`);
    }
  }

  return {
    serviceToken: optionalEnv(env, 'XUANZHI_API_TOKEN') ?? 'dev-token',
    agentRuntime,
    directModel:
      baseUrl && apiKey && model
        ? {
            baseUrl,
            apiKey,
            model,
            timeoutMs: normalizeTimeoutMs(optionalEnv(env, 'XUANZHI_MODEL_TIMEOUT_MS')),
          }
        : undefined,
  };
}
