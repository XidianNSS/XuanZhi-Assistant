import { useCallback, useEffect, useState } from 'react';
import zhCNX from '@ant-design/x/locale/zh_CN';
import { XProvider } from '@ant-design/x';

import { AssistantShell } from './components/assistant/AssistantShell';
import { AuthScreen } from './components/auth/AuthScreen';
import { Spinner, Toaster, toast } from './components/ui';
import * as authApi from './services/authApi';
import { clearAuthToken, getAuthToken, persistLogin } from './stores/authStore';
import type { User } from './types/protocol';

function App() {
  const [currentUser, setCurrentUser] = useState<User>();
  const [token, setToken] = useState(() => getAuthToken() ?? '');
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [authLoading, setAuthLoading] = useState(false);

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

  const login = useCallback(async (values: { email: string; password: string }) => {
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

  const register = useCallback(async (values: { email: string; name: string; password: string }) => {
    setAuthLoading(true);
    try {
      const response = await authApi.register(values);
      persistLogin(response);
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
        <AuthScreen loading={authLoading} onLogin={login} onRegister={register} />
      )}
      <Toaster />
    </XProvider>
  );
}

export default App;
