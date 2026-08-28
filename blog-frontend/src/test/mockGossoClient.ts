import { createGossoClient } from "@gosso/client";

export function createMockGossoClient(fetchImpl: typeof fetch) {
  return createGossoClient({
    issuer: "https://sso.test",
    clientId: "blog-spa-test",
    redirectUri: "https://blog.test/callback",
    fetchImpl: (input, init) => {
      if (!init || init.method === "GET") return fetchImpl(input);
      const normalized: RequestInit = { method: init.method };
      if (init.body !== undefined) normalized.body = init.body;
      const headers = new Headers(init.headers);
      if ([...headers].length > 0)
        normalized.headers = Object.fromEntries(headers);
      return fetchImpl(input, normalized);
    },
  });
}
