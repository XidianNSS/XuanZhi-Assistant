import type { LoginResponse } from '@xuanzhi/shared/protocol';

import type { MemoryStore } from '../repositories/memoryStore.js';

export function createAuthService(store: MemoryStore) {
  return {
    register(email: string | undefined, name: string | undefined, password: string | undefined) {
      if (!email?.includes('@')) {
        return { error: '邮箱格式不正确' as const };
      }
      if (!name?.trim()) {
        return { error: '请输入用户名' as const };
      }
      if (!password || password.length < 6) {
        return { error: '密码至少需要 6 位' as const };
      }
      if (store.findUserByEmail(email)) {
        return { error: '该邮箱已被注册' as const };
      }

      const user = store.createUser({ email, name: name.trim(), password });
      const session = store.createSession(user.id);

      const result: LoginResponse = { token: session.token, user };
      return { data: result as LoginResponse };
    },

    login(email: string | undefined, password: string | undefined): LoginResponse | undefined {
      const user = email ? store.findUserByEmail(email) : undefined;
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
