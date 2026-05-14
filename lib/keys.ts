import type { EngineName } from "@/lib/engines/types";

export type BodyKeys = { openai?: string; anthropic?: string };
export type ResolvedKeys = { openai?: string; anthropic?: string };

export class MissingKeyError extends Error {
  constructor(public readonly engine: EngineName) {
    super(`Missing API key for engine "${engine}".`);
    this.name = "MissingKeyError";
  }
}

/**
 * Universal precedence: request-body key → env var → throw MissingKeyError.
 * Same code path in hosted demo (env vars unset, BYOK falls through) and
 * self-host (env vars set, body keys optional override).
 */
export function resolveKeys(
  engines: EngineName[],
  bodyKeys: BodyKeys | undefined
): ResolvedKeys {
  const out: ResolvedKeys = {};
  if (engines.includes("openai")) {
    const key =
      bodyKeys?.openai?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new MissingKeyError("openai");
    out.openai = key;
  }
  if (engines.includes("anthropic")) {
    const key =
      bodyKeys?.anthropic?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) throw new MissingKeyError("anthropic");
    out.anthropic = key;
  }
  return out;
}
