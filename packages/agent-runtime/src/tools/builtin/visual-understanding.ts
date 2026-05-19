import { z } from "zod";
import { providerRegistry } from "@agenthub/ai-providers";
import type { ToolDefinition } from "../registry";

const DEFAULT_VISUAL_MODEL = "openai:gpt-4o";

const VISUAL_PROMPTS = {
  analysis: "Describe the image and extract any important visible text, UI state, or user-relevant details.",
  ocr: "Transcribe all visible text in the image. Preserve reading order and call out uncertain or partially obscured text.",
};

export const visualUnderstandingTool: ToolDefinition = {
  name: "visual_understanding",
  description:
    "Analyze an image or screenshot by URL using the configured vision model, including OCR-style text extraction.",
  parameters: z.object({
    imageUrl: z.string().url().describe("HTTP(S) image URL to analyze."),
    mode: z
      .enum(["analysis", "ocr"])
      .optional()
      .describe("Use analysis for general visual understanding or ocr for text extraction."),
    question: z.string().optional().describe("Specific visual question to answer."),
  }),
  execute: async ({ imageUrl, mode = "analysis", question }) => {
    const qualifiedModel = process.env.AGENTHUB_VISUAL_UNDERSTANDING_MODEL || DEFAULT_VISUAL_MODEL;
    const { provider, model } = providerRegistry.resolveModel(qualifiedModel);
    const prompt = question || VISUAL_PROMPTS[mode as keyof typeof VISUAL_PROMPTS] || VISUAL_PROMPTS.analysis;
    const response = await provider.chat({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", url: imageUrl },
          ],
        },
      ],
    });

    return {
      model: qualifiedModel,
      imageUrl,
      analysis: response.content,
      reasoning: response.reasoning,
    };
  },
};
