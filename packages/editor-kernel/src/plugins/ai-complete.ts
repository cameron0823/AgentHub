export type EditorAiCompleteMode = "rewrite" | "translate" | "shorten" | "expand" | "media";

export interface EditorAiCompleteAction {
  mode: EditorAiCompleteMode;
  label: string;
  shortLabel: string;
}

export interface EditorAiCompleteRequest {
  mode: EditorAiCompleteMode;
  draft: string;
  selectedText?: string;
  instruction?: string;
}

export const EDITOR_AI_COMPLETE_ACTIONS: EditorAiCompleteAction[] = [
  { mode: "rewrite", label: "Rewrite prompt", shortLabel: "Rewrite" },
  { mode: "translate", label: "Translate to English", shortLabel: "Translate" },
  { mode: "shorten", label: "Shorten prompt", shortLabel: "Shorten" },
  { mode: "expand", label: "Expand prompt", shortLabel: "Expand" },
  { mode: "media", label: "Optimize media prompt", shortLabel: "Media" },
];

export function normalizeEditorDraft(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createEditorAiCompleteRequest(
  draft: string,
  mode: EditorAiCompleteMode,
  options: { selectedText?: string; instruction?: string } = {},
): EditorAiCompleteRequest {
  return {
    mode,
    draft: normalizeEditorDraft(draft),
    selectedText: options.selectedText ? normalizeEditorDraft(options.selectedText) : undefined,
    instruction: options.instruction ? normalizeEditorDraft(options.instruction) : undefined,
  };
}
