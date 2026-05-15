"use client";
import type { EngineResult } from "@/lib/engines/types";

/**
 * Per-engine competitor breakdown inside an EngineCard or PDF section.
 * Renders each tracked competitor with a status dot:
 *   • amber dot + "Name ×N" for hits
 *   • muted dot + "Name (not mentioned)" for misses
 * Returns null when no competitors are tracked.
 */
export function CompetitorTallies({
  result,
  competitors,
}: {
  result: EngineResult;
  competitors: string[];
}) {
  if (competitors.length === 0) return null;
  const hits = result.mentions?.competitors ?? {};
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs uppercase tracking-wide text-subtle">
        Competitors in this answer
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {competitors.map((name) => {
          const count = hits[name]?.count ?? 0;
          const mentioned = count > 0;
          return (
            <li key={name} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={
                  mentioned
                    ? "inline-block h-1.5 w-1.5 rounded-full bg-competitor-mention"
                    : "inline-block h-1.5 w-1.5 rounded-full bg-subtle"
                }
              />
              {mentioned ? (
                <span className="font-semibold text-competitor-mention">
                  {name} ×{count}
                </span>
              ) : (
                <span className="text-subtle">
                  {name} (not mentioned)
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
