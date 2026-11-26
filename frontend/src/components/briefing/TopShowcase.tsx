"use client";

import React from "react";
import { Flame, Radio, Pin } from "lucide-react";
import { BriefingCard } from "@/types/card";
import { LeadCard, BriefCard } from "@/components/cards";

interface TopShowcaseProps {
  loading: boolean;
  leadStory: BriefingCard | null;
  leadImageUrl?: string | null;
  topWireStories: BriefingCard[];
  onOpenDrawer: (card: BriefingCard) => void;
  renderStackTag?: (tag: string) => React.ReactNode;
}

export function TopShowcase({
  loading,
  leadStory,
  leadImageUrl,
  topWireStories,
  onOpenDrawer,
  renderStackTag,
}: TopShowcaseProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 items-start pb-8 sm:pb-10 border-b-2 border-slate-900 dark:border-slate-800">
      {/* TOP MOST IMPORTANT UPDATE (LEFT 5 COLS) */}
      <div className="lg:col-span-5 flex flex-col">
        <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-slate-800 pb-2 mb-3 font-mono">
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-black tracking-wider uppercase bg-rose-600 text-white shadow-xs">
            <Flame className="w-3.5 h-3.5" /> #1 CRITICAL UPDATE
          </span>
          <span className="text-slate-600 dark:text-slate-400 text-[11px] font-bold uppercase font-mono">
            • TOP SIGNAL
          </span>
        </div>
        <div className="flex flex-col">
          {loading ? (
            <LeadSkeleton />
          ) : leadStory ? (
            <LeadCard
              card={leadStory}
              leadImageUrl={leadImageUrl}
              onOpenDrawer={onOpenDrawer}
              renderStackTag={renderStackTag}
            />
          ) : null}
        </div>
      </div>

      {/* DAILY DISPATCHES / QUICK WIRE (RIGHT 7 COLS) */}
      <div className="lg:col-span-7 flex flex-col h-full">
        <div className="flex flex-col h-full flex-1">
          <div className="border-b-2 border-slate-900 dark:border-slate-800 pb-2 mb-3 flex items-center justify-between font-mono">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950 dark:text-slate-100 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-rose-500" /> THE QUICK WIRE • RAPID SIGNALS
            </span>
            <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded uppercase">
              DISPATCHES
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 gap-3.5 flex-1">
            {loading
              ? [2, 3, 4, 5].map((rank) => <BriefSkeleton key={rank} rankNumber={rank} />)
              : topWireStories.length > 0
              ? topWireStories.map((card, idx) => (
                  <BriefCard
                    key={card.id}
                    card={card}
                    rankNumber={idx < 4 ? idx + 2 : undefined}
                    onOpenDrawer={onOpenDrawer}
                    renderStackTag={renderStackTag}
                  />
                ))
              : (
                <div className="col-span-1 sm:col-span-2 p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center flex flex-col items-center justify-center text-xs font-mono text-slate-500">
                  <span>No additional rapid dispatches today</span>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadSkeleton() {
  return (
    <article className="rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-800 p-4 sm:p-5 md:p-6 shadow-sm dark:shadow-slate-950/50 flex flex-col justify-between h-full select-none">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-rose-600 text-white uppercase tracking-wider shadow-xs">
              LEAD // 01
            </span>
            <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span>AI SYNTHESIZING...</span>
          </div>
        </div>

        <div className="space-y-2 mb-3.5">
          <div className="h-6 sm:h-7 bg-slate-200 dark:bg-slate-800 rounded-md w-11/12 animate-pulse" />
          <div className="h-6 sm:h-7 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4 animate-pulse" />
        </div>

        <div className="relative w-full h-36 sm:h-44 rounded-lg my-3 border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 flex flex-col items-center justify-center overflow-hidden gap-2">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[10px] sm:text-[11px] font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            <span>Synthesizing Lead Intelligence</span>
          </div>
        </div>

        <div className="mb-4 p-3.5 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-extrabold text-slate-500 dark:text-slate-400">
            <Pin className="w-3.5 h-3.5 text-rose-500" />
            <span>ARTICLE HIGHLIGHTS:</span>
          </div>
          <div className="space-y-2 pl-1">
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-11/12 animate-pulse" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse" />
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 mt-auto">
        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-7 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
      </div>
    </article>
  );
}

function BriefSkeleton({ rankNumber }: { rankNumber: number }) {
  return (
    <article className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between h-full select-none">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-amber-300 border border-slate-800 dark:border-slate-700">
              #{String(rankNumber).padStart(2, "0")}
            </span>
            <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <span>PARSING</span>
          </div>
        </div>

        <div className="space-y-1.5 mb-2.5">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse" />
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse" />
        </div>

        <div className="relative w-full h-20 sm:h-24 md:h-28 rounded-lg my-2.5 border border-slate-200/90 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/60 flex flex-col items-center justify-center overflow-hidden gap-1.5 shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[9.5px] font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            <span>Dispatch #{String(rankNumber).padStart(2, "0")}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-dashed border-slate-100 dark:border-slate-800 space-y-1">
          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse" />
        </div>
      </div>

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-auto">
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </div>
    </article>
  );
}
