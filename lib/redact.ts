// Brief: replace any sk-[A-Za-z0-9_-]+ / sk-ant-[A-Za-z0-9_-]+ substring.
// No length floor — even short fragments are noise we don't want in logs.
const KEY_PATTERN = /\bsk-(?:ant-)?[A-Za-z0-9_-]+/g;
const SENSITIVE_FIELDS = /^(?:keys|authorization|x-api-key|api[-_]?key)$/i;

/**
 * Recursively scrubs API keys from a JSON-serializable payload.
 * Defense in depth:
 *  1. Any object property named `keys` (case-insensitive) → "[REDACTED]".
 *  2. Any property named `authorization`, `x-api-key`, `api_key`, `api-key`
 *     (case-insensitive) → "[REDACTED]". Covers HTTP header maps Sentry
 *     collects by default and any structured-logger field renamed from them.
 *  3. Any string value matching sk-* / sk-ant-* → fragment replaced.
 *
 * Used by Sentry beforeSend and the server request logger. Plan.md §4
 * + .claude/agents/security.md require this as a non-negotiable BYOK control.
 *
 * Accepts unknown input so callers can pass arbitrary log payloads without
 * a cast; non-JSON values (functions, symbols, undefined leaves) pass through.
 */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

/**
 * For string-only call sites (e.g. an Error.message before structured logging).
 * Strips key fragments without trying to parse JSON.
 */
export function redactString(s: string): string {
  return scrubString(s);
}

/**
 * For payloads that have already been JSON.stringify'd before reaching the
 * logger. Parses, redacts the object, re-stringifies. If parsing fails,
 * falls back to string-level scrubbing so we never lose the redactor.
 */
export function redactJsonString(s: string): string {
  try {
    return JSON.stringify(redact(JSON.parse(s)));
  } catch {
    return scrubString(s);
  }
}

function scrubString(s: string): string {
  return s.replace(KEY_PATTERN, "sk-***REDACTED***");
}
