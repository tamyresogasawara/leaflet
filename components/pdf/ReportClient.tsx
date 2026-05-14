"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import { useHasHydrated } from "@/lib/stores/useHasHydrated";
import { useRunsStore } from "@/lib/stores/runsStore";
import { brand } from "@/brand.config";

// Dynamic-import the renderer + the document. `@react-pdf/renderer` is ~250KB
// gzipped; loading it only on the report route keeps the home and dashboard
// bundles clean. `ssr: false` because the renderer uses browser-only APIs
// (Blob, URL.createObjectURL) inside PDFDownloadLink.
const PDFDownloadLink = dynamic(
  async () => (await import("@react-pdf/renderer")).PDFDownloadLink,
  {
    ssr: false,
    loading: () => (
      <Button disabled>Preparing PDF…</Button>
    ),
  }
);

const LazyReportDocument = dynamic(
  () => import("@/lib/pdf/document").then((m) => m.ReportDocument),
  { ssr: false }
);

export function ReportClient({ runId }: { runId: string }) {
  const hydrated = useHasHydrated();
  const analyses = useRunsStore((s) => s.analyses);
  const analysis = hydrated ? analyses[runId] : null;
  // Brief filename format: <appName>-<brand-with-spaces->-<id-prefix>.pdf
  const fileName = analysis
    ? `${brand.appName.toLowerCase()}-${analysis.input.brand
        .toLowerCase()
        .replace(/\s+/g, "-")}-${analysis.id.slice(0, 8)}.pdf`
    : "report.pdf";

  if (!hydrated) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (!analysis) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          This report isn&apos;t in your history. Open a saved run or save the
          one you just ran.
        </p>
        <Link href="/history" className="text-sm font-medium text-ink underline">
          ← Back to history
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-subtle">Report</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {analysis.input.brand}
          </h1>
          <p className="mt-1 text-sm text-muted">{analysis.input.prompt}</p>
        </div>
        <div className="flex items-center gap-2">
          <PDFDownloadLink
            document={<LazyReportDocument analysis={analysis} />}
            fileName={fileName}
            className="inline-flex h-10 items-center justify-center rounded bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            {/* react-pdf renders a function-as-child while building. */}
            {(state: {
              loading: boolean;
              error: Error | null;
            }) =>
              state.error
                ? "PDF failed — retry"
                : state.loading
                  ? "Preparing PDF…"
                  : "Download PDF"
            }
          </PDFDownloadLink>
          <Link
            href="/history"
            className="text-sm text-muted hover:underline"
          >
            History
          </Link>
        </div>
      </header>

      <section className="rounded-card border border-border bg-surface p-6 text-sm leading-6 text-ink">
        <p>
          A branded PDF version of this run is ready to download. It includes a
          cover page, summary metrics, the full answers from each engine with
          mention highlights, and the citations list.
        </p>
        <p className="mt-2 text-xs text-muted">
          The PDF is generated entirely in your browser. Nothing is uploaded.
        </p>
      </section>
    </div>
  );
}

