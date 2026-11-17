import React from "react";
import { Calendar, ExternalLink, Info } from "lucide-react";
import { BriefingCard } from "@/types/card";
import { ActionCardBody } from "./ActionCardBody";

interface BriefCardProps {
  card: BriefingCard;
  rankNumber?: number;
  onOpenDrawer?: (card: BriefingCard) => void;
  renderStackTag?: (tag: string) => React.ReactNode;
}

export function BriefCard({
  card,
  rankNumber,
  onOpenDrawer,
  renderStackTag,
}: BriefCardProps) {
  return (
    <article
      data-testid="brief-card"
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 transition-all flex flex-col justify-between h-full"
    >
      <div>
        {/* Top Tag & Rank */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 truncate">
            {rankNumber !== undefined && rankNumber <= 5 && (
              <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-amber-300 border border-slate-800 dark:border-slate-700 shrink-0">
                #{String(rankNumber).padStart(2, "0")}
              </span>
            )}
            {renderStackTag ? (
              renderStackTag(card.target_stack[0])
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 font-mono text-[9px]">/</span>
                <span>{card.target_stack[0]?.replace(/^#/, "").trim()}</span>
              </span>
            )}
          </div>
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-950 dark:hover:bg-slate-700 hover:text-amber-300 text-slate-700 dark:text-slate-200 font-mono transition-all border border-slate-200 dark:border-slate-700 shrink-0"
            title="Open original resource documentation"
          >
            <span>Resource</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Title Button (Opens Drawer) */}
        <h4 className="text-sm sm:text-base font-bold font-serif text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 mb-2">
          <button
            type="button"
            onClick={() => onOpenDrawer?.(card)}
            className="text-left hover:text-rose-600 dark:hover:text-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded cursor-pointer"
          >
            {card.title}
          </button>
        </h4>

        {/* 4-Part Compact Action Body */}
        <div className="mb-2">
          <ActionCardBody content={card.card_content} variant="compact" />
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-auto">
        <span className="truncate flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" />
          <span>{card.published_at || "Oct 23, 2026"}</span>
        </span>
        <button
          type="button"
          onClick={() => onOpenDrawer?.(card)}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          <Info className="w-3 h-3" />
          <span>Details</span>
        </button>
      </div>
    </article>
  );
}
