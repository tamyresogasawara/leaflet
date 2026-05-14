import type { MentionAnalysis } from "@/lib/engines/types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD = /\w/;

function withBoundaries(alias: string): string {
  const escaped = escapeRegex(alias);
  const left = WORD.test(alias[0] ?? "") ? "\\b" : "";
  const right = WORD.test(alias[alias.length - 1] ?? "") ? "\\b" : "";
  return `${left}${escaped}${right}`;
}

function buildAliasPattern(target: string): RegExp {
  const aliases = new Set<string>();
  const raw = target.trim();
  if (!raw) return new RegExp("(?!)", "gi");
  aliases.add(raw);
  aliases.add(raw.replace(/['’]/g, ""));
  aliases.add(raw.toLowerCase());
  const parts = Array.from(aliases).map(withBoundaries).join("|");
  return new RegExp(`(?:${parts})`, "gi");
}

type RawMatch = { start: number; end: number; label: string };

function findMatches(text: string, target: string): RawMatch[] {
  if (!target.trim()) return [];
  const pattern = buildAliasPattern(target);
  const out: RawMatch[] = [];
  for (const m of text.matchAll(pattern)) {
    if (m.index === undefined) continue;
    out.push({ start: m.index, end: m.index + m[0].length, label: m[0] });
  }
  return out;
}

export type MentionSpan = RawMatch & {
  kind: "brand" | "competitor";
  target: string;
};

export function findMentionSpans(
  text: string,
  brand: string,
  competitors: string[]
): MentionSpan[] {
  const spans: MentionSpan[] = [];
  for (const m of findMatches(text, brand)) {
    spans.push({ ...m, kind: "brand", target: brand });
  }
  for (const c of competitors) {
    for (const m of findMatches(text, c)) {
      spans.push({ ...m, kind: "competitor", target: c });
    }
  }
  // Order by start, then longer first, then brand wins ties (so brand beats
  // a competitor span that starts at the same index).
  spans.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.kind === "brand" ? -1 : 1;
  });
  const out: MentionSpan[] = [];
  let cursor = -1;
  for (const s of spans) {
    if (s.start < cursor) continue;
    out.push(s);
    cursor = s.end;
  }
  return out;
}

export function detectMentions(
  text: string,
  brand: string,
  competitors: string[]
): MentionAnalysis {
  const brandMatches = findMatches(text, brand);
  const competitorHits: MentionAnalysis["competitors"] = {};
  for (const c of competitors) {
    const matches = findMatches(text, c);
    competitorHits[c] = {
      mentioned: matches.length > 0,
      count: matches.length,
      firstIndex: matches[0]?.start ?? null,
    };
  }
  return {
    brand: {
      mentioned: brandMatches.length > 0,
      count: brandMatches.length,
      firstIndex: brandMatches[0]?.start ?? null,
    },
    competitors: competitorHits,
  };
}
