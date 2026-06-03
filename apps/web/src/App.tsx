import { useCallback, useEffect, useState } from 'react';
import zhCNX from '@ant-design/x/locale/zh_CN';
import { XProvider } from '@ant-design/x';

import { AssistantShell } from './components/assistant/AssistantShell';
import { AuthScreen } from './components/auth/AuthScreen';
import { Spinner, Toaster, toast } from './components/ui';
import * as authApi from './services/authApi';
import { clearAuthToken, getAuthToken, persistLogin } from './stores/authStore';
import type { User } from './types/protocol';

const setupFlagPrefix = 'xuanzhi.agentSetup.pending.';

function markPendingAgentSetup(userId: string) {
  window.localStorage.setItem(`${setupFlagPrefix}${userId}`, '1');
}

function App() {
  const [currentUser, setCurrentUser] = useState<User>();
  const [token, setToken] = useState(() => getAuthToken() ?? '');
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [authLoading, setAuthLoading] = useState(false);
  const [gatewayState, setGatewayState] = useState<{
    status: 'checking' | 'online' | 'offline';
    detail?: string;
  }>({ status: 'checking' });

  const checkGateway = useCallback(async () => {
    setGatewayState({ status: 'checking' });
    try {
      const status = await authApi.gatewayStatus();
      setGatewayState({
        status: status.status === 'connected' && status.health === 'healthy' ? 'online' : 'offline',
        detail: status.lastError ?? `${status.status} / ${status.health}`,
      });
    } catch (error) {
      setGatewayState({
        status: 'offline',
        detail: error instanceof Error ? error.message : '玄知后端暂时不可用',
      });
    }
  }, []);

  useEffect(() => {
    void checkGateway();
  }, [checkGateway]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    authApi
      .me()
      .then(({ user }) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        clearAuthToken();
        if (!cancelled) {
          setToken('');
          setCurrentUser(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (values: { username: string; password: string }) => {
    setAuthLoading(true);
    try {
      const response = await authApi.login(values);
      persistLogin(response);
      setToken(response.token);
      setCurrentUser(response.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const register = useCallback(async (values: { username: string; name?: string; password: string }) => {
    setAuthLoading(true);
    try {
      const response = await authApi.register(values);
      persistLogin(response);
      markPendingAgentSetup(response.user.id);
      setToken(response.token);
      setCurrentUser(response.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '注册失败');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Local cleanup still runs if the token is already invalid.
    }
    clearAuthToken();
    setToken('');
    setCurrentUser(undefined);
  }, []);

  return (
    <XProvider
      locale={zhCNX}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 10,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }}
    >
      {checkingSession ? (
        <main className="app-loading">
          <Spinner size="large" />
        </main>
      ) : currentUser && token ? (
        <AssistantShell currentUser={currentUser} token={token} onLogout={logout} />
      ) : (
        <AuthScreen
          gatewayState={gatewayState}
          loading={authLoading}
          onCheckGateway={checkGateway}
          onLogin={login}
          onRegister={register}
        />
      )}
      <Toaster />
    </XProvider>
  );
}

export default App;
