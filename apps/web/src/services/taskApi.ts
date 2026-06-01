import { authFetch } from './apiClient';

import type { Approval, Task, TaskIntent } from '../types/protocol';

export function createTask(input: { title?: string; userInput: string; intent?: TaskIntent }) {
  return authFetch<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listTasks() {
  return authFetch<Task[]>('/api/tasks');
}

export function getTask(taskId: string) {
  return authFetch<Task>(`/api/tasks/${taskId}`);
}

export function getTaskApprovals(taskId: string) {
  return authFetch<Approval[]>(`/api/tasks/${taskId}/approvals`);
}
