"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";

interface BriefingEndStateProps {
  totalUpdates: number;
  readingTimeMinutes: number;
  todayDate: string;
}

export function BriefingEndState({
  totalUpdates,
  readingTimeMinutes,
  todayDate,
}: BriefingEndStateProps) {
  return (
    <section
      data-testid="all-caught-up-panel"
      className="max-w-[1600px] mx-auto px-3 sm:px-6 mt-12 pt-8 border-t-2 border-slate-300 dark:border-slate-800"
    >
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 sm:p-8 md:p-10 shadow-xs flex flex-col items-center text-center max-w-2xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shadow-xs">
          <CheckCircle2 className="w-6 h-6" />
        </div>

        <h3 className="text-xl sm:text-2xl font-black font-serif text-slate-950 dark:text-slate-50 tracking-tight mb-2">
          You&apos;re all caught up for today
        </h3>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-sans leading-relaxed max-w-md mb-6">
          You&apos;ve completed all intelligence updates for today. Next daily edition arrives tomorrow.
        </p>

        {/* Briefing Stats Pill */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 mb-6">
          <span className="font-bold text-slate-900 dark:text-slate-100">
            {totalUpdates} of {totalUpdates} updates completed
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span>~{readingTimeMinutes} min read</span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span>{todayDate}</span>
        </div>

        {/* Link to adjust preferences */}
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 underline underline-offset-4 transition-colors"
        >
          <span>Adjust your topics &amp; preferences</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
