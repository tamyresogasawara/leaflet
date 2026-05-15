import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "node:dns/promises";
import {
  assertSafeUrl,
  isPrivateAddress,
  parseSafeUrl,
  UrlSafetyError,
} from "./url-safety";

const mockLookup = vi.mocked(lookup);

function stubLookup(addresses: Array<{ address: string; family: number }>) {
  // The guard always calls with { all: true }; vitest's mock typing is loose.
  // @ts-expect-error overload resolution
  mockLookup.mockResolvedValue(addresses);
}

describe("parseSafeUrl (pre-DNS validation)", () => {
  it("accepts plain http and https public URLs", () => {
    expect(() => parseSafeUrl("https://example.com/")).not.toThrow();
    expect(() => parseSafeUrl("http://example.com:8080/path")).not.toThrow();
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => parseSafeUrl("file:///etc/passwd")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("gopher://example.com")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("ftp://example.com/x")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("javascript:alert(1)")).toThrow(UrlSafetyError);
  });

  it("rejects malformed URLs", () => {
    expect(() => parseSafeUrl("not a url")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("")).toThrow(UrlSafetyError);
  });

  it("rejects localhost / 0.0.0.0 / *.local / *.internal", () => {
    expect(() => parseSafeUrl("http://localhost/")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("http://0.0.0.0/")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("http://printer.local/")).toThrow(UrlSafetyError);
    expect(() => parseSafeUrl("http://srv.internal/")).toThrow(UrlSafetyError);
  });

  it("rejects IPv4 literals in private ranges", () => {
    for (const host of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
    ]) {
      expect(() => parseSafeUrl(`http://${host}/`)).toThrow(UrlSafetyError);
    }
  });

  it("rejects IPv6 literals in private ranges", () => {
    for (const host of ["[::1]", "[fe80::1]", "[fc00::1]", "[fd00::1]"]) {
      expect(() => parseSafeUrl(`http://${host}/`)).toThrow(UrlSafetyError);
    }
  });
});

describe("assertSafeUrl (post-DNS validation)", () => {
  it("rejects when DNS resolves to AWS metadata IP", async () => {
    stubLookup([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeUrl("http://evil.example.com/")).rejects.toBeInstanceOf(
      UrlSafetyError
    );
  });

  it("rejects when DNS resolves to RFC1918", async () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1"]) {
      stubLookup([{ address: ip, family: 4 }]);
      await expect(
        assertSafeUrl(`http://name-${ip.replace(/\./g, "-")}.example.com/`)
      ).rejects.toBeInstanceOf(UrlSafetyError);
    }
  });

  it("rejects IPv6 loopback and link-local via DNS", async () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd00::1"]) {
      stubLookup([{ address: ip, family: 6 }]);
      await expect(assertSafeUrl("http://test.example.com/")).rejects.toBeInstanceOf(
        UrlSafetyError
      );
    }
  });

  it("rejects v4-mapped IPv6 loopback", async () => {
    stubLookup([{ address: "::ffff:127.0.0.1", family: 6 }]);
    await expect(assertSafeUrl("http://test.example.com/")).rejects.toBeInstanceOf(
      UrlSafetyError
    );
  });

  it("rejects 0.0.0.0 and multicast", async () => {
    for (const ip of ["0.0.0.0", "224.0.0.1"]) {
      stubLookup([{ address: ip, family: 4 }]);
      await expect(assertSafeUrl("http://test.example.com/")).rejects.toBeInstanceOf(
        UrlSafetyError
      );
    }
  });

  it("rejects mixed-result DNS where ANY address is private", async () => {
    stubLookup([
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(assertSafeUrl("http://test.example.com/")).rejects.toBeInstanceOf(
      UrlSafetyError
    );
  });

  it("accepts a public IPv4 address", async () => {
    stubLookup([{ address: "8.8.8.8", family: 4 }]);
    await expect(assertSafeUrl("http://public.example.com/")).resolves.toBeInstanceOf(
      URL
    );
  });
});

describe("isPrivateAddress (pure)", () => {
  it("returns true for RFC1918, loopback, link-local, multicast", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "172.20.1.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("returns false for public addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});
