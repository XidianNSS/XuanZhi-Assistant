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

function parseErrorMessage(text: string, fallback: string) {
  if (!text) return fallback;
  try {
    const data = JSON.parse(text) as { message?: unknown };
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
  } catch {
    // Plain text responses are also valid error payloads.
  }
  return text;
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

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiError(
      '玄知后端暂时不可用，请先启动后端服务，或检查 127.0.0.1:3000 是否可访问。',
      0,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(parseErrorMessage(text, response.statusText), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
