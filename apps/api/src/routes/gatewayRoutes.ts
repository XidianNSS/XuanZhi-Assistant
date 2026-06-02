import type { FastifyInstance } from 'fastify';

import { getOpenClawClient } from '../agents/openclawClient.js';

export function registerGatewayRoutes(app: FastifyInstance) {
  const client = getOpenClawClient();

  // ── Connection status ──

  app.get('/api/gateway/status', async () => {
    return client.getConnectionStatus();
  });

  // ── Health ──

  app.get('/api/gateway/health', async () => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    return client.request('health');
  });

  // ── Gateway agents ──

  app.get('/api/gateway/agents', async () => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    return client.request('agents.list');
  });

  // ── Gateway sessions ──

  app.get('/api/gateway/sessions', async () => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    return client.request('sessions.list');
  });

  // ── Registered tools (from plugins) ──

  app.get('/api/gateway/tools', async () => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    return client.request('tools.catalog');
  });

  // ── Skill marketplace ──

  app.get('/api/gateway/skills/search', async (request) => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    const { q } = request.query as { q?: string };
    return client.request('skills.search', { q: q ?? '' });
  });

  app.post('/api/gateway/skills/install', async (request) => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    const { skillId } = request.body as { skillId: string };
    if (!skillId) {
      return { ok: false, message: 'skillId 必填' };
    }
    return client.request('skills.install', { skillId });
  });

  app.get('/api/gateway/skills', async () => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    return client.request('skills.status');
  });

  app.get('/api/gateway/skills/detail', async (request) => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    const { id } = request.query as { id?: string };
    if (!id) return { ok: false, message: 'id 必填' };
    return client.request('skills.detail', { id });
  });

  // ── Gateway models ──

  app.get('/api/gateway/models', async () => {
    if (!client.isConnected()) {
      return { ok: false, message: 'Gateway 未连接' };
    }
    return client.request('models.list');
  });
}
