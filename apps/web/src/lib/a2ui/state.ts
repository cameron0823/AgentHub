function decodePointerSegment(segment: string) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function getValueByPath(model: Record<string, unknown>, path: string) {
  if (path === "") return model;
  const segments = path.split("/").slice(1).map(decodePointerSegment);
  let current: unknown = model;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setValueByPath(model: Record<string, unknown>, path: string, value: unknown) {
  const next = structuredClone(model);
  if (path === "") return value && typeof value === "object" ? (value as Record<string, unknown>) : next;
  const segments = path.split("/").slice(1).map(decodePointerSegment);
  let current: Record<string, unknown> = next;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
  return next;
}
