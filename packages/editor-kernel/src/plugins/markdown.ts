import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
  type Transformer,
} from "@lexical/markdown";
import { $getRoot } from "lexical";

export const MARKDOWN_TRANSFORMERS: Transformer[] = TRANSFORMERS;

export function importMarkdownToEditorRoot(markdown: string) {
  const root = $getRoot();
  root.clear();
  $convertFromMarkdownString(markdown || "", MARKDOWN_TRANSFORMERS);
}

export function exportEditorRootToMarkdown() {
  return $convertToMarkdownString(MARKDOWN_TRANSFORMERS);
}

export function readEditorPlainText() {
  return $getRoot().getTextContent();
}
