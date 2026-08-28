import { parseJsonEnvelope } from "@gosso/client";
import { gossoClient } from "../auth";

export const apiClient = gossoClient;

export function authenticatedApiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return gossoClient.apiFetch(input, init);
}

export function publicApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return gossoClient.apiFetch(input.toString(), init);
}

/** Authentication is optional; transport and HTTP failures are never swallowed. */
export function optionalApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return gossoClient.apiFetch(input.toString(), init);
}

export async function readData<T>(
  responsePromise: Promise<Response> | Response,
  fallbackMessage = "Request failed, please try again later.",
): Promise<T> {
  const response = await responsePromise;
  return parseJsonEnvelope<T>(response, fallbackMessage);
}
