import Anthropic from "@anthropic-ai/sdk";
import type { Citation, EngineClient, EngineQuery } from "./types";
import { mapAnthropicError } from "./errors";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_INPUT_CHARS = 4000;
const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_MAX_TOKENS = 2000;

function modelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function maxTokens(): number {
  const fromEnv = Number(process.env.MAX_TOKENS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_TOKENS;
}

export class AnthropicEngineClient implements EngineClient {
  readonly name = "anthropic" as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async run(q: EngineQuery): Promise<{
    answerText: string;
    citations: Citation[];
  }> {
    if (q.prompt.length > MAX_INPUT_CHARS) {
      throw new Error(`Prompt exceeds ${MAX_INPUT_CHARS} chars.`);
    }
    const client = new Anthropic({ apiKey: this.apiKey, maxRetries: 0 });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await client.messages.create(
        {
          model: modelId(),
          max_tokens: maxTokens(),
          messages: [{ role: "user", content: q.prompt }],
        },
        { signal: abort.signal }
      );
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { answerText: text, citations: [] };
    } catch (err) {
      throw mapAnthropicError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function probeAnthropic(apiKey: string): Promise<void> {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    await client.messages.create(
      {
        model: modelId(),
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      },
      { signal: abort.signal }
    );
  } catch (err) {
    throw mapAnthropicError(err);
  } finally {
    clearTimeout(timer);
  }
}
