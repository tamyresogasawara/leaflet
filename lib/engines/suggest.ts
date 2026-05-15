import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { mapAnthropicError, mapOpenAIError } from "./errors";
import { redactString } from "@/lib/redact";
import type { EngineName } from "./types";
import type { ScrapedMeta } from "@/lib/scrape";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_SUGGESTIONS = 10;

export type SuggestInput = {
  brand: string;
  url: string;
  meta: ScrapedMeta;
};

// Brief's exact prompt template — drives a different output shape than my
// earlier suggester (most prompts NOT brand-named, mix of angle types).
const SYSTEM_PROMPT = `You are helping a marketer test how AI assistants describe their brand. Given the brand's web page metadata, suggest exactly 10 short, diverse prompts that a real user might type into an AI assistant when researching this product category. Constraints:
- Most prompts should NOT mention the brand by name (we want to see if the AI mentions it organically)
- Cover different angles: pricing, comparison, use case, beginner questions, advanced questions
- 1–2 sentences each, no marketing language
- Different enough to surface different parts of the answer space

Return as JSON: { "prompts": ["...", "...", ...] }`;

function buildUserMessage(input: SuggestInput): string {
  const lines = [
    `Brand name: ${input.brand}`,
    `URL: ${input.url}`,
  ];
  if (input.meta.title) lines.push(`Page title: ${input.meta.title}`);
  if (input.meta.description)
    lines.push(`Page description: ${input.meta.description}`);
  if (input.meta.h1) lines.push(`Page H1: ${input.meta.h1}`);
  return lines.join("\n");
}

function parseSuggestions(raw: string): string[] {
  // Some models wrap JSON in fenced code or prose; lift the first {...}.
  const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "prompts" in parsed
    ) {
      const arr = (parsed as { prompts: unknown }).prompts;
      if (Array.isArray(arr)) {
        return arr
          .filter((s): s is string => typeof s === "string")
          .map((s) => redactString(s.trim()))
          .filter((s) => s.length > 0 && s.length <= 280)
          .slice(0, MAX_SUGGESTIONS);
      }
    }
  } catch {
    // fall through to newline parser
  }
  // Newline-separated fallback per the brief.
  return raw
    .split("\n")
    .map((s) => redactString(s.trim().replace(/^[-*\d.)\s]+/, "")))
    .filter((s) => s.length > 0 && s.length <= 280)
    .slice(0, MAX_SUGGESTIONS);
}

export async function suggestWithOpenAI(
  apiKey: string,
  input: SuggestInput
): Promise<string[]> {
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const completion = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(input) },
        ],
      },
      { signal: abort.signal }
    );
    const text = completion.choices[0]?.message?.content ?? "";
    return parseSuggestions(text);
  } catch (err) {
    throw mapOpenAIError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function suggestWithAnthropic(
  apiKey: string,
  input: SuggestInput
): Promise<string[]> {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      },
      { signal: abort.signal }
    );
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return parseSuggestions(text);
  } catch (err) {
    throw mapAnthropicError(err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fixture-mode suggestion list — never calls the network. Brief asks for
 * 10 hardcoded CRM prompts so local dev is free and deterministic.
 */
export function fixtureSuggestions(): string[] {
  return [
    "What is the best CRM for early-stage startups in 2026?",
    "Compare HubSpot and Pipedrive for a 10-person sales team.",
    "Which CRM has the most generous free tier?",
    "What features should a beginner look for in a CRM?",
    "How do I migrate from a spreadsheet to a CRM without losing data?",
    "What's the difference between operational and analytical CRMs?",
    "Is Salesforce overkill for a small business?",
    "How much does a typical CRM cost per seat?",
    "What are the best open-source CRM alternatives?",
    "How do I evaluate a CRM's API for custom workflows?",
  ];
}

export function selectSuggester(engine: EngineName) {
  return engine === "openai" ? suggestWithOpenAI : suggestWithAnthropic;
}
