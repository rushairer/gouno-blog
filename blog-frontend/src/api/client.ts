import { apiFetch } from '../auth';

export async function readData<T>(responsePromise: Promise<Response> | Response): Promise<T> {
  const response = await responsePromise;
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `Request failed: ${response.status} ${response.statusText}`;
    if (contentType.includes('application/json')) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        message?: string;
      } | null;
      message = body?.error?.message || body?.message || message;
    } else {
      const text = await response.text().catch(() => '');
      if (text) message = text.slice(0, 120);
    }
    throw new Error(message);
  }
  if (!contentType.includes('application/json')) {
    return (await response.text()) as unknown as T;
  }
  const body = (await response.json()) as { data?: T } | T;
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function optionalApiFetch(input: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await apiFetch(input, init);
  } catch {
    return null;
  }
}
