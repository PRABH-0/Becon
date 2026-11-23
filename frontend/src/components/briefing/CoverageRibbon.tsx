"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";

interface CoverageRibbonProps {
  userInterests: string[];
}

export function CoverageRibbon({ userInterests }: CoverageRibbonProps) {
  const coverageScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);

  const checkCoverageScroll = useCallback(() => {
    const el = coverageScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  const scrollCoverage = (direction: "left" | "right") => {
    const el = coverageScrollRef.current;
    if (!el) return;
    const distance = 260;
    el.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = coverageScrollRef.current;
    if (!el) return;
    checkCoverageScroll();
    el.addEventListener("scroll", checkCoverageScroll, { passive: true });
    window.addEventListener("resize", checkCoverageScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", checkCoverageScroll);
      window.removeEventListener("resize", checkCoverageScroll);
    };
  }, [userInterests, checkCoverageScroll]);

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-1.5 sm:py-2 shadow-2xs transition-colors duration-200">
      <div className="max-w-[1600px] mx-auto flex items-center gap-1.5 sm:gap-3 font-mono text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        {/* Label */}
        <div className="flex items-center gap-1 text-slate-900 dark:text-slate-100 font-black shrink-0 pr-1.5 sm:pr-2 border-r border-slate-200 dark:border-slate-800 select-none">
          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900 dark:text-amber-400" />
          <span className="hidden sm:inline">COVERAGE:</span>
        </div>

        {/* Topics Container with Hidden Scrollbar & Touch Panning */}
        <div
          ref={coverageScrollRef}
          className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5 touch-pan-x"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {userInterests.length > 0 ? (
            userInterests.map((interest) => (
              <span
                key={interest}
                className="bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 font-bold px-2.5 py-0.5 rounded shrink-0 shadow-2xs select-none"
              >
                ✓ {interest.toUpperCase()}
              </span>
            ))
          ) : (
            <>
              <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                SYSTEM ARCHITECTURE
              </span>
              <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                CLOUD & AZURE
              </span>
              <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                GENERATIVE AI
              </span>
              <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                SECURITY & DEVOPS
              </span>
            </>
          )}
        </div>

        {/* Right-aligned Prev/Next Scroll Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => scrollCoverage("left")}
            disabled={!canScrollLeft}
            aria-label="Previous topics"
            title="Scroll topics left"
            className="shrink-0 p-1 sm:p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-slate-50 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollCoverage("right")}
            disabled={!canScrollRight}
            aria-label="Next topics"
            title="Scroll topics right"
            className="shrink-0 p-1 sm:p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-slate-50 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
