import type { NextConfig } from "next";

// Baseline security headers. These don't break Next.js HMR.
// Strict, nonce-based CSP is scheduled with the live-engine work item
// (plan.md §7, week 1, item 15) because Next.js dev needs unsafe-eval / unsafe-inline
// for HMR; the proper fix is a middleware-injected nonce pair, which is non-trivial.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer ships as ESM-only and pulls in CJS internals that
  // Next.js can't resolve without transpilation. Bundling it through the
  // Next.js compiler makes the dynamic import resolve cleanly on the client.
  transpilePackages: ["@react-pdf/renderer"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
