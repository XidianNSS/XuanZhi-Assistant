import { authFetch } from './apiClient';
import type { Agent, Task, User } from '../types/protocol';

export type AdminStats = {
  users: number;
  agents: number;
  tasks: {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };
  gateway?: {
    connected: boolean;
    endpoint?: string;
  };
};

export function listUsers() {
  return authFetch<User[]>('/api/admin/users');
}

export function listAgents() {
  return authFetch<Agent[]>('/api/admin/agents');
}

export function listTasks() {
  return authFetch<Task[]>('/api/admin/tasks');
}

export function getStats() {
  return authFetch<AdminStats>('/api/admin/stats');
}
