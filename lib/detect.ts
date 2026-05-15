import type { EngineResult, MentionAnalysis } from "@/lib/engines/types";

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

export type CompetitorTotals = {
  totalMentions: number;
  perCompetitor: Array<{ name: string; count: number }>;
  leader: { name: string; count: number } | null;
};

/**
 * Aggregate competitor mention counts across a set of done engine results.
 * Used by the Results summary tile and the PDF report.
 */
export function computeCompetitorTotals(
  doneResults: EngineResult[]
): CompetitorTotals {
  const totals = new Map<string, number>();
  for (const r of doneResults) {
    const c = r.mentions?.competitors;
    if (!c) continue;
    for (const [name, hit] of Object.entries(c)) {
      totals.set(name, (totals.get(name) ?? 0) + hit.count);
    }
  }
  const perCompetitor = Array.from(totals, ([name, count]) => ({
    name,
    count,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const totalMentions = perCompetitor.reduce((a, b) => a + b.count, 0);
  const leader =
    perCompetitor[0] && perCompetitor[0].count > 0 ? perCompetitor[0] : null;
  return { totalMentions, perCompetitor, leader };
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
