import { apiUrl } from './apiClient';

import type { StreamEvent } from '../types/protocol';

export function subscribeTaskStream(
  taskId: string,
  token: string,
  onMessage: (event: StreamEvent) => void,
  onError: (error: Event) => void,
) {
  // NOTE(sse): 原生 EventSource 不能携带 Authorization header，MVP 使用查询参数传 token。
  // 后端仍会像 Bearer token 一样鉴权，并在订阅前校验 task 归属。
  const source = new EventSource(apiUrl(`/api/tasks/${taskId}/stream?token=${encodeURIComponent(token)}`));

  source.onmessage = (event) => {
    if (!event.data) {
      return;
    }
    onMessage(JSON.parse(event.data) as StreamEvent);
  };

  source.onerror = onError;

  return () => source.close();
}
