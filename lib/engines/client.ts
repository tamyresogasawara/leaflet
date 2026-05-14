import { FixtureEngineClient } from "./fixture";
import { OpenAIEngineClient } from "./openai-live";
import { AnthropicEngineClient } from "./anthropic-live";
import type { EngineClient, EngineName } from "./types";

export type EngineMode = "fixture" | "live";

export function getEngineMode(): EngineMode {
  return process.env.ENGINE_MODE === "live" ? "live" : "fixture";
}

export function getEngineClient(
  engine: EngineName,
  apiKey: string | undefined
): EngineClient {
  if (getEngineMode() === "fixture") {
    return new FixtureEngineClient(engine);
  }
  // Live mode requires a resolved key from lib/keys.ts
  if (!apiKey) {
    throw new Error(`Missing API key for engine ${engine} in live mode.`);
  }
  return engine === "openai"
    ? new OpenAIEngineClient(apiKey)
    : new AnthropicEngineClient(apiKey);
}
