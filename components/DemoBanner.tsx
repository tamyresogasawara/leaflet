import { brand } from "@/brand.config";

export function DemoBanner() {
  if (brand.deploymentMode !== "demo") return null;
  return (
    <div className="border-b border-border bg-[#EEF2FF]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-2 text-sm text-ink">
        <p>
          <strong>Demo mode</strong> — {brand.appName} is open source and runs
          in your browser with your own API keys. Nothing is stored on our
          servers.
        </p>
        {brand.repoUrl ? (
          <a
            href={brand.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            View source ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}
