"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useConfigStore } from "@/lib/stores/configStore";
import { useHasHydrated } from "@/lib/stores/useHasHydrated";
import Link from "next/link";
import type { EngineName } from "@/lib/engines/types";

const COMPETITOR_PLACEHOLDERS = ["HubSpot", "Pipedrive", "Salesforce"];

const PROMPT_PLACEHOLDERS = [
  "What are the best CRMs for early-stage startups?",
  "Which CRM has the most generous free tier?",
  "Compare HubSpot and Pipedrive for a 10-person sales team.",
];

export function InputForm() {
  const hydrated = useHasHydrated();
  const keys = useConfigStore((s) => s.keys);
  const defaults = useConfigStore((s) => s.defaults);
  const setDefaults = useConfigStore((s) => s.setDefaults);
  const router = useRouter();

  const [brand, setBrand] = useState<string>(defaults.brand ?? "");
  const [competitors, setCompetitors] = useState<string[]>(() => {
    const initial = defaults.competitors ?? [];
    return initial.length > 0 ? initial : [""];
  });
  const [prompts, setPrompts] = useState<string[]>([""]);
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
    const cleanedPrompts = prompts.map((s) => s.trim()).filter(Boolean);
    if (cleanedPrompts.length === 0) {
      setError("At least one prompt is required.");
      return;
    }
    const cleanedCompetitors = competitors
      .map((s) => s.trim())
      .filter(Boolean);
    setDefaults({ brand: brand.trim(), competitors: cleanedCompetitors });
    setSubmitting(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          competitors: cleanedCompetitors,
          prompts: cleanedPrompts,
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          Competitors{" "}
          <span className="text-xs font-normal text-subtle">
            (optional — up to 10)
          </span>
        </legend>
        <p className="text-xs text-subtle">
          We&apos;ll highlight these in the answers and tally mentions per
          engine.
        </p>
        <div className="space-y-2">
          {competitors.map((value, idx) => (
            <CompetitorRow
              key={idx}
              value={value}
              index={idx}
              onChange={(next) =>
                setCompetitors((prev) =>
                  prev.map((v, i) => (i === idx ? next : v))
                )
              }
              onRemove={() =>
                // Brief: always allow remove, even on the lone row — the
                // user can clear back to "no competitors tracked".
                setCompetitors((prev) => prev.filter((_, i) => i !== idx))
              }
            />
          ))}
        </div>
        {competitors.length >= 10 ? (
          <p className="text-xs text-subtle">Max 10 competitors.</p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setCompetitors((prev) => [...prev, ""])
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add another competitor
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          Prompts to test{" "}
          <span className="text-xs font-normal text-subtle">
            ({prompts.length}/10)
          </span>
        </legend>
        <p className="text-xs text-subtle">
          Each prompt runs against every selected engine. More prompts = more
          coverage, more cost.
        </p>
        <div className="space-y-2">
          {prompts.map((value, idx) => (
            <PromptRow
              key={idx}
              value={value}
              index={idx}
              onChange={(next) =>
                setPrompts((prev) =>
                  prev.map((v, i) => (i === idx ? next : v))
                )
              }
              onRemove={() =>
                setPrompts((prev) => prev.filter((_, i) => i !== idx))
              }
            />
          ))}
        </div>
        {prompts.length >= 10 ? (
          <p className="text-xs text-subtle">Max 10 prompts.</p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPrompts((prev) => [...prev, ""])}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add another prompt
          </Button>
        )}
      </fieldset>

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

function PromptRow({
  value,
  index,
  onChange,
  onRemove,
}: {
  value: string;
  index: number;
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  const id = `prompt-${index}`;
  const placeholder =
    PROMPT_PLACEHOLDERS[index % PROMPT_PLACEHOLDERS.length] ??
    "Type a prompt to test…";
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <Textarea
          id={id}
          aria-label={`Prompt ${index + 1}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 4000))}
        />
        <p className="mt-1 text-right text-xs text-subtle">
          {value.length}/4000
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove prompt ${index + 1}`}
        title="Remove prompt"
        className="mt-1 flex h-10 w-10 items-center justify-center rounded text-subtle hover:bg-surface hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function CompetitorRow({
  value,
  index,
  onChange,
  onRemove,
}: {
  value: string;
  index: number;
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  const id = `competitor-${index}`;
  const placeholder =
    COMPETITOR_PLACEHOLDERS[index % COMPETITOR_PLACEHOLDERS.length] ??
    "Competitor";
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        aria-label={`Competitor ${index + 1}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Don't submit the form when the user presses Enter inside a
        // competitor row — they're still mid-list, let them keep typing.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove competitor ${index + 1}`}
        title="Remove competitor"
        className="flex h-10 w-10 items-center justify-center rounded text-subtle hover:bg-surface hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
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
