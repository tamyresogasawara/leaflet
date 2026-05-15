import { describe, expect, it } from "vitest";
import { extractMeta } from "./scrape";

describe("extractMeta", () => {
  it("extracts a standard title + meta description + h1", () => {
    const html = `<!doctype html>
<html>
<head>
  <title>Acme CRM — Sales for Real Teams</title>
  <meta name="description" content="A friendly CRM for small teams.">
</head>
<body>
  <h1>Close more deals.</h1>
  <p>Body text.</p>
</body>
</html>`;
    const meta = extractMeta(html);
    expect(meta.title).toBe("Acme CRM — Sales for Real Teams");
    expect(meta.description).toBe("A friendly CRM for small teams.");
    expect(meta.h1).toBe("Close more deals.");
  });

  it("falls back to og:description when name=description is absent", () => {
    const html = `<head>
      <title>Some page</title>
      <meta property="og:description" content="OG fallback content.">
    </head>`;
    const meta = extractMeta(html);
    expect(meta.description).toBe("OG fallback content.");
  });

  it("handles reversed attribute order on the meta tag", () => {
    const html = `<head>
      <meta content="Reversed-order description." name="description">
    </head>`;
    const meta = extractMeta(html);
    expect(meta.description).toBe("Reversed-order description.");
  });

  it("returns undefined for fields that aren't present (graceful empty)", () => {
    const html = `<html><body><p>just a body</p></body></html>`;
    const meta = extractMeta(html);
    expect(meta.title).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.h1).toBeUndefined();
  });

  it("decodes the common HTML entities (&amp; &lt; &gt; &quot; &apos; &#39;)", () => {
    const html = `<head>
      <title>Tom &amp; Jerry &lt;3 &quot;Mice&quot;</title>
      <meta name="description" content="It&#39;s fine &amp; dandy.">
    </head>
    <body><h1>A &gt; B</h1></body>`;
    const meta = extractMeta(html);
    expect(meta.title).toBe(`Tom & Jerry <3 "Mice"`);
    expect(meta.description).toBe(`It's fine & dandy.`);
    expect(meta.h1).toBe("A > B");
  });

  it("strips inline tags inside h1", () => {
    const html = `<h1>Close <em>more</em> deals.</h1>`;
    expect(extractMeta(html).h1).toBe("Close more deals.");
  });

  it("collapses whitespace and trims fields", () => {
    const html = `<head>
      <title>
         Spaces   everywhere
      </title>
    </head>`;
    expect(extractMeta(html).title).toBe("Spaces everywhere");
  });

  it("picks the FIRST h1 when there are several", () => {
    const html = `<h1>First headline</h1><p>x</p><h1>Second headline</h1>`;
    expect(extractMeta(html).h1).toBe("First headline");
  });

  it("ignores unrelated meta tags", () => {
    const html = `<head>
      <meta name="viewport" content="width=device-width">
      <meta name="theme-color" content="#FFFFFF">
      <meta name="description" content="The real description.">
    </head>`;
    expect(extractMeta(html).description).toBe("The real description.");
  });
});
