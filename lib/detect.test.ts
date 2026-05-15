import { describe, expect, it } from "vitest";
import { computeCompetitorTotals, detectMentions } from "./detect";
import type { EngineResult } from "@/lib/engines/types";

describe("detectMentions", () => {
  it("finds a simple brand mention", () => {
    const r = detectMentions("Acme Inc. is great.", "Acme Inc.", []);
    expect(r.brand.mentioned).toBe(true);
    expect(r.brand.count).toBe(1);
    expect(r.brand.firstIndex).toBe(0);
  });

  it("counts multiple mentions", () => {
    const r = detectMentions("Acme is fine. Acme also works.", "Acme", []);
    expect(r.brand.count).toBe(2);
  });

  it("is case-insensitive", () => {
    const r = detectMentions("acme is fine.", "Acme", []);
    expect(r.brand.mentioned).toBe(true);
  });

  it("respects word boundaries", () => {
    const r = detectMentions("Acmebase has nothing to do with Acme.", "Acme", []);
    expect(r.brand.count).toBe(1);
  });

  it("handles competitors", () => {
    const r = detectMentions(
      "Acme is good but Hubspot is also fine.",
      "Acme",
      ["Hubspot", "Pipedrive"]
    );
    expect(r.competitors.Hubspot.mentioned).toBe(true);
    expect(r.competitors.Pipedrive.mentioned).toBe(false);
  });

  it("returns absent state for empty brand", () => {
    const r = detectMentions("Some text.", "", []);
    expect(r.brand.mentioned).toBe(false);
    expect(r.brand.firstIndex).toBe(null);
  });
});

function mkResult(
  engine: "openai" | "anthropic",
  competitors: Record<string, number>,
  promptIndex = 0
): EngineResult {
  return {
    engine,
    promptIndex,
    prompt: `prompt-${promptIndex}`,
    status: "done",
    mentions: {
      brand: { mentioned: false, count: 0, firstIndex: null },
      competitors: Object.fromEntries(
        Object.entries(competitors).map(([name, count]) => [
          name,
          { mentioned: count > 0, count, firstIndex: count > 0 ? 0 : null },
        ])
      ),
    },
  };
}

describe("computeCompetitorTotals", () => {
  it("sums per-engine counts across all done results", () => {
    const r = computeCompetitorTotals([
      mkResult("openai", { HubSpot: 2, Pipedrive: 1 }),
      mkResult("anthropic", { HubSpot: 1, Pipedrive: 0, Salesforce: 3 }),
    ]);
    expect(r.totalMentions).toBe(7);
    expect(r.perCompetitor).toEqual([
      // Tie at 3: alphabetical tiebreaker → HubSpot before Salesforce.
      { name: "HubSpot", count: 3 },
      { name: "Salesforce", count: 3 },
      { name: "Pipedrive", count: 1 },
    ]);
    expect(r.leader?.name).toBe("HubSpot");
    expect(r.leader?.count).toBe(3);
  });

  it("returns null leader when no competitor is mentioned", () => {
    const r = computeCompetitorTotals([
      mkResult("openai", { HubSpot: 0, Pipedrive: 0 }),
    ]);
    expect(r.totalMentions).toBe(0);
    expect(r.leader).toBe(null);
  });

  it("handles empty input", () => {
    const r = computeCompetitorTotals([]);
    expect(r.totalMentions).toBe(0);
    expect(r.perCompetitor).toEqual([]);
    expect(r.leader).toBe(null);
  });

  it("skips results without mentions", () => {
    const without: EngineResult = {
      engine: "openai",
      promptIndex: 0,
      prompt: "p",
      status: "done",
    };
    const r = computeCompetitorTotals([
      without,
      mkResult("anthropic", { HubSpot: 2 }),
    ]);
    expect(r.totalMentions).toBe(2);
  });

  it("sums across multiple prompts (different promptIndex)", () => {
    const r = computeCompetitorTotals([
      mkResult("openai", { HubSpot: 2 }, 0),
      mkResult("openai", { HubSpot: 1, Pipedrive: 2 }, 1),
      mkResult("anthropic", { HubSpot: 0, Pipedrive: 0 }, 0),
    ]);
    expect(r.totalMentions).toBe(5);
    expect(r.perCompetitor.find((p) => p.name === "HubSpot")?.count).toBe(3);
    expect(r.perCompetitor.find((p) => p.name === "Pipedrive")?.count).toBe(2);
  });
});
