import { parseJsonEnvelope, readCookie } from "@gosso/client";
import { apiFetch as sdkApiFetch, isLoggedIn } from "../auth";

function isUnsafe(method?: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes((method || "GET").toUpperCase());
}

export function authenticatedApiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return init ? sdkApiFetch(input, init) : sdkApiFetch(input);
}

export function publicApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (isUnsafe(init.method) && !headers.has("X-CSRF-Token")) {
    const token = readCookie("blog_csrf_token");
    if (token) headers.set("X-CSRF-Token", token);
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}

/** Authentication is optional; transport and HTTP failures are never swallowed. */
export function optionalApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return isLoggedIn()
    ? authenticatedApiFetch(input.toString(), init)
    : publicApiFetch(input, init);
}

export async function readData<T>(
  responsePromise: Promise<Response> | Response,
): Promise<T> {
  const response = await responsePromise;
  return parseJsonEnvelope<T>(response, "请求失败，请稍后重试。");
}
