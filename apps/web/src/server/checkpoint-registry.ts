const registry = new Map<string, { resolve: (approved: boolean) => void; timeout: ReturnType<typeof setTimeout> }>();

const CHECKPOINT_TIMEOUT_MS = 300_000; // 5 minutes — auto-approve on timeout

export function registerCheckpoint(id: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      registry.delete(id);
      resolve(true);
    }, CHECKPOINT_TIMEOUT_MS);
    registry.set(id, { resolve, timeout });
  });
}

export function resolveCheckpoint(id: string, approved: boolean): boolean {
  const entry = registry.get(id);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  registry.delete(id);
  entry.resolve(approved);
  return true;
}
