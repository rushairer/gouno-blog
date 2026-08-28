import { parseJsonEnvelope } from "@gosso/client";
import { gossoClient } from "../auth";

export const apiClient = gossoClient;
export const apiFetch = gossoClient.apiFetch;

export async function readData<T>(
  responsePromise: Promise<Response> | Response,
  fallbackMessage = "Request failed, please try again later.",
): Promise<T> {
  const response = await responsePromise;
  return parseJsonEnvelope<T>(response, fallbackMessage);
}
