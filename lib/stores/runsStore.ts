"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EngineResult } from "@/lib/engines/types";

export type Analysis = {
  id: string;
  createdAt: string;
  input: { brand: string; competitors: string[]; prompts: string[] };
  results: EngineResult[];
};

type State = {
  analyses: Record<string, Analysis>;
};

type Actions = {
  saveAnalysis: (a: Analysis) => void;
  removeAnalysis: (id: string) => void;
};

const HARD_CAP = 20;

// v1 → v2 schema migration. v1 saved analyses had a single `prompt: string`;
// v2 supports `prompts: string[]` and denormalizes the prompt text onto
// each result. Migration: wrap the existing prompt into a single-element
// array and stamp every existing result with `promptIndex: 0` plus the
// same prompt string so the result is renderable standalone.
type AnalysisV1 = {
  id: string;
  createdAt: string;
  input: { brand: string; competitors: string[]; prompt: string };
  results: Array<Omit<EngineResult, "promptIndex" | "prompt">>;
};

type StateV1 = { analyses: Record<string, AnalysisV1> };
type PersistedState = State | StateV1;

/**
 * Exported for unit testing. Pure function: takes a v1 persisted state,
 * returns the v2 equivalent. No side effects.
 */
export function migrateV1ToV2(state: StateV1): State {
  const out: Record<string, Analysis> = {};
  for (const [id, a] of Object.entries(state.analyses ?? {})) {
    out[id] = {
      id: a.id,
      createdAt: a.createdAt,
      input: {
        brand: a.input.brand,
        competitors: a.input.competitors,
        prompts: [a.input.prompt],
      },
      results: a.results.map((r) => ({
        ...r,
        promptIndex: 0,
        prompt: a.input.prompt,
      })),
    };
  }
  return { analyses: out };
}

export const useRunsStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      analyses: {},
      saveAnalysis: (a) => {
        const next = { ...get().analyses, [a.id]: a };
        const entries = Object.values(next).sort((x, y) =>
          y.createdAt.localeCompare(x.createdAt)
        );
        const trimmed = entries.slice(0, HARD_CAP);
        const map: Record<string, Analysis> = {};
        for (const it of trimmed) map[it.id] = it;
        set({ analyses: map });
      },
      removeAnalysis: (id) =>
        set((s) => {
          const next = { ...s.analyses };
          delete next[id];
          return { analyses: next };
        }),
    }),
    {
      name: "leaflet.runs",
      version: 2,
      migrate: (persistedState, version) => {
        if (version < 2) {
          return {
            ...migrateV1ToV2(persistedState as StateV1),
          } as PersistedState;
        }
        return persistedState as PersistedState;
      },
    }
  )
);

export function sortedAnalyses(map: Record<string, Analysis>): Analysis[] {
  return Object.values(map).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
