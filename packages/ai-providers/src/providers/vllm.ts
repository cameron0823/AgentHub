import { OpenAICompatibleProvider } from "./openai-compatible";

export class VLLMProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = process.env.VLLM_URL || "http://localhost:8000") {
    super({ id: "vllm", name: "vLLM", baseUrl });
  }
}
