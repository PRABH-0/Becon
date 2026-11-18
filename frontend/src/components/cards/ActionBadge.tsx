import React from "react";

export function getActionBadgeColor(type: string = "prepare"): string {
  switch (type.toLowerCase()) {
    case "apply":
      return "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    case "learn":
      return "bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800";
    case "avoid":
      return "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";
    case "prepare":
    default:
      return "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  }
}

interface ActionBadgeProps {
  actionType?: string;
  className?: string;
}

export function ActionBadge({ actionType = "prepare", className = "" }: ActionBadgeProps) {
  const cleanType = actionType.trim().toUpperCase() || "PREPARE";
  const colorClass = getActionBadgeColor(actionType);

  return (
    <span
      className={`inline-flex items-center text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border tracking-wider uppercase shadow-2xs select-none ${colorClass} ${className}`}
    >
      {cleanType}
    </span>
  );
}
