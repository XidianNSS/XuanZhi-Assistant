import Fastify from 'fastify';

import { createAppDependencies } from './app/dependencies.js';
import { registerRoutes } from './app/registerRoutes.js';
import type { AppConfig } from './config/env.js';
import { registerCors } from './http/cors.js';

export function buildApp(config?: AppConfig) {
  const app = Fastify({
    bodyLimit: 40 * 1024 * 1024,
    logger: false,
  });
  const dependencies = createAppDependencies(config);

  registerCors(app);
  registerRoutes(app, dependencies);

  return app;
}
