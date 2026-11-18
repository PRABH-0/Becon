import React from "react";
import { Calendar, ExternalLink, Info } from "lucide-react";
import { BriefingCard } from "@/types/card";
import { ActionCardBody } from "./ActionCardBody";

interface LeadCardProps {
  card: BriefingCard;
  leadImageUrl?: string | null;
  onOpenDrawer?: (card: BriefingCard) => void;
  renderStackTag?: (tag: string) => React.ReactNode;
}

export function LeadCard({
  card,
  leadImageUrl,
  onOpenDrawer,
  renderStackTag,
}: LeadCardProps) {
  const hasValidImage = Boolean(leadImageUrl);

  return (
    <article
      data-testid="lead-card"
      className="rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-800 p-4 sm:p-5 md:p-6 shadow-sm dark:shadow-slate-950/50 flex flex-col justify-between h-full"
    >
      <div>
        {/* Top Badges & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-slate-950 dark:bg-amber-400 text-amber-300 dark:text-slate-950 border border-slate-800 dark:border-amber-400 uppercase tracking-wider shadow-xs">
              LEAD // 01
            </span>
            {card.target_stack.slice(0, 2).map((tag) =>
              renderStackTag ? (
                renderStackTag(tag)
              ) : (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs"
                >
                  <span className="text-slate-400 font-mono text-[9px]">/</span>
                  <span>{tag.replace(/^#/, "").trim()}</span>
                </span>
              )
            )}
            <span className="text-[10px] font-sans font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <span>{card.published_at || "Oct 23, 2026"}</span>
            </span>
          </div>
        </div>

        {/* Headline / Title Button (Opens Drawer) */}
        <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-950 dark:text-slate-50 font-serif tracking-tight leading-tight mb-3">
          <button
            type="button"
            onClick={() => onOpenDrawer?.(card)}
            className="text-left hover:text-rose-600 dark:hover:text-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded cursor-pointer"
          >
            {card.title}
          </button>
        </h3>

        {/* Hero Image if present */}
        {hasValidImage ? (
          <div className="relative w-full h-36 sm:h-44 rounded-lg overflow-hidden my-3 border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={leadImageUrl!}
              alt={card.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget.parentElement;
                if (target) target.style.display = "none";
              }}
            />
          </div>
        ) : null}

        {/* 4-Part Action Card Body (Wide) */}
        <div className="my-3.5 p-3.5 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800">
          <ActionCardBody content={card.card_content} variant="wide" />
        </div>
      </div>

      {/* Action Bar with Details & Source Link */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 font-mono mt-auto">
        <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
          Role: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{card.target_role}</strong>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenDrawer?.(card)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Details</span>
          </button>
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 hover:text-amber-200 font-bold text-xs transition-all shadow-xs cursor-pointer border border-transparent dark:border-slate-700"
            title="Read source"
          >
            <span>Read source</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}
