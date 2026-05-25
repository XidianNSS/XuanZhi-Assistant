export type AuthMode = 'login' | 'register';

export type ChatMessage = {
  key: string;
  role: 'assistant' | 'user';
  content: string;
  createdAt: number;
  loading?: boolean;
};

export type ComposerVariant = 'home' | 'chat';
