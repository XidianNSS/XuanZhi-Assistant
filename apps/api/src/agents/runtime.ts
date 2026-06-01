import type { Task } from '@xuanzhi/shared/protocol';

export type AgentRuntime = {
  runTask: (task: Task) => Promise<void> | void;
  runFollowup: (task: Task, content: string) => Promise<void> | void;
};
