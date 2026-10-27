"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

export function ThemeToggle({ className = "", size = "md" }: ThemeToggleProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const isSmall = size === "sm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDarkMode}
      onClick={toggleTheme}
      aria-label={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={`relative inline-flex items-center shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-300 ease-in-out focus:outline-none select-none bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-inner group ${
        isSmall ? "h-6 w-11" : "h-6 w-11 sm:h-7 sm:w-14"
      } ${className}`}
    >
      {/* Left Track Icon (Sun) */}
      <span className="absolute left-1 sm:left-1.5 flex items-center justify-center pointer-events-none text-amber-500/70 dark:text-slate-600">
        <Sun className={isSmall ? "w-3 h-3" : "w-3 h-3 sm:w-3.5 sm:h-3.5"} />
      </span>

      {/* Right Track Icon (Moon) */}
      <span className="absolute right-1 sm:right-1.5 flex items-center justify-center pointer-events-none text-slate-400 dark:text-amber-300/70">
        <Moon className={isSmall ? "w-3 h-3" : "w-3 h-3 sm:w-3.5 sm:h-3.5"} />
      </span>

      {/* Sliding Knob */}
      <span
        className={`relative z-10 flex items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out ${
          isSmall
            ? `w-5 h-5 ${
                isDarkMode
                  ? "translate-x-5 bg-slate-800 border border-slate-600 text-amber-300"
                  : "translate-x-0 bg-white border border-slate-200 text-amber-500"
              }`
            : `w-5 h-5 sm:w-6 sm:h-6 ${
                isDarkMode
                  ? "translate-x-5 sm:translate-x-7 bg-slate-800 border border-slate-600 text-amber-300"
                  : "translate-x-0 bg-white border border-slate-200 text-amber-500"
              }`
        }`}
      >
        {isDarkMode ? (
          <Moon
            className={`${
              isSmall ? "w-3 h-3" : "w-3 h-3 sm:w-3.5 sm:h-3.5"
            } fill-amber-300 text-amber-300 transition-transform duration-200 group-hover:rotate-12`}
          />
        ) : (
          <Sun
            className={`${
              isSmall ? "w-3 h-3" : "w-3 h-3 sm:w-3.5 sm:h-3.5"
            } fill-amber-500 text-amber-500 transition-transform duration-200 group-hover:rotate-45`}
          />
        )}
      </span>
    </button>
  );
}

