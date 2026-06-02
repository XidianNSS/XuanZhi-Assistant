import { authFetch } from './apiClient';

import type { LoginResponse, User } from '../types/protocol';

export function login(input: { email: string; password: string }) {
  return authFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function register(input: { email: string; name: string; password: string }) {
  return authFetch<LoginResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function me() {
  return authFetch<{ user: User }>('/api/auth/me');
}

export function logout() {
  return authFetch<void>('/api/auth/logout', {
    method: 'POST',
  });
}
