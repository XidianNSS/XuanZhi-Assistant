import { getAuthToken } from '../stores/authStore';

// 留空时走 Vite dev proxy 或同源部署；配置 VITE_API_BASE_URL 后可指向独立 API 服务。
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function authFetch<T>(path: string, init: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || response.statusText, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
