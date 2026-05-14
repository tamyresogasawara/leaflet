import OpenAI from "openai";
import type { Citation, EngineClient, EngineQuery } from "./types";
import { mapOpenAIError } from "./errors";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_INPUT_CHARS = 4000;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 2000;

function modelId(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function maxTokens(): number {
  const fromEnv = Number(process.env.MAX_TOKENS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_TOKENS;
}

export class OpenAIEngineClient implements EngineClient {
  readonly name = "openai" as const;
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
    // Per-request client instantiation — no module-level caching.
    const client = new OpenAI({ apiKey: this.apiKey, maxRetries: 0 });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      const completion = await client.chat.completions.create(
        {
          model: modelId(),
          max_tokens: maxTokens(),
          messages: [{ role: "user", content: q.prompt }],
        },
        { signal: abort.signal }
      );
      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      return { answerText: text, citations: [] };
    } catch (err) {
      throw mapOpenAIError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function probeOpenAI(apiKey: string): Promise<void> {
  // models.list() is a free auth probe — no token cost, validates the key.
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    await client.models.list({ signal: abort.signal });
  } catch (err) {
    throw mapOpenAIError(err);
  } finally {
    clearTimeout(timer);
  }
}
