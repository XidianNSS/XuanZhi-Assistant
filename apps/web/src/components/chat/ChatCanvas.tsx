import { useMemo } from 'react';
import { Bubble } from '@ant-design/x';

import type { ChatMessage } from '../../types/chat';
import { MessageActions } from './MessageActions';

const bubbleRoles = {
  assistant: {
    placement: 'start' as const,
    variant: 'borderless' as const,
    shape: 'round' as const,
    className: 'assistant-message',
    typing: { effect: 'typing' as const, step: 4, interval: 24 },
    styles: {
      content: {
        background: 'transparent',
        border: 0,
        boxShadow: 'none',
        padding: 0,
      },
    },
  },
  user: {
    placement: 'end' as const,
    variant: 'filled' as const,
    shape: 'round' as const,
    className: 'user-message',
    styles: {
      content: {
        background: '#eaf2ff',
        color: '#172033',
      },
    },
  },
};

type ChatCanvasProps = {
  messages: ChatMessage[];
  onCopyMessage: (content: string) => void;
  onEditMessage: (content: string) => void;
};

export function ChatCanvas({ messages, onCopyMessage, onEditMessage }: ChatCanvasProps) {
  const bubbleItems = useMemo(
    () =>
      messages.map((message) => ({
        key: message.key,
        role: message.role,
        content: message.content,
        loading: message.loading,
        footer: message.loading ? null : (
          <MessageActions message={message} onCopy={onCopyMessage} onEdit={onEditMessage} />
        ),
        footerPlacement: message.role === 'user' ? ('outer-end' as const) : ('outer-start' as const),
      })),
    [messages, onCopyMessage, onEditMessage],
  );

  return (
    <div className="chat-canvas">
      <Bubble.List items={bubbleItems} role={bubbleRoles} autoScroll className="bubble-list" />
    </div>
  );
}
