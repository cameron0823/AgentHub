export const TRACE_ID_HEADER = "x-agenthub-trace-id";
export const REQUEST_ID_HEADER = "x-request-id";

export function getTraceId(headers: Headers) {
  return headers.get(TRACE_ID_HEADER) || headers.get(REQUEST_ID_HEADER) || undefined;
}
