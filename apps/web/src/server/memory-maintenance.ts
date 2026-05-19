export type MemoryMaintenanceAction = "edit" | "delete" | "merge" | "keep";
export type MemoryMaintenanceRisk = "low" | "medium" | "high";
export type MemoryMaintenanceStatus = "accepted" | "proposed" | "rejected" | "archived";

export interface ReviewableMemoryEntry {
  id: string;
  agentId?: string | null;
  category: string;
  key: string;
  value: string;
  confidence: number;
  status: MemoryMaintenanceStatus;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface MemoryMaintenanceSuggestion {
  id: string;
  action: MemoryMaintenanceAction;
  reason: string;
  proposed?: {
    category?: string;
    key?: string;
    value?: string;
    confidence?: number;
    status?: MemoryMaintenanceStatus;
  };
  relatedIds?: string[];
  risk: MemoryMaintenanceRisk;
  score?: number;
}

interface ReviewOptions {
  now?: Date;
  staleAfterDays?: number;
  lowConfidenceThreshold?: number;
}

const CANONICAL_CATEGORIES = new Set(["profile", "preference", "fact", "goal", "project", "workflow"]);
const CATEGORY_ALIASES: Record<string, string> = {
  preferences: "preference",
  prefers: "preference",
  user_preference: "preference",
  facts: "fact",
  context: "fact",
  personal: "profile",
  profile_info: "profile",
  goals: "goal",
  objective: "goal",
  objectives: "goal",
  projects: "project",
  repo: "project",
  workflows: "workflow",
  process: "workflow",
  processes: "workflow",
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function entryDate(entry: ReviewableMemoryEntry) {
  const raw = entry.updatedAt ?? entry.createdAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function daysBetween(start: Date | null, end: Date) {
  if (!start) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

export function normalizeMemoryCategory(category: string) {
  const normalized = normalizeText(category).replace(/[\s-]+/g, "_");
  if (CANONICAL_CATEGORIES.has(normalized)) return normalized;
  return CATEGORY_ALIASES[normalized] ?? "fact";
}

export function scoreMemoryRelevanceDecay(entry: ReviewableMemoryEntry, now = new Date()) {
  const confidence = Math.min(1, Math.max(0, Number.isFinite(entry.confidence) ? entry.confidence : 0));
  const ageDays = daysBetween(entryDate(entry), now);
  const agePenalty = Math.min(0.75, ageDays / 730);
  const statusPenalty = entry.status === "accepted" ? 0 : 0.2;
  return Math.max(0, Number((confidence - agePenalty - statusPenalty).toFixed(3)));
}

export function detectMemoryConflicts(entries: ReviewableMemoryEntry[]): MemoryMaintenanceSuggestion[] {
  const groups = new Map<string, ReviewableMemoryEntry[]>();
  for (const entry of entries) {
    if (entry.status === "archived" || entry.status === "rejected") continue;
    const groupKey = `${normalizeMemoryCategory(entry.category)}:${normalizeText(entry.key)}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), entry]);
  }

  const suggestions: MemoryMaintenanceSuggestion[] = [];
  for (const group of groups.values()) {
    const distinctValues = new Set(group.map((entry) => normalizeText(entry.value)));
    if (group.length < 2 || distinctValues.size < 2) continue;

    const [primary, ...related] = [...group].sort((a, b) => b.confidence - a.confidence);
    suggestions.push({
      id: primary.id,
      action: "merge",
      reason: `Conflicting values share the same category and key: ${primary.key}.`,
      proposed: {
        category: normalizeMemoryCategory(primary.category),
        key: primary.key.trim(),
        value: group
          .map((entry) => entry.value.trim())
          .filter(Boolean)
          .join(" / "),
        confidence: Math.min(1, Math.max(...group.map((entry) => entry.confidence))),
        status: "accepted",
      },
      relatedIds: related.map((entry) => entry.id),
      risk: "high",
    });
  }

  return suggestions;
}

export function detectStaleMemories(
  entries: ReviewableMemoryEntry[],
  options: ReviewOptions = {},
): MemoryMaintenanceSuggestion[] {
  const now = options.now ?? new Date();
  const staleAfterDays = options.staleAfterDays ?? 180;
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.45;
  const suggestions: MemoryMaintenanceSuggestion[] = [];

  for (const entry of entries) {
    if (entry.status !== "accepted") continue;
    const ageDays = daysBetween(entryDate(entry), now);
    const score = scoreMemoryRelevanceDecay(entry, now);
    if (ageDays < staleAfterDays || score > lowConfidenceThreshold) continue;

    if (entry.confidence < 0.3) {
      suggestions.push({
        id: entry.id,
        action: "delete",
        reason: `Accepted memory is ${ageDays} days old and has low relevance confidence.`,
        proposed: { status: "archived" },
        risk: "medium",
        score,
      });
      continue;
    }

    suggestions.push({
      id: entry.id,
      action: "edit",
      reason: `Accepted memory is ${ageDays} days old; lower confidence until it is reconfirmed.`,
      proposed: { confidence: score },
      risk: "low",
      score,
    });
  }

  return suggestions;
}

export function reviewMemoryEntries(
  entries: ReviewableMemoryEntry[],
  options: ReviewOptions = {},
): MemoryMaintenanceSuggestion[] {
  const suggestions: MemoryMaintenanceSuggestion[] = [];

  for (const entry of entries) {
    const normalizedCategory = normalizeMemoryCategory(entry.category);
    if (entry.category !== normalizedCategory) {
      suggestions.push({
        id: entry.id,
        action: "edit",
        reason: `Normalize category from "${entry.category}" to "${normalizedCategory}".`,
        proposed: { category: normalizedCategory },
        risk: "low",
      });
    }

    const trimmedKey = entry.key.trim().replace(/\s+/g, " ");
    if (entry.key !== trimmedKey) {
      suggestions.push({
        id: entry.id,
        action: "edit",
        reason: "Normalize memory key spacing.",
        proposed: { key: trimmedKey },
        risk: "low",
      });
    }
  }

  suggestions.push(...detectMemoryConflicts(entries));
  suggestions.push(...detectStaleMemories(entries, options));

  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.action}:${suggestion.id}:${suggestion.relatedIds?.join(",") ?? ""}:${JSON.stringify(suggestion.proposed ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
