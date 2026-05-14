import { describe, expect, it } from "vitest";
import { detectMentions } from "./detect";

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
