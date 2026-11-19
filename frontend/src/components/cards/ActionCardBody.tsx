import React from "react";
import { BriefingCardContent } from "@/types/card";
import { ActionBadge } from "./ActionBadge";

interface ActionCardBodyProps {
  content: BriefingCardContent;
  variant: "wide" | "compact";
  className?: string;
}

export function ActionCardBody({ content, variant, className = "" }: ActionCardBodyProps) {
  if (!content) return null;

  const hasWhatHappened = Array.isArray(content.what_happened) && content.what_happened.length > 0;
  const hasWhyItMatters = Boolean(content.why_it_matters && content.why_it_matters.trim());
  const hasHowItAffects = Boolean(content.how_it_affects_you && content.how_it_affects_you.trim());
  const hasAction = Boolean(
    content.what_to_do_next && content.what_to_do_next.guidance && content.what_to_do_next.guidance.trim()
  );

  if (variant === "wide") {
    return (
      <div className={`space-y-2.5 ${className}`}>
        {/* 1. WHAT HAPPENED */}
        {hasWhatHappened && (
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-1">
              WHAT HAPPENED:
            </div>
            <ul className="space-y-1 text-xs sm:text-[13px] text-slate-700 dark:text-slate-300">
              {content.what_happened.slice(0, 2).map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-1.5 leading-snug">
                  <span className="text-rose-600 dark:text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                  <span className="line-clamp-2">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 2. WHY IT MATTERS */}
        {hasWhyItMatters && (
          <div className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
            <strong className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mr-1.5">
              WHY IT MATTERS:
            </strong>
            <span className="line-clamp-2">{content.why_it_matters}</span>
          </div>
        )}

        {/* 3. HOW IT AFFECTS YOU */}
        {hasHowItAffects && (
          <div className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
            <strong className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mr-1.5">
              HOW IT AFFECTS YOU:
            </strong>
            <span className="line-clamp-2">{content.how_it_affects_you}</span>
          </div>
        )}

        {/* 4. WHAT TO DO NEXT */}
        {hasAction && (
          <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-wrap sm:flex-nowrap items-start gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                WHAT TO DO NEXT:
              </span>
              <ActionBadge actionType={content.what_to_do_next.action_type} />
            </div>
            <p className="text-xs sm:text-[13px] text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed font-medium min-w-0">
              {content.what_to_do_next.guidance}
            </p>
          </div>
        )}
      </div>
    );
  }

  // COMPACT VARIANT (Square and Brief cards) - Task 6.1b: render all 4 parts
  return (
    <div className={`space-y-2 ${className}`}>
      {/* 1. WHAT HAPPENED (1 bullet) */}
      {hasWhatHappened && (
        <p className="text-xs sm:text-[12.5px] text-slate-800 dark:text-slate-200 leading-snug flex items-start gap-1.5">
          <span className="text-rose-600 dark:text-rose-400 font-bold shrink-0 mt-0.5">•</span>
          <span className="line-clamp-2">{content.what_happened[0]}</span>
        </p>
      )}

      {/* 2. WHY IT MATTERS (1 line in compact view) */}
      {hasWhyItMatters && (
        <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">
          <strong className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mr-1">
            WHY IT MATTERS:
          </strong>
          <span>{content.why_it_matters}</span>
        </div>
      )}

      {/* 3. HOW IT AFFECTS YOU (1 line in compact view) */}
      {hasHowItAffects && (
        <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2">
          <strong className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mr-1">
            HOW IT AFFECTS YOU:
          </strong>
          <span>{content.how_it_affects_you}</span>
        </div>
      )}

      {/* 4. WHAT TO DO NEXT (Badge + 1-line guidance) */}
      {hasAction && (
        <div className="pt-1.5 border-t border-dashed border-slate-200 dark:border-slate-800 flex items-center gap-1.5 min-w-0">
          <ActionBadge actionType={content.what_to_do_next.action_type} />
          <p className="text-xs text-slate-800 dark:text-slate-200 line-clamp-1 leading-tight font-medium min-w-0">
            {content.what_to_do_next.guidance}
          </p>
        </div>
      )}
    </div>
  );
}
