"use client";
import { useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { CompetitorTallies } from "@/components/CompetitorTallies";
import { useHasHydrated } from "@/lib/stores/useHasHydrated";
import { useRunsStore } from "@/lib/stores/runsStore";
import { brand } from "@/brand.config";
import { t } from "@/lib/strings";
import type { EngineResult } from "@/lib/engines/types";

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
};

export function ReportView({ runId }: { runId: string }) {
  const hydrated = useHasHydrated();
  const analyses = useRunsStore((s) => s.analyses);
  const analysis = hydrated ? analyses[runId] : null;

  // Browser tab title becomes the default filename hint in the print dialog.
  useEffect(() => {
    if (analysis) {
      const slug = analysis.input.brand
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      document.title = `${t("appName").toLowerCase()}-${slug}-${analysis.id.slice(0, 8)}`;
    }
    return () => {
      document.title = t("appName");
    };
  }, [analysis]);

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

  const done = analysis.results.filter((r) => r.status === "done");
  const mentioned = done.filter((r) => r.mentions?.brand.mentioned).length;
  const totalCitations = done.reduce(
    (acc, r) => acc + (r.citations?.length ?? 0),
    0
  );
  const totalTracked = analysis.input.competitors.length;
  const competitorsMentioned = totalTracked
    ? analysis.input.competitors.filter((name) =>
        done.some((r) => (r.mentions?.competitors?.[name]?.count ?? 0) > 0)
      ).length
    : 0;
  const createdAt = format(new Date(analysis.createdAt), "PPpp");
  const prompts = analysis.input.prompts;
  const multiPrompt = prompts.length > 1;

  return (
    <article className="report mx-auto max-w-3xl space-y-8">
      {/* Print-and-save action bar — hidden when printing. */}
      <div className="report-actions flex items-center justify-between gap-2 print:hidden">
        <Link href="/history" className="text-sm text-muted hover:underline">
          ← Back to history
        </Link>
        <Button
          variant="primary"
          onClick={() => window.print()}
          aria-label="Open the print dialog to save as PDF"
        >
          Save as PDF
        </Button>
      </div>

      {/* Cover */}
      <header className="report-cover space-y-3 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span
            aria-hidden
            className="inline-block h-5 w-5 rounded"
            style={{ background: brand.primaryHex }}
          />
          {t("appName")}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          AI visibility report
        </h1>
        <p className="text-lg text-muted">{analysis.input.brand}</p>
        <p className="text-xs text-subtle">
          Generated {createdAt} ·{" "}
          {prompts.length === 1 ? "1 prompt" : `${prompts.length} prompts`}
        </p>
        {!multiPrompt ? (
          <p className="text-sm italic text-muted">
            &ldquo;{prompts[0]}&rdquo;
          </p>
        ) : null}
      </header>

      {/* Summary */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Summary
        </h2>
        <div
          className={
            totalTracked > 0
              ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-2"
              : "grid gap-3 sm:grid-cols-3 print:grid-cols-3"
          }
        >
          <Tile
            label="Mention rate"
            value={
              multiPrompt
                ? `${mentioned} of ${done.length} answers`
                : `${mentioned} of ${done.length} engines`
            }
            help={
              multiPrompt
                ? "How many of the engine answers across all prompts mentioned your brand at least once."
                : "How many engines mentioned your brand at least once."
            }
          />
          <Tile
            label={multiPrompt ? "Prompts run" : "First position"}
            value={
              multiPrompt ? `${prompts.length}` : firstPositionSummary(done)
            }
            help={
              multiPrompt
                ? "Total prompts tested in this analysis."
                : "Where your brand first appears in the answer text."
            }
          />
          {totalTracked > 0 ? (
            <Tile
              label="Competitors mentioned"
              value={`${competitorsMentioned} of ${totalTracked} across answers`}
              help="How many of your tracked competitors appeared in at least one answer."
            />
          ) : null}
          <Tile
            label="Citations found"
            value={String(totalCitations)}
            help="Distinct sources the engines linked to."
          />
        </div>
      </section>

      {/* Per-prompt answers */}
      <section className="space-y-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Answers
        </h2>
        {prompts.map((promptText, pIdx) => {
          const promptResults = analysis.results.filter(
            (r) => r.promptIndex === pIdx
          );
          return (
            <section
              key={pIdx}
              aria-label={`Prompt ${pIdx + 1}`}
              className="space-y-3 print:break-inside-avoid-page"
            >
              <header>
                <p className="text-xs uppercase tracking-wide text-subtle">
                  Prompt {pIdx + 1} of {prompts.length}
                </p>
                <p className="mt-1 rounded-card border border-border bg-surface p-3 font-mono text-sm leading-6 text-ink">
                  {promptText}
                </p>
              </header>
              <div className="space-y-4">
                {promptResults.map((r) => (
                  <EngineSection
                    key={`${r.engine}-${r.promptIndex}`}
                    result={r}
                    brand={analysis.input.brand}
                    competitors={analysis.input.competitors}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      <footer className="report-footer border-t border-border pt-4 text-xs text-subtle">
        {brand.pdfFooter}
      </footer>
    </article>
  );
}

function firstPositionSummary(results: EngineResult[]): string {
  if (results.length === 0) return "—";
  return results
    .map((r) => {
      const label = ENGINE_LABELS[r.engine] ?? r.engine;
      const fi = r.mentions?.brand.firstIndex;
      if (fi == null) return `not in ${label}`;
      return `${label}: chr ${fi}`;
    })
    .join(" · ");
}

function Tile({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-4 print:break-inside-avoid">
      <p className="text-[10px] uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-base font-semibold text-ink">{value}</p>
      <p className="mt-2 text-xs text-muted">{help}</p>
    </div>
  );
}

function EngineSection({
  result,
  brand: brandName,
  competitors,
}: {
  result: EngineResult;
  brand: string;
  competitors: string[];
}) {
  const label = ENGINE_LABELS[result.engine] ?? result.engine;
  return (
    <section className="rounded-card border border-border bg-white p-5 print:break-inside-avoid">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">{label}</h3>
        {result.ranAt ? (
          <span className="text-xs text-subtle">
            {format(new Date(result.ranAt), "PPpp")}
          </span>
        ) : null}
      </header>
      {result.status === "error" ? (
        <p className="text-sm text-error">
          {result.error?.message ?? "Engine failed."}
        </p>
      ) : result.answerText ? (
        <SafeMarkdown
          source={result.answerText}
          brand={brandName}
          competitors={competitors}
        />
      ) : (
        <p className="text-sm text-muted">No answer.</p>
      )}
      <CompetitorTallies result={result} competitors={competitors} />
      {result.citations && result.citations.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs uppercase tracking-wide text-subtle">
            Citations ({result.citations.length})
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {result.citations.map((c, i) => (
              <li key={i}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline"
                >
                  {c.title ?? c.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
