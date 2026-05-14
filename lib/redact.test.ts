import { describe, expect, it } from "vitest";
import { redact, redactJsonString, redactString } from "./redact";

describe("redact", () => {
  it("strips the keys field at any depth", () => {
    const before = {
      brand: "Acme",
      keys: {
        openai: "sk-abcdef1234567890abcdef",
        anthropic: "sk-ant-abcdef1234567890abcdef",
      },
    };
    expect(redact(before)).toEqual({
      brand: "Acme",
      keys: "[REDACTED]",
    });
  });

  it("scrubs sk-* fragments out of free-text strings", () => {
    const before = {
      message:
        "Request failed for sk-abcdef1234567890abcdef and sk-ant-foobarbazqux1234",
    };
    const after = redact(before) as { message: string };
    expect(after.message).not.toContain("sk-abcdef1234567890abcdef");
    expect(after.message).not.toContain("sk-ant-foobarbazqux1234");
    expect(after.message).toContain("sk-***REDACTED***");
  });

  it("recurses into nested objects and arrays", () => {
    const before = {
      events: [
        { type: "request", payload: { keys: { openai: "sk-deadbeef12345" } } },
        { type: "response", body: "Used key sk-ant-supersecret999" },
      ],
    };
    const after = redact(before) as {
      events: Array<{ payload?: unknown; body?: string }>;
    };
    expect(after.events[0].payload).toEqual({ keys: "[REDACTED]" });
    expect(after.events[1].body).toContain("sk-***REDACTED***");
  });

  it("leaves non-sensitive data alone", () => {
    const before = { brand: "Acme", count: 3, ok: true, items: ["a", "b"] };
    expect(redact(before)).toEqual(before);
  });

  it("handles null and primitive roots", () => {
    expect(redact(null)).toBe(null);
    expect(redact("plain text")).toBe("plain text");
    expect(redact("sk-abcdefghijklmnopqr")).toBe("sk-***REDACTED***");
  });

  it("is case-insensitive for the keys field name", () => {
    const before = { Keys: { openai: "sk-foo123456789012" } };
    expect(redact(before)).toEqual({ Keys: "[REDACTED]" });
  });

  it("strips Authorization, x-api-key, api_key headers", () => {
    const headers = {
      "content-type": "application/json",
      Authorization: "Bearer sk-abcdef1234567890abcdef",
      "x-api-key": "sk-ant-abcdef1234567890abcdef",
      api_key: "sk-deadbeef987654321",
    };
    const after = redact(headers) as Record<string, string>;
    expect(after["content-type"]).toBe("application/json");
    expect(after.Authorization).toBe("[REDACTED]");
    expect(after["x-api-key"]).toBe("[REDACTED]");
    expect(after.api_key).toBe("[REDACTED]");
  });

  it("redacts a JSON-stringified payload via redactJsonString", () => {
    const payload = JSON.stringify({
      brand: "Acme",
      keys: { openai: "sk-abcdef1234567890abcdef" },
    });
    const after = JSON.parse(redactJsonString(payload));
    expect(after.brand).toBe("Acme");
    expect(after.keys).toBe("[REDACTED]");
  });

  it("falls back to string scrubbing when JSON parse fails", () => {
    const broken = '{"keys":{"openai":"sk-abcdef1234567890abcdef"';
    const after = redactJsonString(broken);
    expect(after).not.toContain("sk-abcdef1234567890abcdef");
    expect(after).toContain("sk-***REDACTED***");
  });

  it("redactString scrubs Error.message-style strings", () => {
    const msg =
      "Request failed: invalid key sk-totally-fake-key-1234567890";
    const after = redactString(msg);
    expect(after).not.toContain("sk-totally-fake-key-1234567890");
    expect(after).toContain("sk-***REDACTED***");
  });

  it("scrubs short sk-* fragments too (no length floor)", () => {
    expect(redactString("got sk-short here")).toContain("sk-***REDACTED***");
  });
});
