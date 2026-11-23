"use client";

import React, { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { apiFetch } from "@/lib/api";

export interface SaveButtonProps {
  cardId: string;
  initialSaved?: boolean;
  onToggle?: (isSaved: boolean) => void;
  size?: "sm" | "md";
}

export function SaveButton({
  cardId,
  initialSaved = false,
  onToggle,
  size = "sm",
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState<boolean>(initialSaved);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    queueMicrotask(() => {
      setIsSaved(initialSaved);
    });
  }, [initialSaved]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isLoading) return;

    const nextSaved = !isSaved;
    // Optimistic update
    setIsSaved(nextSaved);
    if (onToggle) onToggle(nextSaved);
    setIsLoading(true);

    try {
      await apiFetch(`/api/cards/${cardId}/save`, {
        method: nextSaved ? "POST" : "DELETE",
      });
    } catch (err) {
      console.error("Failed to update save state:", err);
      // Rollback on failure
      setIsSaved(!nextSaved);
      if (onToggle) onToggle(!nextSaved);
    } finally {
      setIsLoading(false);
    }
  };

  const isSmall = size === "sm";

  return (
    <button
      type="button"
      data-testid="card-save-button"
      aria-label={isSaved ? "Remove from saved cards" : "Save card"}
      title={isSaved ? "Saved" : "Save card"}
      onClick={handleToggle}
      className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
        isSaved
          ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700/60 shadow-2xs"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border-slate-200 dark:border-slate-700"
      }`}
    >
      <Bookmark
        className={`${isSmall ? "w-3.5 h-3.5" : "w-4 h-4"} ${
          isSaved ? "fill-amber-500 text-amber-500" : ""
        }`}
      />
    </button>
  );
}
