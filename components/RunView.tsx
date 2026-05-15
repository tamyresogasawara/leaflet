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
        <p
          className="text-sm text-muted"
          aria-live="polite"
          aria-atomic="true"
        >
          Asking the engines. {state.progress.done}/{state.progress.total}{" "}
          finished. Usually 10–20 seconds per engine.
        </p>
      ) : null}

      {terminal ? (
        <SummaryStrip
          results={state.results}
          brand={inputCache.current?.brand ?? ""}
          competitors={inputCache.current?.competitors ?? []}
          prompts={inputCache.current?.prompts ?? []}
        />
      ) : null}

      <PromptSections
        prompts={inputCache.current?.prompts ?? []}
        results={state.results}
        brand={inputCache.current?.brand ?? ""}
        competitors={inputCache.current?.competitors ?? []}
      />
    </div>
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
  if (prompts.length === 0) {
    // No input cached yet (loading). Render nothing — the parent renders
    // a "Loading…" or in-flight progress line.
    return null;
  }
  return (
    <div className="space-y-8">
      {prompts.map((promptText, idx) => {
        const promptResults = results.filter((r) => r.promptIndex === idx);
        return (
          <section
            key={idx}
            aria-label={`Prompt ${idx + 1}`}
            className="space-y-3"
          >
            <header className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-subtle">
                Prompt {idx + 1} of {prompts.length}
              </span>
            </header>
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
          </section>
        );
      })}
    </div>
  );
}

function SummaryStrip({
  results,
  brand,
  competitors,
  prompts,
}: {
  results: EngineResult[];
  brand: string;
  competitors: string[];
  prompts: string[];
}) {
  const done = results.filter((r) => r.status === "done");
  const totalAnswers = done.length;
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
  const multiPrompt = prompts.length > 1;
  const gridCols = showCompetitorTile
    ? "md:grid-cols-2 lg:grid-cols-4"
    : "md:grid-cols-3";
  return (
    <div className={`grid gap-3 ${gridCols}`}>
      <Tile
        label="Mention rate"
        value={
          multiPrompt
            ? `${mentioned} of ${totalAnswers} answers`
            : `${mentioned} of ${totalAnswers} engines`
        }
        help={
          multiPrompt
            ? `How many of the engine answers across all prompts mentioned ${brand || "your brand"} at least once.`
            : `How many engines mentioned ${brand || "your brand"} at least once.`
        }
      />
      <Tile
        label={multiPrompt ? "Prompts run" : "First position"}
        value={
          multiPrompt
            ? `${prompts.length}`
            : firstPositionSummary(done, brand)
        }
        help={
          multiPrompt
            ? "Total prompts tested in this analysis."
            : "Where your brand first appears in each answer."
        }
      />
      {showCompetitorTile ? (
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
  );
}


function firstPositionSummary(results: EngineResult[], brand: string): string {
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
