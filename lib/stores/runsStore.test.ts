import { describe, expect, it } from "vitest";
import { migrateV1ToV2 } from "./runsStore";

/**
 * Pure-function tests for the v1 → v2 schema migration.
 * Doesn't touch the live zustand store — just asserts the migrator's
 * input → output contract.
 */
describe("migrateV1ToV2", () => {
  it("wraps single prompt into prompts[]", () => {
    const v1 = {
      analyses: {
        a1: {
          id: "a1",
          createdAt: "2026-05-15T01:00:00.000Z",
          input: {
            brand: "Acme",
            competitors: ["HubSpot"],
            prompt: "What are the best CRMs?",
          },
          results: [
            {
              engine: "openai" as const,
              status: "done" as const,
              answerText: "HubSpot and Acme are good.",
              citations: [],
              mentions: {
                brand: { mentioned: true, count: 1, firstIndex: 11 },
                competitors: {
                  HubSpot: { mentioned: true, count: 1, firstIndex: 0 },
                },
              },
            },
          ],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.analyses.a1!.input.prompts).toEqual([
      "What are the best CRMs?",
    ]);
    expect(v2.analyses.a1!.input).not.toHaveProperty("prompt");
  });

  it("stamps promptIndex: 0 on every result", () => {
    const v1 = {
      analyses: {
        a1: {
          id: "a1",
          createdAt: "t",
          input: { brand: "B", competitors: [], prompt: "p" },
          results: [
            { engine: "openai" as const, status: "done" as const },
            { engine: "anthropic" as const, status: "done" as const },
          ],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.analyses.a1!.results.every((r) => r.promptIndex === 0)).toBe(
      true
    );
  });

  it("denormalizes the prompt text onto every result", () => {
    const v1 = {
      analyses: {
        a1: {
          id: "a1",
          createdAt: "t",
          input: { brand: "B", competitors: [], prompt: "the-prompt-text" },
          results: [
            { engine: "openai" as const, status: "done" as const },
          ],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.analyses.a1!.results[0]!.prompt).toBe("the-prompt-text");
  });

  it("preserves id, createdAt, brand, competitors, answer payload", () => {
    const v1 = {
      analyses: {
        a1: {
          id: "a1",
          createdAt: "2026-05-15T01:00:00.000Z",
          input: {
            brand: "Acme",
            competitors: ["HubSpot", "Pipedrive"],
            prompt: "p",
          },
          results: [
            {
              engine: "openai" as const,
              status: "done" as const,
              answerText: "answer body",
              citations: [{ url: "https://example.com", title: "Ex" }],
              ranAt: "2026-05-15T01:00:10.000Z",
            },
          ],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    const a = v2.analyses.a1!;
    expect(a.id).toBe("a1");
    expect(a.createdAt).toBe("2026-05-15T01:00:00.000Z");
    expect(a.input.brand).toBe("Acme");
    expect(a.input.competitors).toEqual(["HubSpot", "Pipedrive"]);
    expect(a.results[0]!.answerText).toBe("answer body");
    expect(a.results[0]!.citations).toEqual([
      { url: "https://example.com", title: "Ex" },
    ]);
    expect(a.results[0]!.ranAt).toBe("2026-05-15T01:00:10.000Z");
  });

  it("handles an empty v1 store", () => {
    const v2 = migrateV1ToV2({ analyses: {} });
    expect(v2.analyses).toEqual({});
  });

  it("migrates multiple analyses independently", () => {
    const v1 = {
      analyses: {
        a1: {
          id: "a1",
          createdAt: "t1",
          input: { brand: "X", competitors: [], prompt: "first" },
          results: [{ engine: "openai" as const, status: "done" as const }],
        },
        a2: {
          id: "a2",
          createdAt: "t2",
          input: { brand: "Y", competitors: [], prompt: "second" },
          results: [
            { engine: "anthropic" as const, status: "error" as const },
          ],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.analyses.a1!.input.prompts).toEqual(["first"]);
    expect(v2.analyses.a2!.input.prompts).toEqual(["second"]);
    expect(v2.analyses.a1!.results[0]!.prompt).toBe("first");
    expect(v2.analyses.a2!.results[0]!.prompt).toBe("second");
  });
});
