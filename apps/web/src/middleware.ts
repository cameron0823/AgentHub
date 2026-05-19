import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_ID_HEADER, TRACE_ID_HEADER } from "@/server/observability/trace";
import { applySecurityHeaders } from "@/server/security/headers";
import { checkRateLimit, classifyRateLimitTier, rateLimitIdentifier } from "@/server/security/rate-limit";

const CSRF_COOKIE = "__Host-agenthub.csrf";
const CSRF_HEADER = "x-csrf-token";
const NONCE_HEADER = "x-nonce";

export async function middleware(request: NextRequest) {
  const traceId = request.headers.get(TRACE_ID_HEADER) || request.headers.get(REQUEST_ID_HEADER) || crypto.randomUUID();
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TRACE_ID_HEADER, traceId);
  requestHeaders.set(REQUEST_ID_HEADER, traceId);
  requestHeaders.set(CSRF_HEADER, request.cookies.get(CSRF_COOKIE)?.value ?? crypto.randomUUID());
  requestHeaders.set(NONCE_HEADER, nonce);

  if (request.nextUrl.pathname.startsWith("/api/") && process.env.AGENTHUB_DISABLE_RATE_LIMIT !== "1") {
    const tier = classifyRateLimitTier(request.nextUrl.pathname);
    const limit = await checkRateLimit(rateLimitIdentifier(request, tier), tier);
    if (!limit.allowed) {
      const response = NextResponse.json(
        { error: "Rate limit exceeded", tier, resetAt: new Date(limit.resetAt).toISOString() },
        { status: 429 },
      );
      applySecurityHeaders(response.headers, { nonce });
      response.headers.set("Retry-After", `${Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))}`);
      response.headers.set("X-RateLimit-Limit", `${limit.limit}`);
      response.headers.set("X-RateLimit-Remaining", "0");
      response.headers.set("X-RateLimit-Reset", `${limit.resetAt}`);
      response.headers.set("X-RateLimit-Backend", limit.backend);
      return response;
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  applySecurityHeaders(response.headers, { nonce });
  response.headers.set(TRACE_ID_HEADER, traceId);
  response.headers.set(REQUEST_ID_HEADER, traceId);
  response.headers.set(CSRF_HEADER, requestHeaders.get(CSRF_HEADER)!);
  if (!request.cookies.get(CSRF_COOKIE)?.value) {
    response.cookies.set(CSRF_COOKIE, requestHeaders.get(CSRF_HEADER)!, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|sw.js).*)"],
};
