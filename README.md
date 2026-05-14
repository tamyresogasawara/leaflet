# Leaflet

An open-source, white-label, **bring-your-own-key** tool that shows you how AI answers describe your brand. Send a prompt to ChatGPT and Claude in parallel, see where you and your competitors get mentioned, export the result as a PDF.

> **Status:** v0 prototype. Single-engine and BYOK paths work end-to-end. Citations, multi-country, sentiment, and recommendations are v1 work.

## Why

Tools like Profound, Otterly, and Peec answer "is my brand showing up in LLM answers?" — but they're SaaS, the operator pays for every model call, and you can't self-host. Leaflet flips that:

- **Open source.** Fork it, brand it, run it.
- **BYOK.** You provide your own OpenAI and Anthropic keys. The app holds them in your browser's `localStorage` and forwards them per request to the LLM via a stateless proxy. They never touch our servers.
- **White-label.** One typed config file (`brand.config.ts`) controls the app name, logo, primary color, and PDF footer. Microcopy is routed through a `t()` lookup so a rebrand is a single edit.

## Quick start

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The default `ENGINE_MODE` is `fixture` — the app runs end-to-end against recorded responses, no API calls. To exercise real models, copy `.env.example` to `.env.local` and set:

```bash
ENGINE_MODE=live
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Or leave the env keys blank and paste them into the in-app Settings page — that's the BYOK path the hosted demo uses.

## Scripts

| | |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest unit tests (detector + redactor + PDF document) |
| `pnpm typecheck` | `tsc --noEmit` |

## How it works

```
┌──────────────────────────┐         ┌────────────────────────────┐         ┌──────────────────┐
│  Browser                  │ POST    │  Next.js Route Handlers     │ HTTPS   │  OpenAI          │
│  ─ Settings / Input /     │ keys in │  ─ /api/analyze             │ ──────► │  Anthropic       │
│    Results / History /    │   body  │  ─ /api/analyze/[runId]     │         │                  │
│    Report                 │ ───────►│  ─ /api/test-key            │         │  (CORS blocks    │
│  ─ zustand + persist      │         │  ─ key resolver, redactor,  │         │   browser-direct │
│  ─ react-pdf on /report   │ ◄────── │    rate limiter, fixture/   │         │   calls; the     │
│  ─ localStorage:          │ runId   │    live engine switch       │         │   proxy is       │
│    `leaflet.userConfig`,  │         │  ─ in-process Map (runMap)  │         │   mandatory)     │
│    `leaflet.runs`         │         │                              │         │                  │
└──────────────────────────┘         └────────────────────────────┘         └──────────────────┘
```

- **`POST /api/analyze`** spawns a run and fans out to OpenAI + Anthropic in parallel. Returns a `runId` immediately (202).
- **`GET /api/analyze/[runId]`** is polled every 1.5 s until status is `done` or `error`. Each engine card fills in independently as its provider responds.
- **`POST /api/test-key`** does a 1-token / `models.list()` probe to validate a key. OpenAI probe is free; Anthropic probe costs ≈ $0.000003 per call.
- **Brand mention detection** is deterministic regex (`lib/detect.ts`) — no LLM-as-parser in v0, no token cost.
- **PDF export** uses `@react-pdf/renderer` and is dynamic-imported on `/report/[runId]` so it doesn't bloat the home bundle.

## Deployment modes

The app has two modes, controlled by `NEXT_PUBLIC_DEPLOYMENT_MODE`:

- **`selfhost`** (default). Keys come from `process.env`. Rate limiter is off. No demo banner.
- **`demo`**. Hosted public demo. Keys must come from the request body (the browser); env-key fallback is still honored. A demo banner is rendered. Rate limiter is on (20 req/min/IP, 500/day/IP) — requires Upstash Redis credentials.

Same code path in both — the only difference is whether env keys are set on the deploy and whether the rate limiter is wired.

## White-label

Edit `brand.config.ts` at the repo root. Tokens you can override without touching component code:

```ts
{
  appName: "Leaflet",
  logoSrc: "/logo.svg",
  logoMonoSrc: "/logo-mono.svg",
  faviconSrc: "/favicon.svg",
  primaryHex: "#4F46E5",
  primaryHoverHex: "#4338CA",
  accentHex: "#047857",
  pdfFooter: "Generated with Leaflet",
  repoUrl: "https://github.com/your-org/leaflet",
  deploymentMode: "selfhost",
}
```

The Tailwind theme reads `primaryHex` / `accentHex` via CSS custom properties so utility classes pick up the swap. All microcopy goes through `lib/strings.ts` `t()` — there are no hardcoded `"Leaflet"` literals in component code.

## Security model

- **API keys live in the user's browser** (`localStorage`, `useUserConfigStore` zustand slice). The server is a stateless mailman: it receives a key per request, forwards to the LLM, and discards. Keys are never persisted server-side.
- **Logging redactor** (`lib/redact.ts`) strips `Authorization`, `x-api-key`, `api_key`, and any `sk-` / `sk-ant-` substring from logged objects, strings, and JSON payloads. Wired ready for Sentry's `beforeSend`.
- **Strict CSP** is on the roadmap (`next.config.ts` currently ships baseline headers — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Nonce-based CSP with HMR support is a follow-up.
- **No third-party scripts in production**: Inter is self-hosted via `next/font`, no analytics, no tag managers. XSS = credential disclosure under BYOK, so the script surface stays small.
- **Per-engine zod schema** caps key length at 200 chars and rejects malformed strings with a generic "malformed key" message (no info leak about which prefix is "right").

If you find a vulnerability, please open an issue.

## Tech

- **Next.js 15** (App Router, React 19) — single deployment, server route handlers proxy LLM calls.
- **Tailwind v3** + **shadcn/ui** + **Inter** (self-hosted).
- **zustand** with `persist` middleware — two slices (`leaflet.userConfig`, `leaflet.runs`) so clearing keys doesn't nuke history.
- **OpenAI SDK** + **Anthropic SDK** — per-request client instantiation, 30 s AbortController timeout.
- **react-markdown** + **rehype-sanitize** — safe answer rendering with a strict tag/protocol allowlist.
- **@react-pdf/renderer** — branded PDF export, dynamic-imported on the report route.
- **Vitest** + **@vitejs/plugin-react** for unit tests.

## Project structure

```
app/
  api/
    analyze/         POST + GET [runId]
    test-key/        POST
  page.tsx           Input
  run/[runId]/       Loading + Results
  history/           Past runs
  settings/          BYOK key management
  report/[runId]/    PDF export route
components/          UI + screens + PDF client
lib/
  engines/           EngineClient interface, OpenAI/Anthropic/Fixture impls
  detect.ts          deterministic brand/competitor matcher
  redact.ts          key-scrubbing redactor
  ratelimit.ts       Upstash sliding window (demo mode only)
  keys.ts            universal-precedence key resolver
  pdf/               @react-pdf document
  stores/            zustand stores
brand.config.ts      white-label surface
fixtures/            recorded LLM responses for fixture mode
```

## Roadmap

v1 work, in rough priority order: live citations (web-grounded models), multi-prompt scheduled runs, sentiment taxonomy, multi-country, more engines (Perplexity, Gemini), and an MCP server so other AI tools can read your visibility data.

## License

MIT — see [LICENSE](./LICENSE).
