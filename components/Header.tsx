import Link from "next/link";
import { brand } from "@/brand.config";

export function Header() {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.logoSrc}
            alt=""
            width={24}
            height={24}
            aria-hidden
          />
          {brand.appName}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/">Run</NavLink>
          <NavLink href="/history">History</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-muted hover:bg-surface hover:text-ink"
    >
      {children}
    </Link>
  );
}
