import { authFetch } from './apiClient';
import type { SessionInfo, SessionMessage } from '../types/protocol';

export type SessionDetail = {
  session: SessionInfo;
  messages: SessionMessage[];
};

export function listSessions() {
  return authFetch<SessionInfo[]>('/api/sessions');
}

export function getSession(sessionId: string) {
  return authFetch<SessionDetail>(`/api/sessions/${sessionId}`);
}

export function getSessionMessages(sessionId: string) {
  return authFetch<SessionMessage[]>(`/api/sessions/${sessionId}/messages`);
}
