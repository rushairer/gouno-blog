import { gossoClient } from "../auth";
import {
  isMfaError,
  requestStepUpMfaPrompt,
  STEP_UP_CANCELLED_EVENT,
  STEP_UP_COMPLETED_EVENT,
} from "../mfa";

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
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    ).pathname;
  } catch {
    return value;
  }
}

function isAIHighPrivilegeRequest(input: unknown): boolean {
  const path = requestPath(input);
  return aiHighPrivilegePrefixes.some((prefix) => path.startsWith(prefix));
}

function waitForStepUp(error: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted);
      window.removeEventListener(STEP_UP_CANCELLED_EVENT, handleCancelled);
    };
    const handleCompleted = () => {
      cleanup();
      resolve();
    };
    const handleCancelled = () => {
      cleanup();
      reject(error);
    };

    window.addEventListener(STEP_UP_COMPLETED_EVENT, handleCompleted, {
      once: true,
    });
    window.addEventListener(STEP_UP_CANCELLED_EVENT, handleCancelled, {
      once: true,
    });
    requestStepUpMfaPrompt();
  });
}

function handleProtectedMfa(
  error: unknown,
  input: unknown,
  retry: () => unknown,
  allowRetry: boolean,
): unknown {
  if (allowRetry && isAIHighPrivilegeRequest(input) && isMfaError(error)) {
    return waitForStepUp(error).then(retry);
  }
  throw error;
}

function invokeClientMethod(
  target: typeof gossoClient,
  value: (...args: unknown[]) => unknown,
  args: unknown[],
  allowRetry: boolean,
): unknown {
  const retryArgs = [...args];
  if (typeof Request !== "undefined" && args[0] instanceof Request) {
    retryArgs[0] = args[0].clone();
  }

  const retry = () => invokeClientMethod(target, value, retryArgs, false);

  try {
    const result = Reflect.apply(value, target, args);
    return result instanceof Promise
      ? result.catch((error) =>
          handleProtectedMfa(error, args[0], retry, allowRetry),
        )
      : result;
  } catch (error) {
    return handleProtectedMfa(error, args[0], retry, allowRetry);
  }
}

const handler: ProxyHandler<typeof gossoClient> = {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) =>
      invokeClientMethod(target, value, args, true);
  },
};

// AI administration APIs are protected by Recent MFA on the backend. Keep the
// backend authoritative. If a protected request reports that Recent MFA has
// expired, hold the original promise while the shared Step-Up UI verifies the
// user, then replay that single request once. The second failure is surfaced
// normally so authorization remains backend-authoritative and retry loops are
// impossible.
export const apiClient = new Proxy(gossoClient, handler);
export const apiFetch = apiClient.apiFetch;
