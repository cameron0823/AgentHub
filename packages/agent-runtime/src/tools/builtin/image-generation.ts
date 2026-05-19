import { z } from "zod";
import { DEFAULT_IMAGE_GENERATION_MODEL, providerRegistry } from "@agenthub/ai-providers";
import type { ToolDefinition } from "../registry";

export interface GeneratedImageToolResource {
  id: string;
  type: "image";
  url: string;
  mimeType: string;
  prompt: string;
  revisedPrompt?: string;
  providerId: string;
  model: string;
  size?: string;
  providerImageId?: string;
  source: "image_generation";
  createdAt: string;
}

export interface GeneratedImageToolResult {
  type: "generated_image";
  prompt: string;
  providerId: string;
  model: string;
  images: GeneratedImageToolResource[];
}

function resolveImageProvider(providerId?: string, model?: string) {
  const requestedModel =
    model || process.env.AGENTHUB_IMAGE_GENERATION_MODEL || `openai:${DEFAULT_IMAGE_GENERATION_MODEL}`;

  if (providerId && !requestedModel.includes(":")) {
    const provider = providerRegistry.get(providerId);
    if (!provider) throw new Error(`Provider not available: ${providerId}`);
    return {
      provider,
      providerId,
      model: requestedModel,
      qualifiedModelId: `${providerId}:${requestedModel}`,
    };
  }

  const resolution = providerRegistry.resolveModel(requestedModel);
  return {
    provider: resolution.provider,
    providerId: resolution.providerId,
    model: resolution.model,
    qualifiedModelId: resolution.qualifiedModelId,
  };
}

export const imageGenerationTool: ToolDefinition = {
  name: "generate_image",
  description: "Create one or more images from a text prompt using a configured image generation provider.",
  parameters: z.object({
    prompt: z.string().min(1).describe("Detailed text prompt for the image to generate."),
    providerId: z
      .string()
      .optional()
      .describe("Optional provider id such as openai or an OpenAI-compatible image provider."),
    model: z
      .string()
      .optional()
      .describe(
        "Optional image model. Use a qualified id like openai:gpt-image-1 or a provider-local model when providerId is set.",
      ),
    size: z.string().optional().describe("Image size such as 1024x1024, 1024x1536, 1536x1024, or auto."),
    quality: z
      .enum(["standard", "hd", "low", "medium", "high", "auto"])
      .optional()
      .describe("Provider-supported image quality."),
    style: z.enum(["vivid", "natural"]).optional().describe("DALL-E style preference when supported."),
    n: z.number().int().min(1).max(4).optional().describe("Number of images to generate."),
  }),
  execute: async ({ prompt, providerId, model, size, quality, style, n }): Promise<GeneratedImageToolResult> => {
    const resolution = resolveImageProvider(providerId, model);
    if (!resolution.provider.createImage) {
      throw new Error(`Provider ${resolution.providerId} does not support image generation`);
    }

    const result = await resolution.provider.createImage({
      prompt,
      model: resolution.model,
      size,
      quality,
      style,
      n,
    });

    return {
      type: "generated_image",
      prompt,
      providerId: resolution.providerId,
      model: result.model || resolution.qualifiedModelId,
      images: result.images
        .map((image) => ({
          id: crypto.randomUUID(),
          type: "image" as const,
          url: image.url || image.dataUrl || "",
          mimeType: image.mimeType,
          prompt,
          revisedPrompt: image.revisedPrompt,
          providerId: resolution.providerId,
          model: result.model || resolution.qualifiedModelId,
          size,
          providerImageId: image.providerImageId,
          source: "image_generation" as const,
          createdAt: new Date().toISOString(),
        }))
        .filter((image) => image.url),
    };
  },
};
