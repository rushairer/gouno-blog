import { apiFetch, isLoggedIn } from '../auth';

function isUnsafe(method?: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method || 'GET').toUpperCase());
}

function readBlogCSRFToken(): string | null {
  const cookie = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith('blog_csrf_token='));
  return cookie ? decodeURIComponent(cookie.slice('blog_csrf_token='.length)) : null;
}

/** Fetch a public Blog API route with the same credential and CSRF policy as authenticated calls. */
export function publicApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (isUnsafe(init.method) && !headers.has('X-CSRF-Token')) {
    const token = readBlogCSRFToken();
    if (token) headers.set('X-CSRF-Token', token);
  }
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}

/** Use the SDK for known sessions, preserving anonymous access for community routes. */
export function optionalApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return isLoggedIn() ? apiFetch(input.toString(), init) : publicApiFetch(input, init);
}

export async function readData<T>(response: Response | Promise<Response>): Promise<T> {
  const resolved = await response;
  const body = await resolved.json().catch(() => ({}));
  if (!resolved.ok) throw new Error(body.message || body.error || '请求失败，请稍后重试。');
  return body.data as T;
}
