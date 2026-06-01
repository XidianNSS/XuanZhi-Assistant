import { buildApp } from './app.js';
import { getOpenClawClient } from './agents/openclawClient.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

// 启动 OpenClaw Gateway 持久连接（非阻塞，Gateway 离线不影响 API 启动）
getOpenClawClient().start();

const app = buildApp();

await app.listen({ host, port });
console.log(`Xuanzhi API listening on http://${host}:${port}`);
