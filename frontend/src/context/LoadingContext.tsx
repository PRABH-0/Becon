"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Radio } from "lucide-react";

interface LoadingContextType {
  isLoading: boolean;
  message: string;
  subtitle: string;
  showLoader: (message?: string, subtitle?: string) => void;
  hideLoader: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("Curating Your Daily Gazette...");
  const [subtitle, setSubtitle] = useState("Analyzing real-time signals & generating personalized briefings");

  const showLoader = useCallback((msg?: string, sub?: string) => {
    if (msg) setMessage(msg);
    if (sub) setSubtitle(sub);
    setIsLoading(true);
  }, []);

  const hideLoader = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <LoadingContext.Provider value={{ isLoading, message, subtitle, showLoader, hideLoader }}>
      {children}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 h-1 bg-transparent overflow-hidden z-[10000] pointer-events-none"
        >
          {/* Top edge progress bar */}
          <div className="w-1/2 h-full bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-500 rounded-full animate-loader-shimmer" />
        </div>
      )}
    </LoadingContext.Provider>
  );
}

export function useLoader() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoader must be used within a LoadingProvider");
  }
  return context;
}
