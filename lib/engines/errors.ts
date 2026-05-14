import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { EngineErrorCode } from "./types";
import { redactString } from "@/lib/redact";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    public readonly publicMessage: string
  ) {
    super(publicMessage);
    this.name = "EngineError";
  }
}

function scrubKey(message: string): string {
  return redactString(message);
}

function isAbort(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" ||
      // Some Node runtimes wrap the DOMException with a different name.
      ("code" in err && (err as { code?: string }).code === "ABORT_ERR"))
  );
}

export function mapOpenAIError(err: unknown): EngineError {
  if (isAbort(err)) {
    return new EngineError("timeout", "OpenAI timed out.");
  }
  if (err instanceof OpenAI.AuthenticationError) {
    return new EngineError("auth", "OpenAI rejected the key.");
  }
  if (
    err instanceof OpenAI.APIError &&
    (err.status === 401 || err.status === 403)
  ) {
    return new EngineError("auth", "OpenAI rejected the key.");
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new EngineError(
      "rate_limit",
      "OpenAI rate-limited this request. Wait a minute or check your plan."
    );
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new EngineError("timeout", "OpenAI timed out.");
  }
  if (err instanceof OpenAI.APIError) {
    return new EngineError(
      "unknown",
      scrubKey(`OpenAI error (${err.status ?? "?"}): ${err.message}`)
    );
  }
  return new EngineError(
    "unknown",
    scrubKey(err instanceof Error ? err.message : String(err))
  );
}

export function mapAnthropicError(err: unknown): EngineError {
  if (isAbort(err)) {
    return new EngineError("timeout", "Anthropic timed out.");
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new EngineError("auth", "Anthropic rejected the key.");
  }
  if (
    err instanceof Anthropic.APIError &&
    (err.status === 401 || err.status === 403)
  ) {
    return new EngineError("auth", "Anthropic rejected the key.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new EngineError(
      "rate_limit",
      "Anthropic rate-limited this request. Wait a minute or check your plan."
    );
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new EngineError("timeout", "Anthropic timed out.");
  }
  if (err instanceof Anthropic.APIError) {
    return new EngineError(
      "unknown",
      scrubKey(`Anthropic error (${err.status ?? "?"}): ${err.message}`)
    );
  }
  return new EngineError(
    "unknown",
    scrubKey(err instanceof Error ? err.message : String(err))
  );
}
