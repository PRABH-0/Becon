import React from "react";
import { Calendar, ExternalLink, Info } from "lucide-react";
import { BriefingCard } from "@/types/card";
import { ActionCardBody } from "./ActionCardBody";
import { SaveButton } from "./SaveButton";

interface RectangleCardProps {
  card: BriefingCard;
  showImage?: boolean;
  isFullWidth?: boolean;
  resolvedImageUrl?: string | null;
  onOpenDrawer?: (card: BriefingCard) => void;
  renderStackTag?: (tag: string) => React.ReactNode;
}

export function RectangleCard({
  card,
  showImage,
  isFullWidth,
  resolvedImageUrl,
  onOpenDrawer,
  renderStackTag,
}: RectangleCardProps) {
  const hasValidImage = Boolean(showImage && resolvedImageUrl);

  return (
    <article
      data-testid="rectangle-card"
      className={`${
        isFullWidth
          ? "col-span-1 md:col-span-2 xl:col-span-3"
          : "col-span-1 md:col-span-2 xl:col-span-2"
      } rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-slate-900 dark:hover:border-slate-600 transition-all p-4 sm:p-5 md:p-6 shadow-xs hover:shadow-md flex flex-col justify-between h-full`}
    >
      <div>
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.target_stack.slice(0, 2).map((tag) =>
              renderStackTag ? (
                renderStackTag(tag)
              ) : (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs"
                >
                  <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">/</span>
                  <span>{tag.replace(/^#/, "").trim()}</span>
                </span>
              )
            )}
            <span className="text-[11px] font-sans font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>{card.published_at || "Oct 23, 2026"}</span>
            </span>
            {card.reading_time_minutes && (
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                • {card.reading_time_minutes} min read
              </span>
            )}
          </div>
        </div>

        {card.match_reason && (
          <div
            data-testid="card-match-reason"
            className="text-[10px] font-mono text-emerald-800 dark:text-emerald-400 font-bold mb-2 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>{card.match_reason}</span>
          </div>
        )}

        {/* Content Body: Media Split or Full Text */}
        {hasValidImage ? (
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
            {/* Left Image Thumbnail */}
            <div className="relative w-full sm:w-48 md:w-56 h-36 sm:h-44 shrink-0 rounded-lg overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shadow-2xs">
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

            {/* Right Text Content with 4 parts */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold font-serif text-slate-950 dark:text-slate-100 leading-snug mb-2">
                <button
                  type="button"
                  onClick={() => onOpenDrawer?.(card)}
                  className="text-left hover:text-rose-600 dark:hover:text-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded cursor-pointer"
                >
                  {card.title}
                </button>
              </h3>

              <ActionCardBody content={card.card_content} variant="wide" />
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg sm:text-xl font-bold font-serif text-slate-950 dark:text-slate-100 leading-snug my-2">
              <button
                type="button"
                onClick={() => onOpenDrawer?.(card)}
                className="text-left hover:text-rose-600 dark:hover:text-amber-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded cursor-pointer"
              >
                {card.title}
              </button>
            </h3>

            <ActionCardBody content={card.card_content} variant="wide" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs mt-3 font-mono">
        <span className="text-slate-600 dark:text-slate-400 text-xs truncate">
          Role: <strong className="text-slate-900 dark:text-slate-200 font-semibold">{card.target_role}</strong>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <SaveButton cardId={card.id} initialSaved={card.is_saved} size="md" />
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
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1.5 transition-colors border border-slate-800 dark:border-slate-700 cursor-pointer shrink-0 font-mono shadow-xs"
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
