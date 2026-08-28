import { parseJsonEnvelope } from "@gosso/client";
import { apiFetch as sdkApiFetch } from "../auth";

export function authenticatedApiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return init ? sdkApiFetch(input, init) : sdkApiFetch(input);
}

export function publicApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return init
    ? sdkApiFetch(input.toString(), init)
    : sdkApiFetch(input.toString());
}

/** Authentication is optional; transport and HTTP failures are never swallowed. */
export function optionalApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return init
    ? sdkApiFetch(input.toString(), init)
    : sdkApiFetch(input.toString());
}

export async function readData<T>(
  responsePromise: Promise<Response> | Response,
  fallbackMessage = "Request failed, please try again later.",
): Promise<T> {
  const response = await responsePromise;
  return parseJsonEnvelope<T>(response, fallbackMessage);
}
