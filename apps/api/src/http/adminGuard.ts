import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AppDependencies } from '../app/dependencies.js';
import { getUserAuth } from './auth.js';

export function requireAdmin(request: FastifyRequest, reply: FastifyReply, dependencies: AppDependencies) {
  const auth = getUserAuth(request, dependencies.store, dependencies.config);
  if (!auth || auth.user.role !== 'admin') {
    void reply.status(403).send({ message: '需要管理员权限' });
    return undefined;
  }
  return auth;
}
