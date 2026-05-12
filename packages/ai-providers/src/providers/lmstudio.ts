import { OpenAICompatibleProvider } from "./openai-compatible";

export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor(baseUrl = process.env.LMSTUDIO_URL || "http://localhost:1234") {
    super({ id: "lmstudio", name: "LM Studio", baseUrl });
  }
}
