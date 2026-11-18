"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu, type UserMenuPage } from "@/components/UserMenu";
import type { ResolvedUserIdentity } from "@/lib/identity";

export interface HeaderBackLink {
  href: string;
  label: string;
  ariaLabel: string;
}

export interface HeaderActionsProps {
  identity: ResolvedUserIdentity;
  email?: string | null;
  currentPage?: UserMenuPage;
  onSignOut: () => Promise<void> | void;
  /** Optional left-most navigation link (e.g. "← Gazette" on /profile). */
  backLink?: HeaderBackLink;
  className?: string;
}

/**
 * Shared right-side header cluster for `/` and `/profile`:
 *   [back/primary nav link] [ThemeToggle] [UserMenu]
 * All controls share `h-9`, consistent border/radius (`rounded-lg`), and `gap-2`
 * to guarantee clean alignment and zero overflow down to 360px viewport width.
 */
export function HeaderActions({
  identity,
  email,
  currentPage,
  onSignOut,
  backLink,
  className = "",
}: HeaderActionsProps) {
  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`}>
      {backLink && (
        <Link
          href={backLink.href}
          aria-label={backLink.ariaLabel}
          title={backLink.ariaLabel}
          className="h-9 px-2.5 sm:px-3 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-slate-700/80 hover:border-slate-500 font-mono font-bold text-xs tracking-wider inline-flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{backLink.label}</span>
        </Link>
      )}

      <div className="h-9 px-2 rounded-lg bg-slate-900/90 border border-slate-700/80 inline-flex items-center justify-center shrink-0">
        <ThemeToggle size="sm" />
      </div>

      <UserMenu
        identity={identity}
        email={email}
        currentPage={currentPage}
        onSignOut={onSignOut}
      />
    </div>
  );
}
