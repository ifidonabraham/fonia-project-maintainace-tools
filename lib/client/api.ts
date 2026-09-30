import type { ApiResponse } from "../types";

/**
 * The one place the browser talks to the API.
 *
 * Every handler returns the same envelope, so this wrapper can turn "not ok"
 * into a thrown ApiError that carries the field-level messages a form needs —
 * which is why no component writes its own fetch error handling.
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  /** Present on optimistic-concurrency conflicts: the freshest server row. */
  current?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    fields?: Record<string, string>,
    current?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.current = current;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & { json?: unknown };

export async function apiFetch<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(headers ?? {})
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
      // The session cookie travels with every request; no token juggling.
      credentials: "same-origin",
      cache: "no-store"
    });
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0, "network");
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!payload) {
    throw new ApiError(
      response.ok ? "Unexpected empty response." : `Request failed (${response.status}).`,
      response.status
    );
  }

  if (!payload.ok) {
    throw new ApiError(payload.error, response.status, payload.code, payload.fields, payload.current);
  }

  return payload.data;
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "PATCH", json }),
  put: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "PUT", json }),
  del: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: "DELETE", json })
};

/** Human-readable fallback for anything thrown in a component. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}