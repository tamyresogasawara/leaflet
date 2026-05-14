"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useConfigStore } from "@/lib/stores/configStore";
import { useHasHydrated } from "@/lib/stores/useHasHydrated";
import Link from "next/link";
import type { EngineName } from "@/lib/engines/types";

const PROMPT_PLACEHOLDER = "What are the best CRMs for early-stage startups?";

export function InputForm() {
  const hydrated = useHasHydrated();
  const keys = useConfigStore((s) => s.keys);
  const defaults = useConfigStore((s) => s.defaults);
  const setDefaults = useConfigStore((s) => s.setDefaults);
  const router = useRouter();

  const [brand, setBrand] = useState<string>(defaults.brand ?? "");
  const [competitorsRaw, setCompetitorsRaw] = useState<string>(
    (defaults.competitors ?? []).join(", ")
  );
  const [prompt, setPrompt] = useState<string>("");
  const [openaiOn, setOpenaiOn] = useState(true);
  const [anthropicOn, setAnthropicOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fixture mode treats every engine as runnable. Once live mode lands the
  // checks below gate on the corresponding key being present.
  const hasOpenai = hydrated ? Boolean(keys.openai) : false;
  const hasAnthropic = hydrated ? Boolean(keys.anthropic) : false;
  const anyKey = hasOpenai || hasAnthropic;

  // For task #9 (fixture-only) we don't actually need keys, so the run is
  // always enabled. We still render the soft-nudge so the UX work is visible.
  const showAddKeysNudge = hydrated && !anyKey;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const engines: EngineName[] = [];
    if (openaiOn) engines.push("openai");
    if (anthropicOn) engines.push("anthropic");
    if (engines.length === 0) {
      setError("Pick at least one engine.");
      return;
    }
    if (!brand.trim()) {
      setError("Brand is required.");
      return;
    }
    if (!prompt.trim()) {
      setError("Prompt is required.");
      return;
    }
    const competitors = competitorsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setDefaults({ brand: brand.trim(), competitors });
    setSubmitting(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          competitors,
          prompt: prompt.trim(),
          engines,
          keys: {
            openai: keys.openai?.value,
            anthropic: keys.anthropic?.value,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { runId } = (await res.json()) as { runId: string };
      router.push(`/run/${runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Your brand" htmlFor="brand">
        <Input
          id="brand"
          placeholder="Acme Inc."
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Competitors (optional)"
        htmlFor="competitors"
        hint="Comma-separated. We'll highlight these in the answers too."
      >
        <Input
          id="competitors"
          placeholder="HubSpot, Pipedrive, Salesforce"
          value={competitorsRaw}
          onChange={(e) => setCompetitorsRaw(e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Prompt to test"
        htmlFor="prompt"
        hint={`${prompt.length}/4000`}
      >
        <Textarea
          id="prompt"
          placeholder={PROMPT_PLACEHOLDER}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 4000))}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Engines</legend>
        <EngineToggle
          label="ChatGPT"
          checked={openaiOn}
          onChange={setOpenaiOn}
          provider="openai"
          keyPresent={hasOpenai}
        />
        <EngineToggle
          label="Claude"
          checked={anthropicOn}
          onChange={setAnthropicOn}
          provider="anthropic"
          keyPresent={hasAnthropic}
        />
      </fieldset>

      {showAddKeysNudge ? (
        <div className="rounded border border-border bg-surface px-4 py-3 text-sm text-muted">
          You bring the keys. We never see them.{" "}
          <Link href="/settings" className="font-medium text-ink underline">
            Add keys in Settings →
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Starting…" : "Run the test"}
        </Button>
        <p className="text-xs text-subtle">
          Demo runs against recorded fixtures — no live API calls.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-end justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function EngineToggle({
  label,
  checked,
  onChange,
  provider,
  keyPresent,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  provider: "openai" | "anthropic";
  keyPresent: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded border border-border bg-white px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className="font-medium text-ink">{label}</span>
      {!keyPresent ? (
        <span className="ml-auto text-xs text-subtle">
          no {provider === "openai" ? "OpenAI" : "Anthropic"} key set — using
          fixture
        </span>
      ) : (
        <span className="ml-auto text-xs text-success">key saved</span>
      )}
    </label>
  );
}
