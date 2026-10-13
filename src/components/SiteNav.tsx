"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/matches", label: "Matches" },
  { href: "/balance", label: "Balance Teams" },
] as const;

function isActive(currentPath: string, href: string): boolean {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const link = (href: string, label: string, block = false) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? "page" : undefined}
      onClick={() => setMobileOpen(false)}
      className={`${block ? "block" : ""} rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive(pathname, href)
          ? "bg-accent/15 text-accent"
          : "text-gray-300 hover:bg-white/5 hover:text-accent"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="relative sticky top-0 z-40 border-b border-white/10 bg-ink/95 shadow-lg shadow-black/20 backdrop-blur supports-[backdrop-filter]:bg-ink/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-heading text-base font-bold uppercase tracking-wide text-white transition-colors hover:text-accent sm:text-lg"
        >
          CS <span className="text-accent">Labs</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => link(item.href, item.label))}
          <Link
            href="/submit"
            className="font-heading ml-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold uppercase tracking-wide text-ink shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 hover:shadow-accent/40"
          >
            Submit Match
          </Link>
        </nav>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex items-center justify-center rounded-md p-2 text-accent hover:bg-white/5 lg:hidden"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className="border-t border-white/10 bg-ink lg:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_ITEMS.map((item) => link(item.href, item.label, true))}
            <Link
              href="/submit"
              onClick={() => setMobileOpen(false)}
              className="font-heading mt-2 block rounded-lg bg-accent px-4 py-2 text-center text-sm font-bold uppercase tracking-wide text-ink"
            >
              Submit Match
            </Link>
          </div>
        </nav>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        aria-hidden
      />
    </header>
  );
}
