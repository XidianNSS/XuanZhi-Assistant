import { useCallback, useState } from 'react';

import { promptDrafts } from '../../data/assistantData';
import type { ChatMessage } from '../../types/chat';
import { buildAssistantReply } from '../../utils/assistantReply';
import { ChatCanvas } from '../chat/ChatCanvas';
import { ChatComposer } from '../chat/ChatComposer';
import { ChatHome } from '../chat/ChatHome';
import { Sidebar } from './Sidebar';
import { WorkspaceHeader } from './WorkspaceHeader';

type AssistantShellProps = {
  onLogout: () => void;
};

export function AssistantShell({ onLogout }: AssistantShellProps) {
  const [activeKey, setActiveKey] = useState('today-1');
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const submitMessage = useCallback((value: string) => {
    const question = value.trim();

    if (!question) {
      return;
    }

    const timestamp = Date.now();
    const assistantKey = `assistant-${timestamp}`;

    setMessages((current) => [
      ...current,
      {
        key: `user-${timestamp}`,
        role: 'user',
        content: question,
        createdAt: timestamp,
      },
      {
        key: assistantKey,
        role: 'assistant',
        content: '',
        createdAt: timestamp,
        loading: true,
      },
    ]);
    setInputValue('');

    window.setTimeout(() => {
      setMessages((current) =>
        current.map((message) =>
          message.key === assistantKey
            ? {
                ...message,
                content: buildAssistantReply(question),
                loading: false,
                createdAt: Date.now(),
              }
            : message,
        ),
      );
    }, 620);
  }, []);

  const createConversation = useCallback(() => {
    setActiveKey('today-1');
    setMessages([]);
    setInputValue('');
  }, []);

  const selectPrompt = useCallback((key: string) => {
    setInputValue(promptDrafts[key] ?? '');
  }, []);

  const copyMessage = useCallback((content: string) => {
    void navigator.clipboard?.writeText(content);
  }, []);

  const editMessage = useCallback((content: string) => {
    setInputValue(content);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  const isChatting = messages.length > 0;

  return (
    <main className={`assistant-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <Sidebar
        activeKey={activeKey}
        collapsed={sidebarCollapsed}
        onActiveChange={setActiveKey}
        onCreateConversation={createConversation}
        onLogout={onLogout}
      />

      <section className={`assistant-main ${isChatting ? 'is-chatting' : 'is-home'}`}>
        <WorkspaceHeader
          sidebarCollapsed={sidebarCollapsed}
          onCreateConversation={createConversation}
          onToggleSidebar={toggleSidebar}
        />

        <div className="workspace-body">
          {isChatting ? (
            <ChatCanvas messages={messages} onCopyMessage={copyMessage} onEditMessage={editMessage} />
          ) : (
            <ChatHome
              inputValue={inputValue}
              onInputChange={setInputValue}
              onPromptSelect={selectPrompt}
              onSubmitMessage={submitMessage}
            />
          )}
        </div>

        {isChatting ? (
          <footer className="composer-area">
            <ChatComposer value={inputValue} variant="chat" onChange={setInputValue} onSubmit={submitMessage} />
          </footer>
        ) : null}
      </section>
    </main>
  );
}
