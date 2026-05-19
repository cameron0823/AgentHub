type ContentSecurityPolicyOptions = {
  isDevelopment?: boolean;
  nonce?: string;
};

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions = {}) {
  const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "'self'",
    "'unsafe-eval'",
    ...(options.nonce ? [`'nonce-${options.nonce}'`] : []),
    ...(isDevelopment ? ["'unsafe-inline'"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss:",
    "media-src 'self' data: blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "trusted-types default dompurify agenthub-service-worker agenthub-mermaid agenthub-artifact-preview nextjs#bundler",
    "require-trusted-types-for 'script'",
    "report-uri /api/csp-report",
  ].join("; ");
}

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
} as const;

export function applySecurityHeaders(headers: Headers, options: ContentSecurityPolicyOptions = {}) {
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(options));
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
}
