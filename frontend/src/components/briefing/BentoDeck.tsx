"use client";

import React from "react";
import { BriefingCard } from "@/types/card";
import { RectangleCard, SquareCard } from "@/components/cards";
import { computeBentoSpans } from "@/lib/bento";

interface BentoDeckProps {
  headerVisible: boolean;
  dailyHeading: string;
  updateCount: number;
  readingTimeMinutes: number;
  loading: boolean;
  loadingRemaining: boolean;
  displayedBentoStories: BriefingCard[];
  bentoCardImages: (string | null)[];
  onOpenDrawer: (card: BriefingCard) => void;
  renderStackTag?: (tag: string) => React.ReactNode;
}

export function BentoDeck({
  headerVisible,
  dailyHeading,
  updateCount,
  readingTimeMinutes,
  loading,
  loadingRemaining,
  displayedBentoStories,
  bentoCardImages,
  onOpenDrawer,
  renderStackTag,
}: BentoDeckProps) {
  const bentoSpans = computeBentoSpans(displayedBentoStories.length);

  return (
    <section className="flex flex-col space-y-5 sm:space-y-6 pb-12 pt-2">
      <div
        className={`sticky z-30 bg-[#FAF8F5] dark:bg-[#070b12] border-b-2 border-slate-900 dark:border-slate-800 transition-all duration-300 ease-in-out -mx-3 sm:-mx-6 px-3 sm:px-6 ${
          headerVisible ? "top-[50px] sm:top-[57px] shadow-xs" : "top-0 shadow-md"
        }`}
      >
        <div className="max-w-[1600px] mx-auto py-2 sm:py-3 flex flex-wrap items-center justify-between font-mono gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 truncate max-w-[200px] sm:max-w-none">
            <span className="font-serif font-black tracking-widest text-sm sm:text-base text-slate-950 dark:text-white">
              BECON
            </span>
            <span className="text-slate-400 font-mono font-bold">{"//"}</span>
            <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs sm:text-[13px] tracking-wide truncate">
              {dailyHeading}
            </span>
            <span className="text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 shrink-0 hidden md:inline">
              {updateCount} updates • ~{readingTimeMinutes} min read
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loadingRemaining ? (
              <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="hidden sm:inline">AI SYNTHESIZING REMAINING TAKES...</span>
                <span className="sm:hidden">SYNTHESIZING...</span>
              </span>
            ) : (
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-bold hidden xl:inline">
                Daily Briefing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FULL-WIDTH DYNAMIC BENTO GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
        {displayedBentoStories.length > 0 ? (
          <>
            {displayedBentoStories.map((card, idx) => {
              const span = bentoSpans[idx] ?? 1;
              const resolvedImg = bentoCardImages[idx] ?? null;
              const showImageOnCard = Boolean(resolvedImg);

              if (span === 1) {
                return (
                  <SquareCard
                    key={card.id}
                    card={card}
                    showImage={showImageOnCard}
                    resolvedImageUrl={resolvedImg}
                    onOpenDrawer={onOpenDrawer}
                    renderStackTag={renderStackTag}
                  />
                );
              }
              const isFullWidth = span === 3;
              return (
                <RectangleCard
                  key={card.id}
                  card={card}
                  showImage={showImageOnCard}
                  isFullWidth={isFullWidth}
                  resolvedImageUrl={resolvedImg}
                  onOpenDrawer={onOpenDrawer}
                  renderStackTag={renderStackTag}
                />
              );
            })}
            {loadingRemaining && (
              <>
                {[2, 1, 1].map((span, idx) => (
                  <BentoSkeletonCard key={`skel-rem-${idx}`} span={span} keyIndex={idx + 10} />
                ))}
              </>
            )}
          </>
        ) : loading || loadingRemaining ? (
          <>
            {[2, 1, 1, 2, 3].map((span, idx) => (
              <BentoSkeletonCard key={`skel-load-${idx}`} span={span} keyIndex={idx} />
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}

function BentoSkeletonCard({ span, keyIndex }: { span: number; keyIndex: number }) {
  const colSpanClass =
    span === 3
      ? "col-span-1 md:col-span-2 xl:col-span-3"
      : span === 2
      ? "col-span-1 md:col-span-2 xl:col-span-2"
      : "col-span-1";

  return (
    <article
      className={`${colSpanClass} rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full select-none`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-400">
            SIGNAL #{String(keyIndex + 1).padStart(2, "0")}
          </span>
        </div>

        <div className="space-y-2 mb-3">
          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-11/12 animate-pulse" />
          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse" />
        </div>

        <div className="space-y-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse" />
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6 animate-pulse" />
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-4">
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </div>
    </article>
  );
}
