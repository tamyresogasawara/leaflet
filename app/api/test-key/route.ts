import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEngineMode } from "@/lib/engines/client";
import { probeOpenAI } from "@/lib/engines/openai-live";
import { probeAnthropic } from "@/lib/engines/anthropic-live";
import { EngineError } from "@/lib/engines/errors";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const TestKeyRequest = z.object({
  provider: z.enum(["openai", "anthropic"]),
  key: z.string(),
});

// Tagged error vocabulary — the UI renders plain-language copy from these.
// We never echo the raw provider error text to the client.
type TestKeyError = "auth" | "rate_limit" | "network";

function classify(err: unknown): TestKeyError {
  if (err instanceof EngineError) {
    if (err.code === "auth") return "auth";
    if (err.code === "rate_limit") return "rate_limit";
    return "network"; // timeout + unknown fold into network
  }
  return "network";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rate = await checkRateLimit(getClientIp(req));
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limit" },
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
    return NextResponse.json(
      { ok: false, error: "auth" },
      { status: 400 }
    );
  }
  const parsed = TestKeyRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "auth" },
      { status: 400 }
    );
  }
  const { provider, key } = parsed.data;
  const trimmed = key.trim();
  if (!trimmed) {
    return NextResponse.json({ ok: false, error: "auth" });
  }

  // Cheap fail-fast format check before any network call. A malformed key
  // is a client-side typo — categorize as "auth" so the UI sends the user
  // back to the Settings input.
  const formatOk =
    provider === "openai"
      ? /^sk-[A-Za-z0-9_-]{20,}$/.test(trimmed)
      : /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(trimmed);
  if (!formatOk) {
    return NextResponse.json({ ok: false, error: "auth" });
  }

  // Fixture mode: well-formed key passes without a network call.
  if (getEngineMode() === "fixture") {
    return NextResponse.json({ ok: true });
  }

  // Live mode: real probe. OpenAI uses free models.list(); Anthropic uses
  // a 1-token messages.create (~$0.000001 — no free probe endpoint).
  try {
    if (provider === "openai") {
      await probeOpenAI(trimmed);
    } else {
      await probeAnthropic(trimmed);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: classify(err) });
  }
}
