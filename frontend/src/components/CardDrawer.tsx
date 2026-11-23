"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Calendar, Copy, Check, Terminal, Layers } from "lucide-react";
import { BriefingCard } from "@/types/card";
import { ActionBadge } from "./cards/ActionBadge";

interface CardDrawerProps {
  card: BriefingCard | null;
  isOpen: boolean;
  onClose: () => void;
}

function extractDomain(url?: string): string {
  if (!url) return "Source";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

export function CardDrawer({ card, isOpen, onClose }: CardDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  // 1. Accessibility: Focus management & Escape key handling
  useEffect(() => {
    if (isOpen) {
      lastActiveElementRef.current = document.activeElement as HTMLElement | null;
      // Focus drawer or close button
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }

        // Focus trap
        if (e.key === "Tab" && drawerRef.current) {
          const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      // Restore previous focus when closed
      if (lastActiveElementRef.current && typeof lastActiveElementRef.current.focus === "function") {
        lastActiveElementRef.current.focus();
      }
    }
  }, [isOpen, onClose]);

  // 2. Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !card) return null;

  const content = card.card_content;
  const domain = extractDomain(card.source_url);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="card-drawer-container"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 dark:bg-black/75 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        data-testid="card-drawer-backdrop"
        aria-hidden="true"
      />

      {/* Drawer Panel: bottom sheet on small screens, slide-over on md+ */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-drawer-title"
        className="relative z-10 w-full max-h-[90vh] md:max-h-full md:h-full md:max-w-xl bg-white dark:bg-slate-900 border-t md:border-t-0 md:border-l-2 border-slate-900 dark:border-slate-800 shadow-2xl flex flex-col mt-auto md:mt-0 transition-transform duration-200 ease-out overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/80 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.target_stack.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs"
              >
                <span className="text-slate-400 font-mono text-[9px]">/</span>
                <span>{tag.replace(/^#/, "").trim()}</span>
              </span>
            ))}
            {card.published_at && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1 ml-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>{card.published_at}</span>
              </span>
            )}
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Headline */}
          <div>
            <h2
              id="card-drawer-title"
              className="text-xl sm:text-2xl font-black font-serif text-slate-950 dark:text-slate-50 leading-tight tracking-tight mb-2"
            >
              {card.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>Target Role: <strong className="text-slate-800 dark:text-slate-200">{card.target_role}</strong></span>
              <span>•</span>
              <span>Source: <strong className="text-slate-800 dark:text-slate-200">{domain}</strong></span>
              {card.reading_time_minutes && (
                <>
                  <span>•</span>
                  <span><strong>{card.reading_time_minutes} min read</strong></span>
                </>
              )}
            </div>
            {card.match_reason && (
              <div
                data-testid="drawer-match-reason"
                className="mt-2 text-[11px] font-mono text-emerald-800 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded px-2.5 py-1 inline-flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span>{card.match_reason}</span>
              </div>
            )}
          </div>

          {/* 1. WHAT HAPPENED */}
          {content?.what_happened && content.what_happened.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>WHAT HAPPENED</span>
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                {content.what_happened.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-rose-600 dark:text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 2. WHY IT MATTERS */}
          {content?.why_it_matters && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                WHY IT MATTERS
              </h3>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                {content.why_it_matters}
              </p>
            </div>
          )}

          {/* 3. HOW IT AFFECTS YOU */}
          {content?.how_it_affects_you && (
            <div className="space-y-1.5 p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                HOW IT AFFECTS YOU ({card.target_role})
              </h3>
              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                {content.how_it_affects_you}
              </p>
            </div>
          )}

          {/* 4. WHAT TO DO NEXT */}
          {content?.what_to_do_next && content.what_to_do_next.guidance && (
            <div className="space-y-2 p-4 rounded-xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  WHAT TO DO NEXT
                </span>
                <ActionBadge actionType={content.what_to_do_next.action_type} />
              </div>
              <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                {content.what_to_do_next.guidance}
              </p>
            </div>
          )}

          {/* Deep Detail: Code Snippet or Expanded Specs */}
          {card.deep_detail?.code_snippet && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1.5 uppercase font-bold">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Snippet ({card.deep_detail.code_snippet.language})</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(card.deep_detail!.code_snippet!.code)}
                  className="flex items-center gap-1 text-[11px] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
                <code>{card.deep_detail.code_snippet.code}</code>
              </pre>
            </div>
          )}

          {card.deep_detail?.full_description && (
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                ADDITIONAL TECHNICAL SPECIFICATIONS
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {card.deep_detail.full_description}
              </p>
            </div>
          )}

          {/* Visual Diagram / Architecture Spec if present */}
          {(card.deep_detail?.has_visual_diagram || card.deep_detail?.diagram_title) && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Architecture / Visual Spec</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  {card.deep_detail.diagram_title || "Architecture Diagram & Topology"}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Visual topology specification available in the referenced documentation.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer with Primary External Source Button */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/80 dark:bg-slate-950/40 flex items-center justify-between gap-3">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
            {domain}
          </span>
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
          >
            <span>Read original source</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
