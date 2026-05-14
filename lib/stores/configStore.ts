"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { maskKey } from "@/lib/mask";

type StoredKey = { value: string; mask: string };

type State = {
  keys: {
    openai?: StoredKey;
    anthropic?: StoredKey;
  };
  defaults: {
    brand?: string;
    competitors?: string[];
  };
};

type Actions = {
  setKey: (provider: "openai" | "anthropic", value: string) => void;
  removeKey: (provider: "openai" | "anthropic") => void;
  clearAllKeys: () => void;
  setDefaults: (d: Partial<State["defaults"]>) => void;
};

export const useConfigStore = create<State & Actions>()(
  persist(
    (set) => ({
      keys: {},
      defaults: {},
      setKey: (provider, value) =>
        set((s) => ({
          keys: {
            ...s.keys,
            [provider]: { value, mask: maskKey(value) },
          },
        })),
      removeKey: (provider) =>
        set((s) => {
          const next = { ...s.keys };
          delete next[provider];
          return { keys: next };
        }),
      clearAllKeys: () => set({ keys: {} }),
      setDefaults: (d) => set((s) => ({ defaults: { ...s.defaults, ...d } })),
    }),
    {
      name: "leaflet.userConfig",
      version: 1,
    }
  )
);
