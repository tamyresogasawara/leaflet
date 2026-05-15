import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { runMap, totalCalls, type RunState } from "@/lib/runMap";
import { getEngineClient, getEngineMode } from "@/lib/engines/client";
import { detectMentions } from "@/lib/detect";
import { EngineError } from "@/lib/engines/errors";
import { MissingKeyError, resolveKeys } from "@/lib/keys";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { redactString } from "@/lib/redact";
import type { EngineName, EngineResult } from "@/lib/engines/types";

// Soft prefix check: accept anything starting with `sk-`. Deliberately
// generic — we don't reveal *which* prefix is right for *which* provider
// in the error message, just "malformed key". Rejects 50KB of garbage AND
// stops users from pasting an OpenAI key into the Anthropic slot.
const ApiKey = z
  .string()
  .max(200)
  .refine((s) => !s || /^sk(-ant)?-/.test(s), "malformed key");

const AnalyzeRequest = z.object({
  brand: z.string().min(1).max(200),
  competitors: z.array(z.string().max(200)).max(10).default([]),
  prompts: z.array(z.string().min(1).max(4000)).min(1).max(10),
  engines: z.array(z.enum(["openai", "anthropic"])).min(1),
  keys: z
    .object({
      openai: ApiKey.optional(),
      anthropic: ApiKey.optional(),
    })
    .optional(),
});

async function runOne(
  runId: string,
  engine: EngineName,
  promptIndex: number,
  apiKey: string | undefined
): Promise<void> {
  const state = runMap.get(runId);
  if (!state) return;
  const promptText = state.input.prompts[promptIndex];
  if (promptText === undefined) return;
  try {
    const client = getEngineClient(engine, apiKey);
    const { answerText, citations } = await client.run({
      prompt: promptText,
      brand: state.input.brand,
      competitors: state.input.competitors,
    });
    const mentions = detectMentions(
      answerText,
      state.input.brand,
      state.input.competitors
    );
    upsertResult(runId, {
      engine,
      promptIndex,
      prompt: promptText,
      status: "done",
      answerText,
      citations,
      mentions,
      ranAt: new Date().toISOString(),
    });
  } catch (err) {
    const ee =
      err instanceof EngineError
        ? err
        : new EngineError(
            "unknown",
            redactString(err instanceof Error ? err.message : String(err))
          );
    upsertResult(runId, {
      engine,
      promptIndex,
      prompt: promptText,
      status: "error",
      ranAt: new Date().toISOString(),
      error: { code: ee.code, message: ee.publicMessage },
    });
  }
}

function upsertResult(runId: string, next: EngineResult): void {
  const state = runMap.get(runId);
  if (!state) return;
  // Index by (engine, promptIndex) — both must match to replace.
  const others = state.results.filter(
    (r) => !(r.engine === next.engine && r.promptIndex === next.promptIndex)
  );
  state.results = [...others, next];
  const expected = totalCalls(state);
  const terminalCount = state.results.filter(
    (r) => r.status === "done" || r.status === "error"
  ).length;
  if (terminalCount === expected) {
    const anyOk = state.results.some((r) => r.status === "done");
    state.status = anyOk ? "done" : "error";
  } else {
    state.status = "running";
  }
  runMap.set(runId, state);
}

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
  const parsed = AnalyzeRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join("; ") },
      { status: 400 }
    );
  }
  const { brand, competitors, prompts, engines, keys } = parsed.data;

  let resolved: Partial<Record<EngineName, string>> = {};
  if (getEngineMode() === "live") {
    try {
      resolved = resolveKeys(engines, keys);
    } catch (err) {
      if (err instanceof MissingKeyError) {
        return NextResponse.json(
          {
            error: `Missing API key for ${err.engine}.`,
            engine: err.engine,
            code: "missing_key",
          },
          { status: 401 }
        );
      }
      throw err;
    }
  }

  const runId = randomUUID();
  const initialResults: EngineResult[] = [];
  for (let p = 0; p < prompts.length; p++) {
    for (const engine of engines) {
      initialResults.push({
        engine,
        promptIndex: p,
        prompt: prompts[p]!,
        status: "running",
      });
    }
  }
  const state: RunState = {
    runId,
    status: "pending",
    createdAt: new Date().toISOString(),
    input: { brand, competitors, prompts },
    engines,
    results: initialResults,
  };
  runMap.set(runId, state);

  // Fan out per (prompt × engine). Each call is fire-and-forget; the client
  // polls GET /api/analyze/:runId to assemble partial results.
  for (let p = 0; p < prompts.length; p++) {
    for (const engine of engines) {
      void runOne(runId, engine, p, resolved[engine]);
    }
  }

  return NextResponse.json({ runId }, { status: 202 });
}
