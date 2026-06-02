import { buildApp } from './app.js';
import { loadConfig, loadRuntimeEnv } from './config/env.js';
import { getOpenClawClient } from './agents/openclawClient.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

// Load config and configure the OpenClaw client before starting
const config = loadConfig(loadRuntimeEnv());
getOpenClawClient().configure({
  wsUrl: config.openclaw.wsUrl,
  password: config.openclaw.password,
  requestTimeoutMs: config.openclaw.requestTimeoutMs,
});

// Start OpenClaw Gateway persistence connection (non-blocking)
getOpenClawClient().start();

const app = buildApp();

await app.listen({ host, port });
console.log(`Xuanzhi API listening on http://${host}:${port}`);
