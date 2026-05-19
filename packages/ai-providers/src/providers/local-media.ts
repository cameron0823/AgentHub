import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ImageGenerationOptions,
  ImageGenerationResponse,
  ModelInfo,
  ModelProvider,
  ProviderHealth,
  SpeechToTextOptions,
  SpeechToTextResponse,
  TextToSpeechOptions,
  TextToSpeechResponse,
} from "../types";

export type ImageWorkflowEngine = "comfyui" | "a1111";

export interface ImageWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  engine: ImageWorkflowEngine;
  config: Record<string, unknown>;
}

interface ComfyHistoryResponse {
  outputs?: Record<
    string,
    {
      images?: Array<{ filename: string; subfolder?: string; type?: string }>;
    }
  >;
}

interface ComfyPromptResponse {
  prompt_id?: string;
}

interface A1111Txt2ImgResponse {
  images?: string[];
  parameters?: Record<string, unknown>;
  info?: string;
}

abstract class MediaOnlyProvider implements ModelProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly type = "local" as const;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract healthCheck(): Promise<ProviderHealth>;

  async chat(_options: ChatOptions): Promise<ChatResponse> {
    throw new Error(`${this.name} is a media-only provider`);
  }

  async *streamChat(_options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    throw new Error(`${this.name} is a media-only provider`);
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function timeoutSignal(ms: number) {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function healthFromFetch(id: string, name: string, url: string): Promise<ProviderHealth> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: timeoutSignal(2_000) });
    return { id, name, status: res.ok ? "healthy" : "unhealthy", latency: Date.now() - start };
  } catch {
    return { id, name, status: "unhealthy", latency: -1 };
  }
}

function audioBlob(options: SpeechToTextOptions) {
  if (options.audio instanceof Blob) return options.audio;
  if (options.audio instanceof Uint8Array) {
    const copy = new Uint8Array(options.audio.byteLength);
    copy.set(options.audio);
    return new Blob([copy.buffer], { type: options.mimeType || "audio/webm" });
  }
  return new Blob([options.audio], { type: options.mimeType || "audio/webm" });
}

function splitImageSize(size?: string) {
  const match = /^(\d+)x(\d+)$/.exec(size || "");
  if (!match) return { width: 1024, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function dataUrlFromBase64(base64: string, mimeType = "image/png") {
  return base64.startsWith("data:") ? base64 : `data:${mimeType};base64,${base64}`;
}

function createClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `agenthub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }
  if (typeof btoa === "function") return btoa(binary);
  const maybeBuffer = (
    globalThis as { Buffer?: { from(input: ArrayBuffer): { toString(encoding: "base64"): string } } }
  ).Buffer;
  if (maybeBuffer) return maybeBuffer.from(buffer).toString("base64");
  throw new Error("Base64 encoding is not available in this runtime");
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const COMFYUI_TEXT_TO_IMAGE_TEMPLATE: ImageWorkflowTemplate = {
  id: "comfyui.text-to-image.semantic-v1",
  name: "ComfyUI text to image",
  description: "Semantic-node ComfyUI text-to-image workflow template.",
  engine: "comfyui",
  config: {
    positive_prompt: {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{prompt}}", clip: ["checkpoint", 1] },
      _meta: { title: "positive_prompt" },
    },
    negative_prompt: {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{negative_prompt}}", clip: ["checkpoint", 1] },
      _meta: { title: "negative_prompt" },
    },
    empty_latent: {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      _meta: { title: "image_size" },
    },
    sampler: {
      class_type: "KSampler",
      inputs: {
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        positive: ["positive_prompt", 0],
        negative: ["negative_prompt", 0],
        latent_image: ["empty_latent", 0],
        model: ["checkpoint", 0],
      },
      _meta: { title: "sampler" },
    },
    save_image: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "agenthub", images: ["sampler", 0] },
      _meta: { title: "output_image" },
    },
  },
};

export const A1111_TEXT_TO_IMAGE_TEMPLATE: ImageWorkflowTemplate = {
  id: "a1111.text-to-image.v1",
  name: "A1111 text to image",
  description: "AUTOMATIC1111 txt2img payload template.",
  engine: "a1111",
  config: {
    steps: 20,
    cfg_scale: 7,
    sampler_name: "Euler",
    width: 1024,
    height: 1024,
    override_settings: {},
  },
};

export function injectComfyUIWorkflowInputs(
  template: ImageWorkflowTemplate,
  options: ImageGenerationOptions,
): Record<string, unknown> {
  const workflow = deepClone(template.config);
  const { width, height } = splitImageSize(options.size);
  const promptNode = workflow.positive_prompt as { inputs?: Record<string, unknown> } | undefined;
  const negativeNode = workflow.negative_prompt as { inputs?: Record<string, unknown> } | undefined;
  const latentNode = workflow.empty_latent as { inputs?: Record<string, unknown> } | undefined;
  const samplerNode = workflow.sampler as { inputs?: Record<string, unknown> } | undefined;

  if (promptNode?.inputs) promptNode.inputs.text = options.prompt;
  if (negativeNode?.inputs) negativeNode.inputs.text = "";
  if (latentNode?.inputs) {
    latentNode.inputs.width = width;
    latentNode.inputs.height = height;
    latentNode.inputs.batch_size = Math.min(4, Math.max(1, Math.floor(Number(options.n || 1))));
  }
  if (samplerNode?.inputs) {
    samplerNode.inputs.seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    if (options.quality === "high" || options.quality === "hd") samplerNode.inputs.steps = 35;
    if (options.quality === "low") samplerNode.inputs.steps = 12;
  }

  return workflow;
}

export function buildA1111Txt2ImgPayload(options: ImageGenerationOptions): Record<string, unknown> {
  const { width, height } = splitImageSize(options.size);
  return {
    ...A1111_TEXT_TO_IMAGE_TEMPLATE.config,
    prompt: options.prompt,
    width,
    height,
    batch_size: Math.min(4, Math.max(1, Math.floor(Number(options.n || 1)))),
  };
}

export class PiperProvider extends MediaOnlyProvider {
  readonly id = "piper";
  readonly name = "Piper TTS";
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.PIPER_TTS_URL || process.env.AGENTHUB_PIPER_URL || "http://localhost:10200") {
    super();
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "piper:default", name: "Piper default voice", capabilities: ["tts"] }];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return healthFromFetch(this.id, this.name, `${this.baseUrl}/health`);
  }

  async textToSpeech(options: TextToSpeechOptions): Promise<TextToSpeechResponse> {
    const res = await fetch(`${this.baseUrl}/api/tts/piper`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/wav, audio/mpeg, application/octet-stream" },
      body: JSON.stringify({
        text: options.text,
        voice: options.voice || "default",
        speed: options.speed ?? 1,
        format: options.format || "wav",
        stream: true,
      }),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Piper TTS error: ${await res.text()}`);
    return {
      audio: await res.arrayBuffer(),
      mimeType: res.headers.get("content-type") || "audio/wav",
      model: options.model || "piper",
      voice: options.voice || "default",
    };
  }
}

export class FasterWhisperProvider extends MediaOnlyProvider {
  readonly id = "faster-whisper";
  readonly name = "faster-whisper STT";
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.FASTER_WHISPER_URL || process.env.AGENTHUB_FASTER_WHISPER_URL || "http://localhost:10300",
  ) {
    super();
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "medium.en", name: "faster-whisper medium.en", capabilities: ["stt"] }];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return healthFromFetch(this.id, this.name, `${this.baseUrl}/health`);
  }

  async speechToText(options: SpeechToTextOptions): Promise<SpeechToTextResponse> {
    const form = new FormData();
    form.append("audio", audioBlob(options), options.fileName || "voice-input.webm");
    if (options.model) form.append("model", options.model);
    if (options.language) form.append("language", options.language);
    if (options.prompt) form.append("prompt", options.prompt);

    const res = await fetch(`${this.baseUrl}/api/stt/transcribe`, {
      method: "POST",
      body: form,
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`faster-whisper STT error: ${await res.text()}`);
    const data = (await res.json()) as { text?: string; model?: string; language?: string; durationSeconds?: number };
    return {
      text: data.text || "",
      model: data.model || options.model || "medium.en",
      language: data.language || options.language,
      durationSeconds: data.durationSeconds,
    };
  }
}

export class ComfyUIProvider extends MediaOnlyProvider {
  readonly id = "comfyui";
  readonly name = "ComfyUI";
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.COMFYUI_URL || process.env.AGENTHUB_COMFYUI_URL || "http://localhost:8188") {
    super();
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: COMFYUI_TEXT_TO_IMAGE_TEMPLATE.id,
        name: COMFYUI_TEXT_TO_IMAGE_TEMPLATE.name,
        capabilities: ["imageGeneration"],
      },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return healthFromFetch(this.id, this.name, `${this.baseUrl}/system_stats`);
  }

  async createImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
    const clientId = createClientId();
    const workflow = injectComfyUIWorkflowInputs(COMFYUI_TEXT_TO_IMAGE_TEMPLATE, options);
    const promptRes = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: options.signal,
    });
    if (!promptRes.ok) throw new Error(`ComfyUI prompt error: ${await promptRes.text()}`);
    const promptData = (await promptRes.json()) as ComfyPromptResponse;
    const promptId = promptData.prompt_id;
    if (!promptId) throw new Error("ComfyUI did not return a prompt_id");

    const images = await this.pollHistory(promptId, options.signal);
    return {
      images,
      model: options.model || COMFYUI_TEXT_TO_IMAGE_TEMPLATE.id,
      prompt: options.prompt,
      providerId: this.id,
    };
  }

  private async pollHistory(promptId: string, signal?: AbortSignal) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const res = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`, { signal });
      if (res.ok) {
        const history = (await res.json()) as Record<string, ComfyHistoryResponse>;
        const promptHistory = history[promptId];
        const imageRefs = Object.values(promptHistory?.outputs ?? {}).flatMap((output) => output.images ?? []);
        if (imageRefs.length > 0) {
          return Promise.all(
            imageRefs.map(async (image) => {
              const view = new URL(`${this.baseUrl}/view`);
              view.searchParams.set("filename", image.filename);
              if (image.subfolder) view.searchParams.set("subfolder", image.subfolder);
              if (image.type) view.searchParams.set("type", image.type);
              const imageRes = await fetch(view, { signal });
              if (!imageRes.ok) throw new Error(`ComfyUI image fetch error: ${await imageRes.text()}`);
              const buffer = await imageRes.arrayBuffer();
              const base64 = arrayBufferToBase64(buffer);
              const mimeType = imageRes.headers.get("content-type") || "image/png";
              return {
                dataUrl: dataUrlFromBase64(base64, mimeType),
                mimeType,
                providerImageId: image.filename,
              };
            }),
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("ComfyUI image generation timed out waiting for history output");
  }
}

export class A1111Provider extends MediaOnlyProvider {
  readonly id = "a1111";
  readonly name = "AUTOMATIC1111";
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.A1111_URL || process.env.AGENTHUB_A1111_URL || "http://localhost:7860") {
    super();
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: A1111_TEXT_TO_IMAGE_TEMPLATE.id,
        name: A1111_TEXT_TO_IMAGE_TEMPLATE.name,
        capabilities: ["imageGeneration"],
      },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return healthFromFetch(this.id, this.name, `${this.baseUrl}/sdapi/v1/progress?skip_current_image=true`);
  }

  async createImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
    const res = await fetch(`${this.baseUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildA1111Txt2ImgPayload(options)),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`A1111 txt2img error: ${await res.text()}`);
    const data = (await res.json()) as A1111Txt2ImgResponse;
    return {
      images: (data.images ?? []).map((image, index) => ({
        dataUrl: dataUrlFromBase64(image),
        mimeType: "image/png",
        providerImageId: `${Date.now()}-${index}`,
      })),
      model: options.model || A1111_TEXT_TO_IMAGE_TEMPLATE.id,
      prompt: options.prompt,
      providerId: this.id,
    };
  }
}
