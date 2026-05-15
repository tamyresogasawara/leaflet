import { assertSafeUrl, UrlSafetyError } from "@/lib/url-safety";

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1MB cap per the brief.
const REQUEST_TIMEOUT_MS = 5_000;

export type ScrapedMeta = {
  title?: string;
  description?: string;
  h1?: string;
};

export type ScrapeResult = {
  url: string;
  meta: ScrapedMeta;
};

export class ScrapeError extends Error {
  constructor(
    public readonly code:
      | "invalid_url"
      | "private_ip"
      | "timeout"
      | "too_large"
      | "fetch_failed"
      | "wrong_content_type"
      | "redirect_blocked"
      | "no_content",
    public readonly publicMessage: string
  ) {
    super(publicMessage);
    this.name = "ScrapeError";
  }
}

function mapUrlSafetyToScrape(err: UrlSafetyError): ScrapeError {
  return new ScrapeError(
    err.code === "invalid_url" ? "invalid_url" : "private_ip",
    err.publicMessage
  );
}

/**
 * Fetch the URL through the SSRF gate, with strict redirect/size/type
 * guards. Returns the raw HTML body up to `MAX_BODY_BYTES`.
 *
 * Brief specifies: `redirect: "error"` (don't follow — a 30x to a private
 * IP is a known SSRF vector), 5s timeout, 1MB cap, reject non-text/html
 * Content-Type, polite UA.
 */
async function safeFetch(rawUrl: string): Promise<{ url: string; body: string }> {
  let checked: URL;
  try {
    checked = await assertSafeUrl(rawUrl);
  } catch (err) {
    if (err instanceof UrlSafetyError) throw mapUrlSafetyToScrape(err);
    throw err;
  }
  let res: Response;
  try {
    res = await fetch(checked.toString(), {
      method: "GET",
      redirect: "error", // any 30x throws — see brief §2
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "user-agent": "Leaflet/0.0.1 (+suggest-prompts)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ScrapeError("timeout", "That page took too long to load.");
    }
    // `redirect: "error"` raises a TypeError when fetch encounters a 30x.
    // Surface it distinctly so the user knows to try the final URL.
    if (err instanceof Error && /redirect/i.test(err.message)) {
      throw new ScrapeError(
        "redirect_blocked",
        "That URL redirects — try the final URL directly."
      );
    }
    throw new ScrapeError("fetch_failed", "Couldn't reach that URL.");
  }
  if (!res.ok) {
    throw new ScrapeError(
      "fetch_failed",
      `That page returned HTTP ${res.status}.`
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!/^text\/html|^application\/xhtml\+xml/i.test(contentType)) {
    throw new ScrapeError(
      "wrong_content_type",
      "That URL isn't an HTML page."
    );
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new ScrapeError("no_content", "That page had no body.");
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ScrapeError("too_large", "That page is too large to scan.");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return { url: checked.toString(), body };
}

// --- HTML extraction -------------------------------------------------------

function match(html: string, re: RegExp): string | undefined {
  return html.match(re)?.[1];
}

function stripTags(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

function decodeEntities(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const decoded = s
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_m, name: string) =>
      ENTITIES[name] ?? `&${name};`
    )
    .replace(/\s+/g, " ")
    .trim();
  return decoded || undefined;
}

/**
 * Extract the three fields we use as LLM input. Doesn't pull in a full
 * HTML parser — regex is fine for these three because we don't need to
 * be strict about malformed pages; we just need *something* useful.
 */
export function extractMeta(html: string): ScrapedMeta {
  const title = match(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const descriptionRaw =
    match(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    ) ??
    match(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
    ) ??
    match(
      html,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
    );
  const h1 = stripTags(match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  return {
    title: decodeEntities(stripTags(title)),
    description: decodeEntities(descriptionRaw),
    h1: decodeEntities(h1),
  };
}

/**
 * Public entry: scrape a URL through the SSRF gate, return parsed meta.
 * Returns whatever the regex extractor finds — the LLM is told to do its
 * best with whatever fields are present, so empty fields are not fatal.
 */
export async function scrapeUrl(rawUrl: string): Promise<ScrapeResult> {
  const { url, body } = await safeFetch(rawUrl);
  const meta = extractMeta(body);
  return { url, meta };
}
