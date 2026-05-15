import type { EngineName, EngineResult } from "@/lib/engines/types";

export type RunState = {
  runId: string;
  status: "pending" | "running" | "done" | "error";
  createdAt: string;
  input: { brand: string; competitors: string[]; prompts: string[] };
  engines: EngineName[];
  results: EngineResult[];
};

declare global {
  var __leafletRunMap: Map<string, RunState> | undefined;
}

export const runMap: Map<string, RunState> =
  globalThis.__leafletRunMap ?? new Map<string, RunState>();

if (!globalThis.__leafletRunMap) {
  globalThis.__leafletRunMap = runMap;
}

export function totalCalls(state: RunState): number {
  return state.input.prompts.length * state.engines.length;
}

export function progress(state: RunState): { done: number; total: number } {
  const done = state.results.filter(
    (r) => r.status === "done" || r.status === "error"
  ).length;
  return { done, total: totalCalls(state) };
}
