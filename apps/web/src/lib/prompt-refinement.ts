import {
  EDITOR_AI_COMPLETE_ACTIONS,
  normalizeEditorDraft,
  type EditorAiCompleteMode,
} from "@agenthub/editor-kernel/plugins/ai-complete";

export type PromptRefinementMode = EditorAiCompleteMode;

export const PROMPT_REFINEMENT_ACTIONS = EDITOR_AI_COMPLETE_ACTIONS;

export function normalizePromptInput(input: string) {
  return normalizeEditorDraft(input);
}

function ensureTerminalPunctuation(value: string) {
  return /[.!?:)]$/.test(value) ? value : `${value}.`;
}

function sentenceList(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function rewritePrompt(value: string) {
  const normalized = normalizePromptInput(value);
  if (!normalized) return "";
  return ensureTerminalPunctuation(normalized.charAt(0).toUpperCase() + normalized.slice(1));
}

function shortenPrompt(value: string) {
  const normalized = normalizePromptInput(value);
  const sentences = sentenceList(normalized);
  if (sentences.length <= 2) return normalized;
  return sentences.slice(0, 2).join(" ");
}

function expandPrompt(value: string) {
  const normalized = normalizePromptInput(value);
  if (!normalized) return "";
  return [
    normalized,
    "",
    "Include relevant context, assumptions, constraints, edge cases, and a concise final answer.",
  ].join("\n");
}

function translatePrompt(value: string) {
  const normalized = normalizePromptInput(value);
  if (!normalized) return "";
  return [
    "Translate the following into clear English while preserving names, commands, code, and technical terms:",
    "",
    normalized,
  ].join("\n");
}

function mediaPrompt(value: string) {
  const normalized = normalizePromptInput(value);
  if (!normalized) return "";
  return [
    "Create a production-ready image prompt for:",
    normalized,
    "",
    "Include subject, composition, environment, lighting, camera/framing, style, color palette, quality details, and negative constraints.",
  ].join("\n");
}

export function refinePrompt(input: string, mode: PromptRefinementMode) {
  switch (mode) {
    case "rewrite":
      return rewritePrompt(input);
    case "translate":
      return translatePrompt(input);
    case "shorten":
      return shortenPrompt(input);
    case "expand":
      return expandPrompt(input);
    case "media":
      return mediaPrompt(input);
    default:
      return normalizePromptInput(input);
  }
}
