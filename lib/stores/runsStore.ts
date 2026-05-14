"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EngineResult } from "@/lib/engines/types";

export type Analysis = {
  id: string;
  createdAt: string;
  input: { brand: string; competitors: string[]; prompt: string };
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
      version: 1,
    }
  )
);

export function sortedAnalyses(map: Record<string, Analysis>): Analysis[] {
  return Object.values(map).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
