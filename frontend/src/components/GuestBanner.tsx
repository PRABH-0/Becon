"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { UserCheck, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem("becon_dismiss_guest_banner") === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function GuestBanner() {
  const { isAnonymous } = useAuth();
  const [manuallyDismissed, setManuallyDismissed] = useState(false);
  const sessionDismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!isAnonymous || manuallyDismissed || sessionDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setManuallyDismissed(true);
    try {
      sessionStorage.setItem("becon_dismiss_guest_banner", "true");
    } catch {
      // Storage access may fail in restricted contexts
    }
  };

  return (
    <div
      role="status"
      className="bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 transition-colors"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            You are browsing as a guest. Guest data may be lost over time.
          </span>
          <Link
            href="/register?upgrade=1"
            className="font-medium underline hover:text-amber-700 dark:hover:text-amber-100 ml-1 transition-colors"
          >
            Create account
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss guest notice"
          className="p-1 hover:bg-amber-500/20 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
