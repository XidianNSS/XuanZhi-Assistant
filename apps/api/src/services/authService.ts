import type { LoginResponse } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';

function normalizeUsername(username: string | undefined) {
  return username?.trim().normalize('NFKC');
}

export function createAuthService(store: MemoryStore) {
  return {
    register(username: string | undefined, name: string | undefined, password: string | undefined) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername || normalizedUsername.length < 2 || normalizedUsername.length > 32) {
        return { error: '用户名需要 2-32 个字符' as const };
      }
      if (!password || password.length < 6) {
        return { error: '密码至少需要 6 位' as const };
      }
      if (store.findUserByUsername(normalizedUsername)) {
        return { error: '该用户名已被注册' as const };
      }

      const user = store.createUser({ username: normalizedUsername, name: name?.trim(), password });
      const session = store.createSession(user.id);

      const result: LoginResponse = { token: session.token, user };
      return { data: result };
    },

    login(username: string | undefined, password: string | undefined): LoginResponse | undefined {
      const normalizedUsername = normalizeUsername(username);
      const user = normalizedUsername ? store.findUserByUsername(normalizedUsername) : undefined;
      if (!user || !password) {
        return undefined;
      }
      if (!store.verifyPassword(user.id, password)) {
        return undefined;
      }
      const session = store.createSession(user.id);
      return { token: session.token, user };
    },

    logout(token: string) {
      store.deleteSession(token);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
