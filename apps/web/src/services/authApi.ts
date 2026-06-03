import { authFetch } from './apiClient';

import type { Agent, LoginResponse, User } from '../types/protocol';

export function login(input: { username: string; password: string }) {
  return authFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function register(input: { username: string; name?: string; password: string }) {
  return authFetch<LoginResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function me() {
  return authFetch<{ user: User; agent?: Agent }>('/api/auth/me');
}

export function logout() {
  return authFetch<void>('/api/auth/logout', {
    method: 'POST',
  });
}

export function gatewayStatus() {
  return authFetch<{ status: string; health: string; lastError: string | null }>('/api/gateway/status');
}
