import type { FastifyInstance } from 'fastify';

import type { AppDependencies } from './dependencies.js';
import { registerAdminRoutes } from '../routes/adminRoutes.js';
import { registerAgentRoutes } from '../routes/agentRoutes.js';
import { registerApprovalRoutes } from '../routes/approvalRoutes.js';
import { registerArtifactRoutes } from '../routes/artifactRoutes.js';
import { registerAuthRoutes } from '../routes/authRoutes.js';
import { registerEventRoutes } from '../routes/eventRoutes.js';
import { registerGatewayRoutes } from '../routes/gatewayRoutes.js';
import { registerMessageRoutes } from '../routes/messageRoutes.js';
import { registerSkillRoutes } from '../routes/skillRoutes.js';
import { registerStreamRoutes } from '../routes/streamRoutes.js';
import { registerTaskRoutes } from '../routes/taskRoutes.js';

export function registerRoutes(app: FastifyInstance, dependencies: AppDependencies) {
  registerAuthRoutes(app, dependencies);
  registerAgentRoutes(app, dependencies);
  registerAdminRoutes(app, dependencies);
  registerTaskRoutes(app, dependencies);
  registerMessageRoutes(app, dependencies);
  registerEventRoutes(app, dependencies);
  registerArtifactRoutes(app, dependencies);
  registerApprovalRoutes(app, dependencies);
  registerSkillRoutes(app, dependencies);
  registerStreamRoutes(app, dependencies);
  registerGatewayRoutes(app);
}
