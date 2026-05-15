import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEngineMode } from "@/lib/engines/client";
import { EngineError } from "@/lib/engines/errors";
import {
  fixtureSuggestions,
  selectSuggester,
  type SuggestInput,
} from "@/lib/engines/suggest";
import { MissingKeyError, resolveKeys } from "@/lib/keys";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { ScrapeError, scrapeUrl } from "@/lib/scrape";
import type { EngineName } from "@/lib/engines/types";

const ApiKey = z
  .string()
  .max(200)
  .refine((s) => !s || /^sk(-ant)?-/.test(s), "malformed key");

const SuggestRequest = z.object({
  url: z.string().url().max(2048),
  brand: z.string().min(1).max(200),
  keys: z
    .object({
      openai: ApiKey.optional(),
      anthropic: ApiKey.optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rate = await checkRateLimit(getClientIp(req));
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      {
        status: 429,
        headers: { "retry-after": String(rate.retryAfterSeconds) },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = SuggestRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }
  const { url, brand, keys } = parsed.data;

  // Fixture short-circuit — no fetch, no LLM, no key required.
  if (getEngineMode() === "fixture") {
    return NextResponse.json({
      suggestions: fixtureSuggestions(),
      meta: {},
      source: "fixture",
    });
  }

  // Live mode: prefer OpenAI, fall back to Anthropic. 401 if neither key.
  let engine: EngineName;
  let apiKey: string;
  try {
    const resolved = resolveKeys(["openai"], keys);
    engine = "openai";
    apiKey = resolved.openai!;
  } catch (errA) {
    if (!(errA instanceof MissingKeyError)) throw errA;
    try {
      const resolved = resolveKeys(["anthropic"], keys);
      engine = "anthropic";
      apiKey = resolved.anthropic!;
    } catch (errB) {
      if (errB instanceof MissingKeyError) {
        return NextResponse.json(
          {
            error:
              "Add an OpenAI or Anthropic key in Settings to generate suggestions.",
            code: "auth",
          },
          { status: 401 }
        );
      }
      throw errB;
    }
  }

  // Scrape with SSRF guards.
  let scraped;
  try {
    scraped = await scrapeUrl(url);
  } catch (err) {
    if (err instanceof ScrapeError) {
      const isClientErr =
        err.code === "private_ip" ||
        err.code === "invalid_url" ||
        err.code === "wrong_content_type";
      return NextResponse.json(
        { error: err.publicMessage, code: "network" },
        { status: isClientErr ? 400 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't fetch that page.", code: "network" },
      { status: 502 }
    );
  }

  const input: SuggestInput = {
    brand,
    url: scraped.url,
    meta: scraped.meta,
  };

  try {
    const suggest = selectSuggester(engine);
    const suggestions = await suggest(apiKey, input);
    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: "We couldn't read the page's metadata.", code: "parse" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      suggestions,
      meta: scraped.meta,
      source: engine,
    });
  } catch (err) {
    if (err instanceof EngineError) {
      const code = err.code === "auth" ? "auth" : "unknown";
      return NextResponse.json(
        { error: err.publicMessage, code },
        { status: err.code === "auth" ? 401 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Suggestion failed.", code: "unknown" },
      { status: 502 }
    );
  }
}
