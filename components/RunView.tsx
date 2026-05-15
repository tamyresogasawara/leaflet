"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { CompetitorTallies } from "@/components/CompetitorTallies";
import { computeCompetitorTotals } from "@/lib/detect";
import { useRunsStore } from "@/lib/stores/runsStore";
import type { EngineResult } from "@/lib/engines/types";

type RunStatus = {
  runId: string;
  status: "pending" | "running" | "done" | "error";
  progress: { done: number; total: number };
  results: EngineResult[];
  input?: { brand: string; competitors: string[]; prompts: string[] };
};

type CachedInput = {
  brand: string;
  competitors: string[];
  prompts: string[];
};

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
};

export function RunView({ runId }: { runId: string }) {
  const [state, setState] = useState<RunStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputCache = useRef<CachedInput | null>(null);
  const saveAnalysis = useRunsStore((s) => s.saveAnalysis);
  const analyses = useRunsStore((s) => s.analyses);

  useEffect(() => {
    const existing = analyses[runId];
    if (existing) {
      inputCache.current = existing.input;
      setState({
        runId,
        status: "done",
        progress: { done: existing.results.length, total: existing.results.length },
        results: existing.results,
        input: existing.input,
      });
      setSaved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    if (saved) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const res = await fetch(`/api/analyze/${runId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("This run isn't available anymore. Start a new one.");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as RunStatus;
        if (cancelled) return;
        setState(data);
        if (data.status === "done" || data.status === "error") {
          return;
        }
        timer = setTimeout(tick, 1500);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Polling failed.");
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, saved]);

  // We have to derive the input from the server response. The server doesn't
  // currently echo input, so cache it client-side on first arrival.
  useEffect(() => {
    if (!state) return;
    if (state.input) inputCache.current = state.input;
  }, [state]);

  function handleSave() {
    if (!state || saved) return;
    if (!inputCache.current) return;
    saveAnalysis({
      id: state.runId,
      createdAt: new Date().toISOString(),
      input: inputCache.current,
      results: state.results,
    });
    setSaved(true);
  }


  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">{error}</p>
        <Link href="/" className="text-sm font-medium text-ink underline">
          ← Start a new run
        </Link>
      </div>
    );
  }

  if (!state) {
    return (
      <p className="text-sm text-muted" aria-live="polite">
        Loading…
      </p>
    );
  }

  const terminal = state.status === "done" || state.status === "error";

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-subtle">Run</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {terminal ? "Results" : "Running…"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {terminal ? (
            <>
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={saved || !inputCache.current}
              >
                {saved ? "Saved to history" : "Save to history"}
              </Button>
              {saved ? (
                <Link
                  href={`/report/${state.runId}`}
                  className="inline-flex h-10 items-center justify-center rounded bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                >
                  Export PDF
                </Link>
              ) : (
                <Button
                  variant="primary"
                  disabled
                  title="Save to history first to export."
                >
                  Export PDF
                </Button>
              )}
            </>
          ) : null}
          <Link href="/" className="text-sm text-muted hover:underline">
            Start over
          </Link>
        </div>
      </header>

      {terminal && !saved && inputCache.current ? (
        <p className="text-xs text-subtle">
          Save to history first to export.
        </p>
      ) : null}

      {!terminal ? (
        <div className="space-y-3" aria-live="polite" aria-atomic="true">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted">
              Asking the engines. {state.progress.done}/
              {state.progress.total} combinations finished.
            </p>
            <div className="h-1.5 flex-1 max-w-xs overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{
                  width: `${
                    state.progress.total === 0
                      ? 0
                      : Math.round(
                          (state.progress.done / state.progress.total) * 100
                        )
                  }%`,
                }}
              />
            </div>
          </div>
          <LoadingGrid
            prompts={inputCache.current?.prompts ?? []}
            results={state.results}
          />
        </div>
      ) : null}

      {terminal ? (
        <SummaryStrip
          results={state.results}
          brand={inputCache.current?.brand ?? ""}
          competitors={inputCache.current?.competitors ?? []}
          prompts={inputCache.current?.prompts ?? []}
          engines={new Set(state.results.map((r) => r.engine)).size || 1}
        />
      ) : null}

      {terminal ? (
        <PromptSections
          prompts={inputCache.current?.prompts ?? []}
          results={state.results}
          brand={inputCache.current?.brand ?? ""}
          competitors={inputCache.current?.competitors ?? []}
        />
      ) : null}
    </div>
  );
}

function LoadingGrid({
  prompts,
  results,
}: {
  prompts: string[];
  results: EngineResult[];
}) {
  if (prompts.length === 0) return null;
  const engineSet = Array.from(new Set(results.map((r) => r.engine)));
  return (
    <ul className="space-y-1 text-xs">
      {prompts.map((promptText, idx) => {
        const promptResults = results.filter((r) => r.promptIndex === idx);
        return (
          <li
            key={idx}
            className="flex items-center gap-3 rounded border border-border bg-white px-3 py-2"
          >
            <span className="w-20 shrink-0 text-subtle">
              Prompt {idx + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">
              {promptText.slice(0, 80)}
              {promptText.length > 80 ? "…" : ""}
            </span>
            <span className="flex gap-1.5">
              {engineSet.map((eng) => {
                const r = promptResults.find((x) => x.engine === eng);
                const status = r?.status ?? "running";
                const label = ENGINE_LABELS[eng] ?? eng;
                const cls =
                  status === "done"
                    ? "bg-[#DCFCE7] text-success"
                    : status === "error"
                      ? "bg-[#FEE2E2] text-error"
                      : "bg-surface text-muted";
                return (
                  <span
                    key={eng}
                    className={`rounded-full px-2 py-0.5 ${cls}`}
                    aria-label={`${label}: ${status}`}
                  >
                    {label}
                  </span>
                );
              })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PromptSections({
  prompts,
  results,
  brand,
  competitors,
}: {
  prompts: string[];
  results: EngineResult[];
  brand: string;
  competitors: string[];
}) {
  // Track open/closed by prompt index. Default: only the first prompt open.
  // We seed via an init callback so the keys are stable across renders.
  const [openIdx, setOpenIdx] = useState<Set<number>>(
    () => new Set([0])
  );
  if (prompts.length === 0) return null;
  const allOpen = openIdx.size === prompts.length;
  const expandAll = () =>
    setOpenIdx(new Set(prompts.map((_, i) => i)));
  const collapseAll = () => setOpenIdx(new Set());
  return (
    <div className="space-y-4">
      {prompts.length > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={allOpen ? collapseAll : expandAll}
            className="text-muted hover:text-ink hover:underline"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      ) : null}
      <div className="space-y-4">
        {prompts.map((promptText, idx) => {
          const promptResults = results.filter((r) => r.promptIndex === idx);
          const doneForPrompt = promptResults.filter(
            (r) => r.status === "done"
          );
          const mentionedForPrompt = doneForPrompt.filter(
            (r) => r.mentions?.brand.mentioned
          ).length;
          const isOpen = openIdx.has(idx);
          const miniSummary =
            doneForPrompt.length === 0
              ? "Pending"
              : mentionedForPrompt === 0
                ? "Not mentioned"
                : `Mentioned in ${mentionedForPrompt} of ${doneForPrompt.length} engine${doneForPrompt.length === 1 ? "" : "s"}`;
          return (
            <section
              key={idx}
              aria-label={`Prompt ${idx + 1}`}
              className="rounded-card border border-border bg-white"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenIdx((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                  })
                }
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface"
              >
                <span
                  aria-hidden
                  className={`mt-1 inline-block h-3 w-3 text-subtle transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                >
                  ▸
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-subtle">
                    Prompt {idx + 1} of {prompts.length}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink">
                    {promptText.slice(0, 80)}
                    {promptText.length > 80 ? "…" : ""}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                    mentionedForPrompt > 0
                      ? "bg-[#DCFCE7] text-success"
                      : doneForPrompt.length === 0
                        ? "bg-surface text-muted"
                        : "bg-surface text-muted"
                  }`}
                >
                  {miniSummary}
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  <p className="rounded-card border border-border bg-surface p-3 font-mono text-sm leading-6 text-ink">
                    {promptText}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {promptResults.map((r) => (
                      <EngineCard
                        key={`${r.engine}-${r.promptIndex}`}
                        result={r}
                        brand={brand}
                        competitors={competitors}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStrip({
  results,
  brand,
  competitors,
  prompts,
  engines,
}: {
  results: EngineResult[];
  brand: string;
  competitors: string[];
  prompts: string[];
  engines: number;
}) {
  const done = results.filter((r) => r.status === "done");
  const mentioned = done.filter((r) => r.mentions?.brand.mentioned).length;
  const totalCitations = done.reduce(
    (acc, r) => acc + (r.citations?.length ?? 0),
    0
  );
  const totalTracked = competitors.length;
  const showCompetitorTile = totalTracked > 0;
  // Competitors with ≥1 hit anywhere in this analysis.
  const competitorsMentioned = showCompetitorTile
    ? competitors.filter((name) =>
        done.some((r) => (r.mentions?.competitors?.[name]?.count ?? 0) > 0)
      ).length
    : 0;
  const totalCalls = prompts.length * engines;
  const gridCols = showCompetitorTile
    ? "md:grid-cols-2 lg:grid-cols-4"
    : "md:grid-cols-3";
  return (
    <div className={`grid gap-3 ${gridCols}`}>
      <Tile
        label="Brand mention rate"
        value={`${mentioned} of ${totalCalls}`}
        help={`How many (prompt × engine) answers mentioned ${brand || "your brand"} at least once.`}
      />
      {showCompetitorTile ? (
        <Tile
          label="Competitors mentioned"
          value={`${competitorsMentioned} of ${totalTracked}`}
          help="How many tracked competitors appeared in at least one answer."
        />
      ) : null}
      <Tile
        label="Citations found"
        value={String(totalCitations)}
        help="Distinct sources the engines linked to."
      />
      <Tile
        label="Calls"
        value={`${prompts.length} prompts × ${engines} engines = ${totalCalls}`}
        help="Total fan-out for this run."
      />
    </div>
  );
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
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-subtle">{label}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
        <p className="mt-2 text-xs text-muted">{help}</p>
      </CardBody>
    </Card>
  );
}

function EngineCard({
  result,
  brand,
  competitors,
}: {
  result: EngineResult;
  brand: string;
  competitors: string[];
}) {
  const label = ENGINE_LABELS[result.engine] ?? result.engine;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <StatusPill status={result.status} />
        </div>
        {result.ranAt ? (
          <span className="text-xs text-subtle">
            {new Date(result.ranAt).toLocaleTimeString()}
          </span>
        ) : null}
      </CardHeader>
      <CardBody>
        {result.status === "running" ? (
          <p className="text-sm text-muted">Querying…</p>
        ) : null}
        {result.status === "error" ? (
          <p className="text-sm text-error">
            {result.error?.message ?? "Engine failed."}
          </p>
        ) : null}
        {result.status === "done" && result.answerText ? (
          <>
            <SafeMarkdown
              source={result.answerText}
              brand={brand}
              competitors={competitors}
            />
            <CompetitorTallies result={result} competitors={competitors} />
            {result.citations && result.citations.length > 0 ? (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium text-ink">
                  Citations ({result.citations.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {result.citations.map((c, i) => (
                    <li key={i}>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {c.title ?? c.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function StatusPill({ status }: { status: EngineResult["status"] }) {
  const map = {
    running: { bg: "bg-surface", fg: "text-muted", text: "Running" },
    done: { bg: "bg-[#DCFCE7]", fg: "text-success", text: "Done" },
    error: { bg: "bg-[#FEE2E2]", fg: "text-error", text: "Error" },
  } as const;
  const v = map[status];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs ${v.bg} ${v.fg}`}
    >
      {v.text}
    </span>
  );
}
