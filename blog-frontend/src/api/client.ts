import { gossoClient } from "../auth";
import { isMfaError, requestStepUpMfaPrompt } from "../mfa";

const aiHighPrivilegePrefixes = [
  "/api/admin/provider-profiles",
  "/api/admin/embedding-profiles",
  "/api/admin/agents",
  "/api/admin/agent-",
  "/api/admin/ai-",
] as const;

function requestPath(input: unknown): string {
  let value = "";
  if (typeof input === "string") value = input;
  else if (input instanceof URL) value = input.toString();
  else if (typeof Request !== "undefined" && input instanceof Request)
    value = input.url;
  if (!value) return "";
  try {
    return new URL(
      value,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    ).pathname;
  } catch {
    return value;
  }
}

function isAIHighPrivilegeRequest(input: unknown): boolean {
  const path = requestPath(input);
  return aiHighPrivilegePrefixes.some((prefix) => path.startsWith(prefix));
}

function rethrowWithMfaPrompt(error: unknown, input: unknown): never {
  if (isAIHighPrivilegeRequest(input) && isMfaError(error)) {
    requestStepUpMfaPrompt();
  }
  throw error;
}

const handler: ProxyHandler<typeof gossoClient> = {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      try {
        const result = Reflect.apply(value, target, args);
        return result instanceof Promise
          ? result.catch((error) => rethrowWithMfaPrompt(error, args[0]))
          : result;
      } catch (error) {
        return rethrowWithMfaPrompt(error, args[0]);
      }
    };
  },
};

// AI administration APIs are protected by Recent MFA on the backend. Keep the
// backend authoritative and translate those authorization failures into one
// shared Step-Up UI instead of duplicating catch blocks across every button.
export const apiClient = new Proxy(gossoClient, handler);
export const apiFetch = apiClient.apiFetch;
