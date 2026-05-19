import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { validateApiKey } from "./routers/apiKeys";

export type ApiUserResult = { ok: true; userId: string } | { ok: false; response: NextResponse };

export type JsonParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export function apiError(message: string, status = 400, code = "invalid_request") {
  return NextResponse.json({ error: { message, code } }, { status });
}

function extractApiKey(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return req.headers.get("x-api-key")?.trim() || "";
}

export async function requireApiUser(req: NextRequest): Promise<ApiUserResult> {
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return { ok: false, response: apiError("Missing API key", 401, "missing_api_key") };
  }

  const userId = await validateApiKey(apiKey);
  if (!userId) {
    return { ok: false, response: apiError("Invalid API key", 401, "invalid_api_key") };
  }

  return { ok: true, userId };
}

export async function parseJsonBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<JsonParseResult<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: apiError("Invalid JSON body", 400, "invalid_json") };
  }

  try {
    return { ok: true, data: schema.parse(body) };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: { message: "Validation failed", code: "validation_error", issues: err.issues } },
          { status: 422 },
        ),
      };
    }
    return { ok: false, response: apiError("Validation failed", 422, "validation_error") };
  }
}

export function limitFromRequest(req: NextRequest, fallback = 50, max = 200) {
  const value = Number(new URL(req.url).searchParams.get("limit") || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value), max));
}
