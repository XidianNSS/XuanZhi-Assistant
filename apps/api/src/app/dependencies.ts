import { loadConfig, type AppConfig } from '../config/env.js';
import { createAgentRuntime } from '../agents/createAgentRuntime.js';
import { MemoryStore, testUsers } from '../repositories/memoryStore.js';
import { StreamHub } from '../realtime/streamHub.js';
import { createAgentService } from '../services/agentService.js';
import { createApprovalService } from '../services/approvalService.js';
import { createArtifactService } from '../services/artifactService.js';
import { createAuthService } from '../services/authService.js';
import { createEventService } from '../services/eventService.js';
import { createMessageService } from '../services/messageService.js';
import { createTaskService } from '../services/taskService.js';

export function createAppDependencies(config: AppConfig = loadConfig()) {
  const store = new MemoryStore();
  const stream = new StreamHub();
  const agentRuntime = createAgentRuntime(config, store, stream);

  const agentService = createAgentService(store);

  // 为种子用户创建 Agent
  for (const user of testUsers) {
    const existing = agentService.getAgentByUser(user.id);
    if (!existing) {
      agentService.createAgent(user.id, user.name);
    }
  }

  return {
    config,
    store,
    stream,
    services: {
      agents: agentService,
      approvals: createApprovalService(store, stream),
      artifacts: createArtifactService(store, stream),
      auth: createAuthService(store),
      events: createEventService(store, stream),
      messages: createMessageService(store, stream, agentRuntime),
      tasks: createTaskService(store, stream),
    },
  };
}

export type AppDependencies = ReturnType<typeof createAppDependencies>;
