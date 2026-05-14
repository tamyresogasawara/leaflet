"use client";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { findMentionSpans } from "@/lib/detect";

// Strict allowlist on top of rehype-sanitize's GitHub default. Drops `img`,
// `iframe`, anything that could load remote resources, and any href that
// isn't http/https/mailto. Sanitizer runs BEFORE rendering, so even if the
// LLM tried to inject raw HTML, react-markdown wouldn't see it.
const schema = {
  ...defaultSchema,
  tagNames: [
    "p",
    "br",
    "strong",
    "em",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "span",
    "a",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [["href"], "title"],
    code: [["className", /^language-/]],
  },
  protocols: { href: ["http", "https", "mailto"] },
};

const REMARK_PLUGINS: never[] = [];
// react-markdown's plugin tuples typecheck poorly without the cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REHYPE_PLUGINS = [[rehypeSanitize, schema]] as any;

export type SafeMarkdownProps = {
  source: string;
  brand?: string;
  competitors?: string[];
};

/**
 * Render LLM answer text through react-markdown + rehype-sanitize.
 *
 * When `brand`/`competitors` are provided, the renderer's `text` node is
 * overridden to wrap matches in styled spans. Highlighting works on
 * post-parse text nodes, not the raw input string — markdown formatting
 * (bold, lists, code) renders normally around the highlights.
 */
export function SafeMarkdown({
  source,
  brand,
  competitors = [],
}: SafeMarkdownProps) {
  const components = React.useMemo(() => {
    if (!brand && competitors.length === 0) return undefined;
    return {
      text({ value }: { value?: string }) {
        return renderHighlights(value ?? "", brand ?? "", competitors);
      },
    } as Parameters<typeof ReactMarkdown>[0]["components"];
  }, [brand, competitors]);

  return (
    <div className="prose prose-sm max-w-none text-sm leading-6 text-ink">
      <ReactMarkdown
        rehypePlugins={REHYPE_PLUGINS}
        remarkPlugins={REMARK_PLUGINS}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function renderHighlights(
  text: string,
  brand: string,
  competitors: string[]
): React.ReactNode {
  const spans = findMentionSpans(text, brand, competitors);
  if (spans.length === 0) return text;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, idx) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    const slice = text.slice(s.start, s.end);
    out.push(
      s.kind === "brand" ? (
        <span
          key={`b-${idx}`}
          className="font-semibold text-brand-mention"
        >
          ✓ {slice}
        </span>
      ) : (
        <span
          key={`c-${idx}`}
          className="font-semibold text-competitor-mention"
        >
          ▸ [{slice}]
        </span>
      )
    );
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
