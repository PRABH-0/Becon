import React from "react";
import { Calendar, ExternalLink, Info } from "lucide-react";
import { BriefingCard } from "@/types/card";
import { ActionCardBody } from "./ActionCardBody";

interface SquareCardProps {
  card: BriefingCard;
  showImage?: boolean;
  resolvedImageUrl?: string | null;
  onOpenDrawer?: (card: BriefingCard) => void;
  renderStackTag?: (tag: string) => React.ReactNode;
}

export function SquareCard({
  card,
  showImage,
  resolvedImageUrl,
  onOpenDrawer,
  renderStackTag,
}: SquareCardProps) {
  const hasValidImage = Boolean(showImage && resolvedImageUrl);

  return (
    <article
      data-testid="square-card"
      className="col-span-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-slate-900 dark:hover:border-slate-600 transition-all p-4 sm:p-5 shadow-xs hover:shadow-md flex flex-col justify-between h-full"
    >
      <div>
        {/* Top Row with Tag and Calendar */}
        <div className="flex items-center justify-between gap-1.5 mb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            {renderStackTag ? (
              renderStackTag(card.target_stack[0])
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">/</span>
                <span>{card.target_stack[0]?.replace(/^#/, "").trim()}</span>
              </span>
            )}
            <span className="text-[11px] font-sans font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>{card.published_at || "Oct 23, 2026"}</span>
            </span>
          </div>
        </div>

        {/* Optional Image Thumbnail when real image exists */}
        {hasValidImage && (
          <div className="relative w-full h-32 sm:h-36 rounded-lg overflow-hidden mb-3 border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedImageUrl!}
              alt={card.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget.parentElement;
                if (target) target.style.display = "none";
              }}
            />
          </div>
        )}

        {/* Headline / Title Button (Opens Drawer) */}
        <h3 className="text-base font-bold font-serif text-slate-950 dark:text-slate-100 leading-snug line-clamp-2 mb-2.5">
          <button
            type="button"
            onClick={() => onOpenDrawer?.(card)}
            className="text-left hover:text-rose-600 dark:hover:text-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded cursor-pointer"
          >
            {card.title}
          </button>
        </h3>

        {/* 4-Part Compact Action Body */}
        <div className="mb-2">
          <ActionCardBody content={card.card_content} variant="compact" />
        </div>
      </div>

      {/* Footer with Details button & Read source link */}
      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 mt-auto">
        <span className="text-slate-600 dark:text-slate-400 text-xs truncate font-mono">
          Role: <strong className="text-slate-900 dark:text-slate-200 font-semibold">{card.target_role}</strong>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenDrawer?.(card)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Details</span>
          </button>
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-950 dark:hover:bg-slate-700 hover:text-amber-300 text-slate-800 dark:text-slate-200 font-mono text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 shrink-0"
            title="Read source"
          >
            <span>Read source</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
