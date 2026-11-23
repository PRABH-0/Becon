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
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        setIsSuccess(false);
        setError(null);
        setNote("");
        setReason(REPORT_REASONS[0]);
      });
      setTimeout(() => selectRef.current?.focus(), 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

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
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 id="report-modal-title" className="font-serif font-black text-lg text-slate-950 dark:text-slate-50">
              Report Factual Error
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report modal"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="font-serif font-bold text-base text-slate-900 dark:text-slate-100">
              Report Received
            </h4>
            <p className="text-xs text-slate-500 font-mono">
              Thank you for helping keep Becon intelligence accurate and factual.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono truncate">
              Card: <strong className="text-slate-800 dark:text-slate-200">{cardTitle}</strong>
            </p>

            <div>
              <label htmlFor="report-reason" className="block text-xs font-mono font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">
                Reason for report:
              </label>
              <select
                id="report-reason"
                ref={selectRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500 font-sans"
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
                <label htmlFor="report-note" className="block text-xs font-mono font-bold uppercase text-slate-700 dark:text-slate-300">
                  Additional Details (Optional):
                </label>
                <span className="text-[10px] font-mono text-slate-400">
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
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 font-sans resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-600 font-mono">
                {error}
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-mono font-bold rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="submit-report-button"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-sm disabled:opacity-50 cursor-pointer"
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
