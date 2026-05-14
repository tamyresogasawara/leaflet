"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useConfigStore } from "@/lib/stores/configStore";
import { useHasHydrated } from "@/lib/stores/useHasHydrated";

export function SettingsView({
  engineMode = "fixture",
}: {
  engineMode?: "fixture" | "live";
}) {
  const hydrated = useHasHydrated();
  const keys = useConfigStore((s) => s.keys);
  const clearAllKeys = useConfigStore((s) => s.clearAllKeys);

  if (!hydrated) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Your API keys.
        </h1>
        <p className="mt-2 text-sm text-muted">
          Keys you paste here are stored in this browser&apos;s{" "}
          <code className="font-mono text-xs">localStorage</code> and only sent
          to OpenAI or Anthropic to run your tests. They never touch our
          servers beyond a stateless proxy.
        </p>
      </div>

      {engineMode === "fixture" ? (
        <div
          role="note"
          className="rounded border border-warning/40 bg-[#FFFBEB] px-4 py-3 text-xs text-ink"
        >
          <strong>Fixture mode.</strong> The app is running against recorded
          responses, so your saved keys aren&apos;t being forwarded to OpenAI
          or Anthropic yet. The format check below still applies — keys will be
          used the moment the live engine adapter is enabled.
        </div>
      ) : null}

      <KeyField
        provider="openai"
        label="OpenAI API key"
        helpUrl="https://platform.openai.com/api-keys"
        placeholder="sk-..."
        saved={keys.openai}
      />
      <KeyField
        provider="anthropic"
        label="Anthropic API key"
        helpUrl="https://console.anthropic.com/settings/keys"
        placeholder="sk-ant-..."
        saved={keys.anthropic}
      />

      <div className="border-t border-border pt-4">
        <ConfirmButton
          confirmText="Remove both keys from this browser?"
          onConfirm={clearAllKeys}
        >
          Clear all keys
        </ConfirmButton>
      </div>
    </div>
  );
}

type StoredKey = { value: string; mask: string };

function KeyField({
  provider,
  label,
  helpUrl,
  placeholder,
  saved,
}: {
  provider: "openai" | "anthropic";
  label: string;
  helpUrl: string;
  placeholder: string;
  saved: StoredKey | undefined;
}) {
  const setKey = useConfigStore((s) => s.setKey);
  const removeKey = useConfigStore((s) => s.removeKey);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(!saved);
  const [testState, setTestState] = useState<{
    status: "idle" | "running" | "ok" | "fail";
    message?: string;
  }>({ status: "idle" });
  const [formatError, setFormatError] = useState<string | null>(null);

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setFormatError("Paste a key first.");
      return;
    }
    const re =
      provider === "openai"
        ? /^sk-[A-Za-z0-9_-]{20,}$/
        : /^sk-ant-[A-Za-z0-9_-]{20,}$/;
    if (!re.test(trimmed)) {
      setFormatError(
        provider === "openai"
          ? 'OpenAI keys start with "sk-" and are at least 20 characters long.'
          : 'Anthropic keys start with "sk-ant-" and are at least 20 characters long.'
      );
      return;
    }
    setFormatError(null);
    setKey(provider, trimmed);
    setValue("");
    setEditing(false);
    setTestState({ status: "idle" });
  }

  async function handleTest() {
    const probe = editing ? value.trim() : saved?.value;
    if (!probe) return;
    setTestState({ status: "running" });
    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, key: probe }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: "auth" | "rate_limit" | "network";
      };
      setTestState(
        data.ok
          ? { status: "ok" }
          : { status: "fail", message: describeError(data.error) }
      );
    } catch {
      setTestState({ status: "fail", message: describeError("network") });
    }
  }

  function describeError(
    code: "auth" | "rate_limit" | "network" | undefined
  ): string {
    switch (code) {
      case "auth":
        return "Key was rejected. Double-check it in Settings.";
      case "rate_limit":
        return "Provider rate-limited the probe. Wait a minute and try again.";
      default:
        return "Couldn't reach the provider. Check your connection and try again.";
    }
  }

  return (
    <section className="space-y-2 rounded-card border border-border bg-white p-4">
      <div className="flex items-end justify-between">
        <label
          htmlFor={`key-${provider}`}
          className="text-sm font-medium text-ink"
        >
          {label}
        </label>
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted underline"
        >
          Get a key →
        </a>
      </div>

      {editing ? (
        <Input
          id={`key-${provider}`}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="font-mono"
        />
      ) : (
        <div className="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2 font-mono text-sm text-ink">
          <span aria-label="masked key">{saved?.mask ?? "—"}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
            saved
          </span>
        </div>
      )}

      {formatError ? (
        <p className="text-xs text-error">{formatError}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={!value.trim()}>
              Save key
            </Button>
            {saved ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setValue("");
                  setEditing(false);
                  setFormatError(null);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setValue("");
                setEditing(true);
              }}
            >
              Replace key
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                removeKey(provider);
                setTestState({ status: "idle" });
                setEditing(true);
              }}
            >
              Remove
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleTest}
          disabled={testState.status === "running"}
        >
          {testState.status === "running" ? "Testing…" : "Test connection"}
        </Button>
        {testState.status === "ok" ? (
          <span className="text-xs text-success">Looks valid.</span>
        ) : null}
        {testState.status === "fail" ? (
          <span className="text-xs text-error">{testState.message}</span>
        ) : null}
      </div>

      <p className="text-xs text-subtle">
        Optional — set one or both. You can run tests with just one provider.
      </p>
    </section>
  );
}

function ConfirmButton({
  confirmText,
  onConfirm,
  children,
}: {
  confirmText: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="destructive" onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink">{confirmText}</span>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        Yes, remove
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </div>
  );
}
