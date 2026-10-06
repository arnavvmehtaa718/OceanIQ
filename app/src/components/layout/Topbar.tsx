"use client";

import Link from "next/link";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useAnalysis } from "@/hooks/useAnalysis";

export default function Topbar() {
  const userName = useAppStore((s) => s.userName);
  const userRole = useAppStore((s) => s.userRole);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const { analysis } = useAnalysis();
  const openAlerts = analysis?.alerts.filter((a) => a.severity === "High").length ?? 0;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-navy/80 px-6 backdrop-blur-md">
      {/* Search */}
      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
        <input
          placeholder="Search cargo, ports, vessels, reports…"
          className="h-9 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-[12.5px] text-primary placeholder:text-secondary/70 focus:border-accent focus:outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Live indicator */}
        <span className="hidden items-center gap-1.5 rounded-md border border-good/25 bg-good/10 px-2 py-1 text-[11px] font-medium text-good lg:inline-flex">
          <span className="size-1.5 animate-pulse rounded-full bg-good" />
          Live market data · 13 Sep 2026
        </span>

        {/* Alerts */}
        <Link
          href="/risk"
          className="relative grid size-9 place-items-center rounded-lg border border-line text-secondary transition-colors hover:border-accent/40 hover:text-primary"
          title="Risk & Alerts"
        >
          <Bell className="size-4" />
          {openAlerts > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-bad text-[9px] font-bold text-white">
              {openAlerts}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle color theme"
          className="relative grid size-9 place-items-center rounded-lg border border-line text-secondary transition-colors hover:border-accent/40 hover:text-primary"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        {/* Role chip */}
        <span className="hidden rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent xl:inline">
          {userRole}
        </span>

        {/* Avatar */}
        <div className="grid size-9 place-items-center rounded-lg bg-accent/15 text-[12px] font-bold text-accent">
          {(userName || "SA").slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
