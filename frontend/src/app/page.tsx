"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { GuestBanner } from "@/components/GuestBanner";
import { CardDrawer } from "@/components/CardDrawer";
import { useBriefing } from "@/hooks/useBriefing";
import { BriefingHeader } from "@/components/briefing/BriefingHeader";
import { CoverageRibbon } from "@/components/briefing/CoverageRibbon";
import { TopShowcase } from "@/components/briefing/TopShowcase";
import { BentoDeck } from "@/components/briefing/BentoDeck";
import { BriefingEndState } from "@/components/briefing/BriefingEndState";
import { resolveUniqueCardImage } from "@/lib/bento";
import { useAuth } from "@/context/AuthContext";
import { LandingView } from "@/components/landing/LandingView";

export const BRIEFING_MAX_CARDS = 10;

export default function Home() {
  const { session, user, isLoading } = useAuth();
  const isAuthenticated = Boolean(session || user);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#070b12]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Checking Credentials...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingView />;
  }

  return <BriefingHome />;
}

function BriefingHome() {
  const {
    briefings,
    loading,
    loadingRemaining,
    dailyHeading,
    readingTimeMinutes,
    userEmail,
    userInterests,
    userIdentity,
    drawerCard,
    setDrawerCard,
    todayDate,
    signOut,
    error,
    fetchAllBriefings,
  } = useBriefing();

  // Smart Auto-Hide Header (Hide on scroll down, reveal on scroll up)
  const [headerVisible, setHeaderVisible] = useState<boolean>(true);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const lastScrollYRef = useRef<number>(0);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollYRef.current;

      if (currentScrollY < 60) {
        setHeaderVisible(true);
      } else if (diff > 8) {
        setHeaderVisible(false);
      } else if (diff < -6) {
        setHeaderVisible(true);
      }
      lastScrollYRef.current = currentScrollY;
      setShowScrollTop(currentScrollY > 250);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const leadStory = useMemo(() => {
    return briefings.find((b) => b.is_lead || b.priority === "lead") || briefings[0] || null;
  }, [briefings]);

  const otherStories = useMemo(() => {
    return briefings.filter((b) => b.id !== leadStory?.id);
  }, [briefings, leadStory]);

  // Top showcase quick wire: up to 4 dispatches for right side
  const topWireCount = 4;
  const topWireStories = useMemo(() => {
    let wire = otherStories.filter((b) => b.priority === "brief").slice(0, topWireCount);
    if (wire.length < topWireCount && otherStories.length >= topWireCount) {
      const existingIds = new Set(wire.map((b) => b.id));
      const extra = otherStories.filter((b) => !existingIds.has(b.id)).slice(0, topWireCount - wire.length);
      wire = [...wire, ...extra];
    } else if (wire.length < topWireCount && otherStories.length > 0) {
      wire = otherStories.slice(0, topWireCount);
    }
    return wire;
  }, [otherStories]);

  const topWireIds = useMemo(() => new Set(topWireStories.map((b) => b.id)), [topWireStories]);

  // Remaining stories displayed in Bento Deck
  const displayedBentoStories = useMemo(() => {
    return otherStories.filter((b) => !topWireIds.has(b.id));
  }, [otherStories, topWireIds]);

  const leadImageUrl = useMemo(() => {
    return resolveUniqueCardImage(leadStory);
  }, [leadStory]);

  const bentoCardImages = useMemo(() => {
    return displayedBentoStories.map((card) => resolveUniqueCardImage(card));
  }, [displayedBentoStories]);

  return (
    <RequireAuth>
      <div className="relative min-h-screen bg-[#FAF8F5] overflow-x-clip">
        {/* 1. TOP HEADER BAR */}
        <BriefingHeader
          headerVisible={headerVisible}
          todayDate={todayDate}
          updateCount={briefings.length}
          readingTimeMinutes={readingTimeMinutes}
          userIdentity={userIdentity}
          userEmail={userEmail}
          onSignOut={signOut}
          loading={loading}
        />

        {/* GUEST BANNER */}
        <GuestBanner />

        {/* 2. EDITION INDEX RIBBON */}
        <CoverageRibbon userInterests={userInterests} />

        {/* MAIN CONTENT AREA */}
        <div className="relative z-10 min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans selection:bg-slate-900 selection:text-white pb-16 transition-colors duration-200">
          <main id="main-content" className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
            {error && !loading ? (
              <section data-testid="briefing-error-state" className="py-20 text-center max-w-xl mx-auto space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 mb-2">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Unable to load today&apos;s Gazette
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
                  {error}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => fetchAllBriefings(true)}
                    className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-white bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 px-4 py-2.5 rounded-lg transition-colors shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              </section>
            ) : !loading && briefings.length === 0 ? (
              <section data-testid="empty-briefing-state" className="py-20 text-center max-w-xl mx-auto space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 mb-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100">
                  No updates in your stack yet
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
                  We monitor official release notes, engineering blogs, and security advisories continuously. Check back shortly or adjust your focus topics in your profile to broaden your briefing coverage.
                </p>
                <div className="pt-2">
                  <Link
                    href="/profile"
                    className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-lg hover:border-slate-400 dark:hover:border-slate-500 transition-colors shadow-2xs"
                  >
                    Adjust Focus Topics <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </section>
            ) : (
              <>
                <div className="space-y-6 sm:space-y-8">
                  {(briefings.length < 3 || briefings.some((b) => b.status_note === "limited_today")) && (
                    <div
                      data-testid="limited-briefing-banner"
                      className="px-4 py-2.5 rounded-lg border border-amber-200/80 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-sans flex items-center gap-2"
                    >
                      <span>Today&apos;s intelligence dispatch is lighter than usual as official sources report low breaking activity.</span>
                    </div>
                  )}

                  {/* TOP SHOWCASE */}
                  <TopShowcase
                    loading={loading}
                    leadStory={leadStory}
                    leadImageUrl={leadImageUrl}
                    topWireStories={topWireStories}
                    onOpenDrawer={setDrawerCard}
                    renderStackTag={renderStackTag}
                  />

                  {/* BENTO DECK */}
                  <BentoDeck
                    headerVisible={headerVisible}
                    dailyHeading={dailyHeading}
                    updateCount={briefings.length}
                    readingTimeMinutes={readingTimeMinutes}
                    loading={loading}
                    loadingRemaining={loadingRemaining}
                    displayedBentoStories={displayedBentoStories}
                    bentoCardImages={bentoCardImages}
                    onOpenDrawer={setDrawerCard}
                    renderStackTag={renderStackTag}
                  />
                </div>

                {/* FINITE BRIEFING END STATE */}
                {!loading && briefings.length > 0 && (
                  <BriefingEndState
                    totalUpdates={briefings.length}
                    readingTimeMinutes={readingTimeMinutes}
                    todayDate={todayDate}
                  />
                )}
              </>
            )}

            {/* EDITORIAL FOOTER */}
            <footer className="max-w-[1600px] mx-auto px-3 sm:px-6 mt-16 pt-8 pb-12 border-t border-slate-300 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 dark:text-slate-400 font-mono text-xs">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-serif font-black tracking-wider uppercase text-sm">
                <span>BECON INTELLIGENCE GAZETTE</span>
                <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] font-normal hidden sm:inline">
                  • Not News. Updates You Can Act On.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-5 font-bold">
                <Link href="/about" className="hover:text-slate-900 dark:hover:text-amber-300 transition-colors">
                  About &amp; Manifesto
                </Link>
                <Link href="/onboarding" className="hover:text-slate-900 dark:hover:text-amber-300 transition-colors">
                  Onboarding Wizard
                </Link>
                <Link href="/profile" className="hover:text-slate-900 dark:hover:text-amber-300 transition-colors">
                  Stack Settings
                </Link>
              </div>
            </footer>
          </main>
        </div>

        {/* FLOATING BACK TO TOP ARROW BUTTON */}
        {showScrollTop && (
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="Back to top"
            title="Back to top"
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 w-10 h-10 rounded-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-2 border-slate-900 dark:border-slate-600 shadow-lg dark:shadow-2xl flex items-center justify-center group cursor-pointer transition-all duration-300 hover:-translate-y-1 select-none"
          >
            <ArrowUp className="w-4 h-4 text-slate-900 dark:text-amber-300 group-hover:text-amber-500 transition-all duration-200 group-hover:-translate-y-0.5" />
            <span className="sr-only">Back to top</span>
          </button>
        )}

        {/* CARD DETAIL DRAWER */}
        <CardDrawer card={drawerCard} isOpen={Boolean(drawerCard)} onClose={() => setDrawerCard(null)} />
      </div>
    </RequireAuth>
  );
}

function renderStackTag(tag: string) {
  const cleanTag = tag.replace(/^#/, "").trim();
  return (
    <span
      key={tag}
      className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs select-none hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
    >
      <span className="text-slate-400 dark:text-slate-500 font-mono text-[9px] font-bold">/</span>
      <span className="truncate">{cleanTag}</span>
    </span>
  );
}
