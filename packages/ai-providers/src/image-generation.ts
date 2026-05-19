import type { GeneratedImage, ImageGenerationOptions, ImageGenerationResponse } from "./types";

export const DEFAULT_IMAGE_GENERATION_MODEL = "gpt-image-1";
export const DEFAULT_IMAGE_GENERATION_SIZE = "1024x1024";
export const DEFAULT_IMAGE_MIME_TYPE = "image/png";

interface OpenAIImageGenerationItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
  id?: string;
}

export interface OpenAIImageGenerationPayload {
  data?: OpenAIImageGenerationItem[];
}

function clampImageCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.min(4, Math.max(1, Math.floor(count)));
}

export function imageGenerationRequestBody(
  options: ImageGenerationOptions,
  defaultModel = DEFAULT_IMAGE_GENERATION_MODEL,
) {
  const body: Record<string, unknown> = {
    model: options.model || defaultModel,
    prompt: options.prompt,
    n: clampImageCount(options.n),
    size: options.size || DEFAULT_IMAGE_GENERATION_SIZE,
  };

  if (options.quality) body.quality = options.quality;
  if (options.style) body.style = options.style;
  if (options.responseFormat) body.response_format = options.responseFormat;

  return body;
}

export function normalizeImageGenerationResponse(
  payload: OpenAIImageGenerationPayload,
  options: ImageGenerationOptions,
  model: string,
  providerId?: string,
): ImageGenerationResponse {
  const images: GeneratedImage[] = (payload.data || []).map((item) => {
    const b64Json = item.b64_json;
    return {
      url: item.url,
      b64Json,
      dataUrl: b64Json ? `data:${DEFAULT_IMAGE_MIME_TYPE};base64,${b64Json}` : undefined,
      mimeType: DEFAULT_IMAGE_MIME_TYPE,
      revisedPrompt: item.revised_prompt,
      providerImageId: item.id,
    };
  });

  return {
    images,
    model,
    prompt: options.prompt,
    providerId,
  };
}
