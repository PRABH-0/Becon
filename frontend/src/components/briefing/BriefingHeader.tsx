"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HeaderActions } from "@/components/HeaderActions";
import type { ResolvedUserIdentity } from "@/lib/identity";

interface BriefingHeaderProps {
  headerVisible: boolean;
  todayDate: string;
  updateCount: number;
  readingTimeMinutes: number;
  userIdentity: ResolvedUserIdentity;
  userEmail?: string;
  onSignOut: () => Promise<void>;
  loading?: boolean;
}

export function BriefingHeader({
  headerVisible,
  todayDate,
  updateCount,
  readingTimeMinutes,
  userIdentity,
  userEmail,
  onSignOut,
  loading = false,
}: BriefingHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={`bg-slate-950 text-slate-200 py-2.5 sm:py-3 px-3 sm:px-6 border-b border-slate-800 shadow-md sticky top-0 z-50 transition-transform duration-300 ease-in-out ${
        headerVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/" className="hover:opacity-85 transition-opacity">
            <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
              B E C O N
            </h1>
          </Link>
          <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden md:inline">
            THE DAILY INTELLIGENCE GAZETTE
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono relative shrink-0">
          <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] sm:text-xs hidden lg:inline">
            {todayDate}
          </span>
          <span className="text-amber-300 dark:text-amber-400 font-bold hidden md:inline border-l border-slate-700 pl-3 tracking-wider uppercase text-[11px]">
            {loading ? "SYNTHESIZING DISPATCH..." : `${updateCount} updates, ~${readingTimeMinutes} min read`}
          </span>

          <HeaderActions
            identity={userIdentity}
            email={userEmail}
            currentPage="home"
            onSignOut={async () => {
              await onSignOut();
              router.push("/login");
            }}
          />
        </div>
      </div>
    </header>
  );
}
