import type { ServerResponse } from 'node:http';

import type { StreamEvent } from '@xuanzhi/shared/protocol';

// StreamHub 只按 taskId 分发消息；跨用户隔离依赖订阅路由在建立连接前完成鉴权。
// 这样插件和 Mock Agent 只需要广播 taskId，不能直接决定任何用户可见范围。
export class StreamHub {
  private readonly clients = new Map<string, Set<ServerResponse>>();

  add(taskId: string, response: ServerResponse) {
    const clients = this.clients.get(taskId) ?? new Set<ServerResponse>();
    clients.add(response);
    this.clients.set(taskId, clients);

    return () => {
      // 长连接断开后必须移除响应对象，否则后续广播会写入失效 socket 并泄漏内存。
      clients.delete(response);
      if (clients.size === 0) {
        this.clients.delete(taskId);
      }
    };
  }

  broadcast(taskId: string, event: StreamEvent) {
    const clients = this.clients.get(taskId);
    if (!clients) {
      return;
    }

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }
}
