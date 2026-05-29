import type { FastifyInstance } from 'fastify';

import { getOpenClawClient } from '../agents/openclawClient.js';

export function registerGatewayRoutes(app: FastifyInstance) {
  app.get('/api/gateway/status', async () => {
    return getOpenClawClient().getConnectionStatus();
  });
}
