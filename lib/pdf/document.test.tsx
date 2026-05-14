/**
 * @vitest-environment node
 *
 * We instantiate <ReportDocument/> and walk the returned React element
 * tree, collecting every string child. This avoids actually rendering to
 * PDF (which requires fonts + a real renderer + binary fixtures) while
 * still asserting that brand/engine labels/metrics make it into the
 * document. The component itself uses @react-pdf primitives (Document,
 * Page, Text, etc.) — we don't care about those, only about the strings
 * they wrap.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { Analysis } from "@/lib/stores/runsStore";

// @react-pdf/renderer pulls in Yoga/wasm + browser-only deps at import time
// in some paths. We stub the surface area the document uses with passthrough
// React elements so the component renders into a plain JSX tree we can walk.
vi.mock("@react-pdf/renderer", () => {
  const pass = (tag: string) =>
    function Passthrough(props: Record<string, unknown>) {
      return React.createElement(tag, props, props.children as React.ReactNode);
    };
  return {
    Document: pass("document"),
    Page: pass("page"),
    Text: pass("text"),
    View: pass("view"),
    Link: pass("link"),
    Svg: pass("svg"),
    Path: pass("path"),
    StyleSheet: { create: (s: unknown) => s },
    Font: { register: () => {} },
  };
});

import { ReportDocument } from "./document";

const sample: Analysis = {
  id: "11111111-2222-3333-4444-555555555555",
  createdAt: "2026-05-14T03:00:00.000Z",
  input: {
    brand: "Acme Inc.",
    competitors: ["HubSpot", "Pipedrive"],
    prompt: "What are the best CRMs for early-stage startups?",
  },
  results: [
    {
      engine: "openai",
      status: "done",
      answerText:
        "Top CRMs include HubSpot and Acme Inc. for early-stage teams.",
      citations: [{ url: "https://g2.com/x", title: "G2" }],
      mentions: {
        brand: { mentioned: true, count: 1, firstIndex: 27 },
        competitors: {
          HubSpot: { mentioned: true, count: 1, firstIndex: 16 },
          Pipedrive: { mentioned: false, count: 0, firstIndex: null },
        },
      },
      ranAt: "2026-05-14T03:00:10.000Z",
    },
    {
      engine: "anthropic",
      status: "done",
      answerText: "Several CRMs work well: HubSpot, Pipedrive, and others.",
      citations: [],
      mentions: {
        brand: { mentioned: false, count: 0, firstIndex: null },
        competitors: {
          HubSpot: { mentioned: true, count: 1, firstIndex: 24 },
          Pipedrive: { mentioned: true, count: 1, firstIndex: 33 },
        },
      },
      ranAt: "2026-05-14T03:00:12.000Z",
    },
  ],
};

function collectStrings(node: React.ReactNode): string[] {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectStrings);
  if (React.isValidElement(node)) {
    const props = (node.props ?? {}) as { children?: React.ReactNode };
    return collectStrings(props.children);
  }
  return [];
}

describe("ReportDocument", () => {
  it("renders without throwing for a complete Analysis", () => {
    expect(() =>
      (ReportDocument as (p: { analysis: Analysis }) => React.ReactNode)({
        analysis: sample,
      })
    ).not.toThrow();
  });

  it("includes the brand name on the cover", () => {
    const tree = (ReportDocument as (p: { analysis: Analysis }) => React.ReactNode)({
      analysis: sample,
    });
    const text = collectStrings(tree).join(" ");
    expect(text).toContain("Acme Inc.");
  });

  it("includes both engine labels in the answers section", () => {
    const tree = (ReportDocument as (p: { analysis: Analysis }) => React.ReactNode)({
      analysis: sample,
    });
    const text = collectStrings(tree).join(" ");
    expect(text).toContain("ChatGPT");
    expect(text).toContain("Claude");
  });

  it("includes the summary metrics", () => {
    const tree = (ReportDocument as (p: { analysis: Analysis }) => React.ReactNode)({
      analysis: sample,
    });
    const text = collectStrings(tree).join(" ");
    expect(text).toContain("Mention rate");
    expect(text).toContain("First position");
    expect(text).toContain("Citations found");
  });

  it("includes the report title and the prompt verbatim (short enough)", () => {
    const tree = (ReportDocument as (p: { analysis: Analysis }) => React.ReactNode)({
      analysis: sample,
    });
    const text = collectStrings(tree).join(" ");
    expect(text).toContain("AI visibility report");
    expect(text).toContain(sample.input.prompt);
  });

  it("truncates a very long prompt with an ellipsis", () => {
    const long = "lorem ipsum ".repeat(40); // ~480 chars
    const a: Analysis = {
      ...sample,
      input: { ...sample.input, prompt: long },
    };
    const tree = (ReportDocument as (p: { analysis: Analysis }) => React.ReactNode)({
      analysis: a,
    });
    const text = collectStrings(tree).join(" ");
    expect(text).toMatch(/…/);
    // raw long prompt must not be present in full
    expect(text).not.toContain(long);
  });
});
