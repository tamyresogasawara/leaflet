"use client";
import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { CompetitorTallies } from "@/components/CompetitorTallies";
import { useHasHydrated } from "@/lib/stores/useHasHydrated";
import {
  sortedAnalyses,
  useRunsStore,
  type Analysis,
} from "@/lib/stores/runsStore";

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
};

export function HistoryView() {
  const hydrated = useHasHydrated();
  const analyses = useRunsStore((s) => s.analyses);
  const removeAnalysis = useRunsStore((s) => s.removeAnalysis);
  const list = hydrated ? sortedAnalyses(analyses) : [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: Analysis | null = selectedId
    ? analyses[selectedId] ?? null
    : list[0] ?? null;

  if (!hydrated) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (list.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">
          No runs yet. Your saved tests will appear here — they live in this
          browser only.
        </p>
        <Link
          href="/"
          className="mt-3 inline-block text-sm font-medium text-ink underline"
        >
          Run your first test →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        <h2 className="text-sm font-medium text-muted">History</h2>
        <ul className="space-y-1">
          {list.map((a) => {
            const isActive = (selected?.id ?? null) === a.id;
            return (
              <li key={a.id}>
                <button
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${
                    isActive
                      ? "border-[var(--color-primary)] bg-surface"
                      : "border-border bg-white hover:bg-surface"
                  }`}
                >
                  <p className="line-clamp-1 font-medium text-ink">
                    {a.input.prompts[0] ?? "(no prompt)"}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    {a.input.brand}
                    {a.input.prompts.length > 1
                      ? ` · +${a.input.prompts.length - 1} more prompt${
                          a.input.prompts.length - 1 === 1 ? "" : "s"
                        }`
                      : ""}
                    {" · "}
                    {formatDistanceToNow(new Date(a.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {selected ? (
        <section className="space-y-6">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-subtle">
                Saved run
              </p>
              <h1 className="mt-1 text-xl font-semibold text-ink">
                {selected.input.brand}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {selected.input.prompts.length === 1
                  ? "1 prompt"
                  : `${selected.input.prompts.length} prompts`}{" "}
                ·{" "}
                {new Set(selected.results.map((r) => r.engine)).size} engine
                {new Set(selected.results.map((r) => r.engine)).size === 1
                  ? ""
                  : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/report/${selected.id}`}
                className="inline-flex h-8 items-center rounded bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
              >
                Export PDF
              </Link>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  removeAnalysis(selected.id);
                  setSelectedId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </header>

          <div className="space-y-8">
            {selected.input.prompts.map((promptText, pIdx) => {
              const promptResults = selected.results.filter(
                (r) => r.promptIndex === pIdx
              );
              return (
                <section
                  key={pIdx}
                  aria-label={`Prompt ${pIdx + 1}`}
                  className="space-y-3"
                >
                  <p className="text-xs uppercase tracking-wide text-subtle">
                    Prompt {pIdx + 1} of {selected.input.prompts.length}
                  </p>
                  <p className="rounded-card border border-border bg-surface p-3 font-mono text-sm leading-6 text-ink">
                    {promptText}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {promptResults.map((r) => (
                      <Card key={`${r.engine}-${r.promptIndex}`}>
                        <CardHeader>
                          <span className="text-sm font-semibold text-ink">
                            {ENGINE_LABELS[r.engine] ?? r.engine}
                          </span>
                          {r.ranAt ? (
                            <span className="text-xs text-subtle">
                              {new Date(r.ranAt).toLocaleString()}
                            </span>
                          ) : null}
                        </CardHeader>
                        <CardBody>
                          {r.answerText ? (
                            <SafeMarkdown
                              source={r.answerText}
                              brand={selected.input.brand}
                              competitors={selected.input.competitors}
                            />
                          ) : (
                            <p className="text-sm text-muted">No answer.</p>
                          )}
                          <CompetitorTallies
                            result={r}
                            competitors={selected.input.competitors}
                          />
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted">Pick a run from the left.</p>
      )}
    </div>
  );
}
