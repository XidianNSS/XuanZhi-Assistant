import { useState } from 'react';
import zhCN from 'antd/locale/zh_CN';
import zhCNX from '@ant-design/x/locale/zh_CN';
import { XProvider } from '@ant-design/x';

import { AssistantShell } from './components/assistant/AssistantShell';
import { AuthScreen } from './components/auth/AuthScreen';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <XProvider
      locale={{ ...zhCN, ...zhCNX }}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 10,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }}
    >
      {isAuthenticated ? (
        <AssistantShell onLogout={() => setIsAuthenticated(false)} />
      ) : (
        <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />
      )}
    </XProvider>
  );
}

export default App;
