import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output } from "zod";
import type { ApiResponse } from "./types";

/**
 * One response shape for every endpoint, so the client never has to guess:
 *   { ok: true,  data: ... }
 *   { ok: false, error: "...", fields?: {...}, current?: ... }
 */

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, { status });
}

export function fail(
  error: string,
  status = 400,
  extra?: { code?: string; fields?: Record<string, string>; current?: unknown }
): NextResponse<ApiResponse<never>> {
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error, ...extra },
    { status }
  );
}

/** Turn a zod failure into per-field messages the form can render inline. */
export function failValidation(error: ZodError): NextResponse<ApiResponse<never>> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fail("Please check the highlighted fields.", 422, { code: "validation", fields });
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse<ApiResponse<never>> };

/** Read + validate a JSON body. Malformed JSON is a 400, not a crash. */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S
): Promise<ParseResult<output<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail("Request body must be valid JSON.") };
  }

  return safeParse(schema, raw);
}

async function safeParse<S extends ZodTypeAny>(
  schema: S,
  raw: unknown
): Promise<ParseResult<output<S>>> {
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, response: failValidation(result.error) };
  return { ok: true, data: result.data };
}

/** Uniform 500 handler — logs server-side, returns something safe to show. */
export function serverError(error: unknown, context: string): NextResponse<ApiResponse<never>> {
  console.error(`[api] ${context} failed:`, error);
  return fail("Something went wrong on the server. Please try again.", 500, { code: "server" });
}

/** 404 helper for "row exists but not for you" style responses. */
export function notFound(what = "Resource"): NextResponse<ApiResponse<never>> {
  return fail(`${what} not found.`, 404, { code: "not_found" });
}

export function forbidden(what = "You do not have access to this resource."): NextResponse<ApiResponse<never>> {
  return fail(what, 403, { code: "forbidden" });
}

export function unauthorized(): NextResponse<ApiResponse<never>> {
  return fail("Please sign in to continue.", 401, { code: "unauthorized" });
}