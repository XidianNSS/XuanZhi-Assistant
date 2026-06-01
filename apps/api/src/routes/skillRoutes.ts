import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { getOpenClawClient } from '../agents/openclawClient.js';
import { requireUserAuth } from '../http/taskGuards.js';

// ── Skill marketplace (browse/search from ClawHub) ──

export function registerSkillRoutes(app: FastifyInstance, _deps: AppDependencies) {
  // List skill catalog: search + bins
  app.get('/api/skills/catalog', async (request, reply) => {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      return reply.status(503).send({ message: 'Gateway 未连接' });
    }
    const query = (request.query as Record<string, string>).q;
    const limit = Number((request.query as Record<string, string>).limit) || 20;
    try {
      const [searchResult, binsResult] = await Promise.all([
        query
          ? client.request<{
              results: Array<{
                score: number;
                slug: string;
                displayName?: string;
                summary?: string;
                version?: string;
                updatedAt?: number;
              }>;
            }>('skills.search', { query, limit })
          : Promise.resolve(undefined),
        client.request<{ bins: string[] }>('skills.bins'),
      ]);
      return {
        results: searchResult?.results ?? [],
        bins: binsResult.bins,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ message: `获取技能目录失败: ${msg}` });
    }
  });

  // Skill detail
  app.get('/api/skills/catalog/:slug', async (request, reply) => {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      return reply.status(503).send({ message: 'Gateway 未连接' });
    }
    const { slug } = request.params as { slug: string };
    try {
      const detail = await client.request('skills.detail', { slug });
      return detail;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ message: `获取技能详情失败: ${msg}` });
    }
  });

  // ── Per-agent skills ──

  // List skills installed for a specific agent
  app.get('/api/agents/:agentId/skills', async (request, reply) => {
    const auth = requireUserAuth(request, reply, _deps);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };

    // Only admin or the agent's owner can view its skills
    const agent = _deps.store.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (auth.user.role !== 'admin' && agent.userId !== auth.user.id) {
      return reply.status(403).send({ message: '无权查看此 Agent 的技能' });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      return reply.status(503).send({ message: 'Gateway 未连接' });
    }
    try {
      const status = await client.request('skills.status', { agentId });
      return status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ message: `获取 Agent 技能失败: ${msg}` });
    }
  });

  // Install a skill for a specific agent
  app.post('/api/agents/:agentId/skills/install', async (request, reply) => {
    const auth = requireUserAuth(request, reply, _deps);
    if (!auth) return;
    const { agentId } = request.params as { agentId: string };

    const agent = _deps.store.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (auth.user.role !== 'admin' && agent.userId !== auth.user.id) {
      return reply.status(403).send({ message: '无权为此 Agent 安装技能' });
    }

    const body = request.body as { slug?: string; version?: string };
    if (!body.slug) {
      return reply.status(400).send({ message: '请提供技能 slug' });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      return reply.status(503).send({ message: 'Gateway 未连接' });
    }
    try {
      const result = await client.request('skills.install', {
        source: 'clawhub',
        slug: body.slug,
        version: body.version,
      });
      return reply.status(201).send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ message: `安装技能失败: ${msg}` });
    }
  });

  // Update (enable/disable/configure) a skill for an agent
  app.patch('/api/agents/:agentId/skills/:skillKey', async (request, reply) => {
    const auth = requireUserAuth(request, reply, _deps);
    if (!auth) return;
    const { agentId, skillKey } = request.params as { agentId: string; skillKey: string };

    const agent = _deps.store.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ message: 'Agent 不存在' });
    }
    if (auth.user.role !== 'admin' && agent.userId !== auth.user.id) {
      return reply.status(403).send({ message: '无权修改此 Agent 的技能' });
    }

    const body = request.body as { enabled?: boolean; apiKey?: string; env?: Record<string, string> };

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      return reply.status(503).send({ message: 'Gateway 未连接' });
    }
    try {
      const result = await client.request('skills.update', {
        skillKey,
        enabled: body.enabled,
        apiKey: body.apiKey,
        env: body.env,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ message: `更新技能失败: ${msg}` });
    }
  });
}
