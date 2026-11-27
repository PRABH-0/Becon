"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export interface ReportModalProps {
  cardId: string;
  cardTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

const REPORT_REASONS = [
  "Factually incorrect version or release info",
  "Broken or invalid source link",
  "Outdated or deprecated recommendation",
  "Inaccurate personal impact statement",
  "Security severity misrepresented",
  "Other factual error",
];

export function ReportModal({ cardId, cardTitle, isOpen, onClose }: ReportModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Focus management: capture previous focus, set initial focus, focus trap, and restore focus on close
  useEffect(() => {
    if (isOpen) {
      lastActiveElementRef.current = document.activeElement as HTMLElement | null;
      queueMicrotask(() => {
        setIsSuccess(false);
        setError(null);
        setNote("");
        setReason(REPORT_REASONS[0]);
      });
      const timer = setTimeout(() => selectRef.current?.focus(), 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        }

        // Real focus trap (Tab / Shift+Tab loop)
        if (e.key === "Tab" && modalRef.current) {
          const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      if (lastActiveElementRef.current && typeof lastActiveElementRef.current.focus === "function") {
        lastActiveElementRef.current.focus();
      }
    }
  }, [isOpen, onClose]);

  // 2. Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await apiFetch(`/api/cards/${cardId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          note: note.trim() || undefined,
        }),
      });
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit error report.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      data-testid="report-modal-backdrop"
    >
      <div
        className="fixed inset-0 bg-slate-950/70 dark:bg-black/80 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 text-slate-800 dark:text-slate-100"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 id="report-modal-title" className="font-serif font-black text-lg text-slate-950 dark:text-slate-50">
              Report Factual Error
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report modal"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <h4 className="font-serif font-bold text-base text-slate-950 dark:text-slate-50">
              Report Received
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
              Thank you for helping keep Becon intelligence accurate and factual.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono truncate">
              Card: <strong className="text-slate-950 dark:text-slate-100">{cardTitle}</strong>
            </p>

            <div>
              <label htmlFor="report-reason" className="block text-xs font-mono font-bold uppercase text-slate-800 dark:text-slate-200 mb-1.5">
                Reason for report:
              </label>
              <select
                id="report-reason"
                ref={selectRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 font-sans"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="report-note" className="block text-xs font-mono font-bold uppercase text-slate-800 dark:text-slate-200">
                  Additional Details (Optional):
                </label>
                <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  {note.length}/500
                </span>
              </div>
              <textarea
                id="report-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Describe the discrepancy, correct link, or official source clarification..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 font-sans resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-700 dark:text-rose-400 font-mono font-semibold">
                {error}
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-mono font-bold rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="submit-report-button"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-xs disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
