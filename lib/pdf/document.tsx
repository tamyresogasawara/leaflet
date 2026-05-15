"use client";
import * as React from "react";
import {
  Document,
  Font,
  Link,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { brand } from "@/brand.config";
import { computeCompetitorTotals, findMentionSpans } from "@/lib/detect";
import { t } from "@/lib/strings";
import type { Analysis } from "@/lib/stores/runsStore";

// --- Fonts -----------------------------------------------------------------
//
// We try to register Inter from Google Fonts' CDN (Font.register is the
// only sanctioned path in @react-pdf — it fetches at render time). If the
// fetch fails (offline, locked-down network, CDN hiccup), @react-pdf falls
// back to Helvetica silently. We deliberately do NOT block render on font
// availability — the PDF still produces; it just won't be in Inter.
//
// Trade-off: registering local .ttf files would be more reliable but
// requires shipping the fonts in /public/ and an additional MIME-type
// dance for the CDN fetch in dev. v0 ships with the CDN attempt; if it
// turns out to be unreliable we can mirror the .ttf locally.
try {
  Font.register({
    family: "Inter",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIa1ZL7.woff2",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIa3ZL7.woff2",
        fontWeight: 600,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIa3ZL7.woff2",
        fontWeight: 700,
      },
    ],
  });
} catch {
  // Re-registration on hot reload throws — safe to ignore.
}

// --- Palette ---------------------------------------------------------------

const COLORS = {
  ink: "#0B0F19",
  muted: "#475569",
  subtle: "#94A3B8",
  border: "#E2E8F0",
  surface: "#F8FAFC",
  error: "#B91C1C",
} as const;

const FONT_FAMILY = "Inter";

// --- Styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    color: COLORS.ink,
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 10,
    lineHeight: 1.5,
    fontFamily: FONT_FAMILY,
  },
  cover: {
    backgroundColor: "#FFFFFF",
    color: COLORS.ink,
    padding: 56,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT_FAMILY,
  },
  coverInner: {
    alignItems: "center",
    width: "100%",
  },
  coverLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  coverWordmark: { fontSize: 14, fontWeight: 700 },
  coverTitle: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 12,
    textAlign: "center",
  },
  coverSubject: {
    fontSize: 18,
    color: COLORS.muted,
    marginBottom: 6,
    textAlign: "center",
  },
  coverTimestamp: {
    fontSize: 10,
    color: COLORS.subtle,
    marginBottom: 24,
    textAlign: "center",
  },
  coverPrompt: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: "center",
    fontStyle: "italic",
    maxWidth: 380,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  tile: {
    // ~48% so 2 tiles fit per row with the 12pt gap; flexWraps to 2 rows.
    width: "48%",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "solid",
    borderRadius: 6,
    padding: 12,
  },
  tileLabel: {
    fontSize: 7,
    textTransform: "uppercase",
    color: COLORS.subtle,
    letterSpacing: 0.5,
  },
  tileValue: { fontSize: 13, fontWeight: 700, marginTop: 4 },
  tileHelp: { fontSize: 8, color: COLORS.muted, marginTop: 4 },
  engineCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "solid",
    borderRadius: 6,
  },
  engineHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  engineLabel: { fontSize: 11, fontWeight: 700 },
  enginePill: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillDone: { backgroundColor: "#DCFCE7", color: "#047857" },
  pillError: { backgroundColor: "#FEE2E2", color: COLORS.error },
  engineMeta: { fontSize: 8, color: COLORS.subtle, marginLeft: "auto" },
  engineBody: { padding: 12 },
  brandHighlight: { color: brand.accentHex, fontWeight: 700 },
  competitorHighlight: { color: "#B45309", fontWeight: 700 },
  errorText: { color: COLORS.error, fontSize: 10 },
  competitorBlock: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
  },
  competitorTitle: {
    fontSize: 7,
    textTransform: "uppercase",
    color: COLORS.subtle,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  competitorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 9,
  },
  competitorTallyHit: {
    color: "#B45309",
    fontWeight: 700,
    fontSize: 9,
  },
  competitorTallyMiss: {
    color: COLORS.subtle,
    fontSize: 9,
  },
  citationsTitle: {
    fontSize: 9,
    fontWeight: 700,
    marginTop: 8,
    color: COLORS.muted,
  },
  citationItem: { fontSize: 8, marginTop: 2, color: COLORS.muted },
  citationLink: { color: brand.primaryHex, textDecoration: "underline" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLORS.subtle,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopStyle: "solid",
    fontFamily: FONT_FAMILY,
  },
});

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
};

// --- Helpers --------------------------------------------------------------

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function firstPositionSummary(
  results: Analysis["results"],
  brandName: string
): string {
  const done = results.filter((r) => r.status === "done");
  if (done.length === 0) return "—";
  return done
    .map((r) => {
      const label = ENGINE_LABELS[r.engine] ?? r.engine;
      const fi = r.mentions?.brand.firstIndex;
      if (fi == null) return `not in ${label}`;
      return `${label}: chr ${fi}`;
    })
    .join(" · ") || (brandName ? "—" : "—");
}

// --- Document --------------------------------------------------------------

export function ReportDocument({ analysis }: { analysis: Analysis }) {
  const done = analysis.results.filter((r) => r.status === "done");
  const mentioned = done.filter((r) => r.mentions?.brand.mentioned).length;
  const totalCitations = done.reduce(
    (acc, r) => acc + (r.citations?.length ?? 0),
    0
  );
  const competitorTotals = computeCompetitorTotals(done);
  const competitorTileValue =
    competitorTotals.totalMentions === 0
      ? "0"
      : competitorTotals.leader
        ? `${competitorTotals.totalMentions} (top: ${competitorTotals.leader.name} · ${competitorTotals.leader.count})`
        : String(competitorTotals.totalMentions);
  const createdAt = format(new Date(analysis.createdAt), "PPpp");
  const promptForCover = truncate(analysis.input.prompt, 200);

  return (
    <Document
      title={`${t("appName")} — ${analysis.input.brand}`}
      author={t("appName")}
    >
      {/* Cover */}
      <Page size="A4" style={styles.cover}>
        <View style={styles.coverInner}>
          <View style={styles.coverLogoRow}>
            <MonoLogo />
            <Text style={styles.coverWordmark}>{t("appName")}</Text>
          </View>
          <Text style={styles.coverTitle}>AI visibility report</Text>
          <Text style={styles.coverSubject}>{analysis.input.brand}</Text>
          <Text style={styles.coverTimestamp}>Generated {createdAt}</Text>
          <Text style={styles.coverPrompt}>“{promptForCover}”</Text>
        </View>
        <Footer />
      </Page>

      {/* Summary + answers */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.metricsRow}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Mention rate</Text>
            <Text style={styles.tileValue}>
              {mentioned} of {done.length} engines
            </Text>
            <Text style={styles.tileHelp}>
              How many of the engines you tested mentioned your brand at least
              once.
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>First position</Text>
            <Text style={styles.tileValue}>
              {firstPositionSummary(analysis.results, analysis.input.brand)}
            </Text>
            <Text style={styles.tileHelp}>
              Where your brand first appears in the answer text.
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Competitor mentions</Text>
            <Text style={styles.tileValue}>{competitorTileValue}</Text>
            <Text style={styles.tileHelp}>
              Total mentions across competitors and which one leads.
            </Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Citations found</Text>
            <Text style={styles.tileValue}>{totalCitations}</Text>
            <Text style={styles.tileHelp}>
              Distinct sources the engines linked to.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Answers</Text>
        {analysis.results.map((r) => {
          const label = ENGINE_LABELS[r.engine] ?? r.engine;
          const pillStyle =
            r.status === "done" ? styles.pillDone : styles.pillError;
          const pillText = r.status === "done" ? "Done" : "Error";
          return (
            <View key={r.engine} style={styles.engineCard} wrap>
              <View style={styles.engineHeader}>
                <Text style={styles.engineLabel}>{label}</Text>
                <Text style={[styles.enginePill, pillStyle]}>{pillText}</Text>
                {r.ranAt ? (
                  <Text style={styles.engineMeta}>
                    {format(new Date(r.ranAt), "Pp")}
                  </Text>
                ) : null}
              </View>
              <View style={styles.engineBody}>
                {r.status === "error" ? (
                  <Text style={styles.errorText}>
                    {r.error?.message ?? "Engine failed."}
                  </Text>
                ) : r.answerText ? (
                  <HighlightedPdfAnswer
                    text={r.answerText}
                    brand={analysis.input.brand}
                    competitors={analysis.input.competitors}
                  />
                ) : (
                  <Text style={{ color: COLORS.subtle }}>No answer.</Text>
                )}
                <CompetitorTalliesPdf
                  result={r}
                  competitors={analysis.input.competitors}
                />
                {r.citations && r.citations.length > 0 ? (
                  <>
                    <Text style={styles.citationsTitle}>
                      Citations ({r.citations.length})
                    </Text>
                    {r.citations.map((c, i) => (
                      <Text key={i} style={styles.citationItem}>
                        <Link src={c.url} style={styles.citationLink}>
                          {c.title ?? c.url}
                        </Link>
                      </Text>
                    ))}
                  </>
                ) : null}
              </View>
            </View>
          );
        })}
        <Footer />
      </Page>
    </Document>
  );
}

type EngineResultLike = Analysis["results"][number];

function CompetitorTalliesPdf({
  result,
  competitors,
}: {
  result: EngineResultLike;
  competitors: string[];
}) {
  if (competitors.length === 0) return null;
  const hits = result.mentions?.competitors ?? {};
  return (
    <View style={styles.competitorBlock}>
      <Text style={styles.competitorTitle}>Competitor mentions</Text>
      <View style={styles.competitorRow}>
        {competitors.map((name) => {
          const count = hits[name]?.count ?? 0;
          return (
            <Text
              key={name}
              style={
                count > 0
                  ? styles.competitorTallyHit
                  : styles.competitorTallyMiss
              }
            >
              {name} · {count}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function HighlightedPdfAnswer({
  text,
  brand: brandName,
  competitors,
}: {
  text: string;
  brand: string;
  competitors: string[];
}) {
  const spans = findMentionSpans(text, brandName, competitors);
  if (spans.length === 0) return <Text>{text}</Text>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    const slice = text.slice(s.start, s.end);
    parts.push(
      s.kind === "brand" ? (
        <Text key={`b-${i}`} style={styles.brandHighlight}>
          {`✓ ${slice}`}
        </Text>
      ) : (
        <Text key={`c-${i}`} style={styles.competitorHighlight}>
          {`▸ [${slice}]`}
        </Text>
      )
    );
    cursor = s.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Text>{parts}</Text>;
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>{brand.pdfFooter}</Text>
      <Text
        render={({
          pageNumber,
          totalPages,
        }: {
          pageNumber: number;
          totalPages: number;
        }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

// Inline the mono mark with a hardcoded ink fill — @react-pdf's Image is
// PNG/JPG-only and SVG via Image is unreliable; inlining through <Svg>
// + <Path> gives crisp vector output without a network fetch.
function MonoLogo() {
  return (
    <Svg viewBox="0 0 28 24" width={20} height={17}>
      <Path
        d="M4 4 H22 A2 2 0 0 1 24 6 V18 A2 2 0 0 1 22 20 H10 L4 24 Z M20 11 A2 2 0 0 0 20 7 A2 2 0 0 0 20 11 Z"
        fill={COLORS.ink}
        fillRule="evenodd"
      />
    </Svg>
  );
}
