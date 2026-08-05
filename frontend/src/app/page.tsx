"use client";

import { useState, useEffect } from "react";

interface ActionGuidance {
  action_type: "learn" | "apply" | "avoid" | "prepare";
  guidance: string;
}

interface DeepDetail {
  full_description?: string;
  code_snippet?: {
    language: string;
    code: string;
  };
  has_visual_diagram?: boolean;
  diagram_title?: string;
}

interface BriefingCardContent {
  what_happened: string[];
  why_it_matters: string;
  how_it_affects_you: string;
  what_to_do_next: ActionGuidance;
}

interface BriefingCard {
  id: string;
  rank?: number;
  title: string;
  source_url: string;
  target_role: string;
  target_stack: string[];
  priority?: "lead" | "major" | "brief" | "watch" | "spotlight";
  card_content: BriefingCardContent;
  deep_detail?: DeepDetail;
}

export default function Home() {
  const [briefings, setBriefings] = useState<BriefingCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCard, setSelectedCard] = useState<BriefingCard | null>(null);

  useEffect(() => {
    fetchAllBriefings();
  }, []);

  const fetchAllBriefings = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/briefings");
      if (res.ok) {
        const data: BriefingCard[] = await res.json();
        if (data.length >= 15) {
          setBriefings(
            data.map((c, index) => ({
              ...c,
              rank: c.rank ?? (index < 10 ? index + 1 : undefined),
            }))
          );
        } else {
          setBriefings(getBroadsheetCards());
        }
      } else {
        setBriefings(getBroadsheetCards());
      }
    } catch (err) {
      console.log("API offline, displaying full high-density editorial broadsheet", err);
      setBriefings(getBroadsheetCards());
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case "apply":
        return "bg-emerald-100 text-emerald-950 border-emerald-300 font-bold";
      case "learn":
        return "bg-blue-100 text-blue-950 border-blue-300 font-bold";
      case "avoid":
        return "bg-rose-100 text-rose-950 border-rose-300 font-bold";
      case "prepare":
      default:
        return "bg-amber-100 text-amber-950 border-amber-300 font-bold";
    }
  };

  const todayDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const leadStory = briefings.find((b) => b.priority === "lead") || briefings[0];
  const majorStories = briefings.filter((b) => b.priority === "major" && b.id !== leadStory?.id);
  const watchStories = briefings.filter((b) => b.priority === "watch" && b.id !== leadStory?.id);
  const briefStories = briefings.filter((b) => b.priority === "brief" && b.id !== leadStory?.id);
  const spotlightStories = briefings.filter((b) => b.priority === "spotlight" && b.id !== leadStory?.id);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans selection:bg-slate-900 selection:text-white pb-16">
      {/* 1. TOP HEADER BAR (BECON LOGO ON LEFT) */}
      <header className="bg-slate-950 text-slate-200 py-3 px-4 sm:px-6 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
              B E C O N
            </h1>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden sm:inline">
              THE DAILY DEVELOPER GAZETTE
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] sm:text-xs">
              {todayDate}
            </span>
            <span className="text-slate-400 font-semibold hidden md:inline border-l border-slate-700 pl-4 uppercase tracking-wider text-[11px]">
              EDITION: DEVELOPER INTELLIGENCE
            </span>
          </div>
        </div>
      </header>

      {/* 2. EDITION INDEX RIBBON (ALL SIGNALS IN ONE VIEW) */}
      <div className="bg-white border-b-2 border-slate-900 px-4 sm:px-6 py-2 shadow-2xs">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 font-mono text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-slate-900 font-black mr-2 shrink-0 flex items-center gap-1.5">
              <span>📰 EDITION COVERAGE:</span>
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              REACT ARCHITECTURE
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              FRONTEND SYSTEMS
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              BACKEND & APIS
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              .NET CORE
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              DEVOPS & CLOUD
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              SECURITY & AI
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              KUBERNETES
            </span>
            <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
              DATABASES
            </span>
          </div>
          <div className="text-slate-500 font-semibold hidden xl:flex items-center gap-1.5 shrink-0 text-[10px] tracking-widest">
            <span>FULL BROADSHEET VIEW</span>
            <span>•</span>
            <span>TOP PRIORITY RANKED SIGNALS</span>
          </div>
        </div>
      </div>

      {/* 3. MULTI-COLUMN HIGH-DENSITY BROADSHEET WITH INDEPENDENT COLUMN DECK SCROLLING */}
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 mt-6">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-pulse">
            <div className="h-[750px] bg-slate-200/60 rounded-xl border border-slate-300"></div>
            <div className="lg:col-span-2 h-[750px] bg-slate-200/60 rounded-xl border border-slate-300"></div>
            <div className="h-[750px] bg-slate-200/60 rounded-xl border border-slate-300"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 lg:divide-x lg:divide-slate-300 gap-y-10 lg:gap-x-0">
            
            {/* COLUMN 1: QUICK WIRE SIGNALS (25% SCREEN WIDTH - REGULAR TACTICAL NEWS) */}
            <section className="lg:col-span-1 lg:pr-5 flex flex-col justify-start lg:h-[calc(100vh-135px)] lg:overflow-y-auto pb-12">
              <div className="border-b-2 border-slate-900 pb-2 mb-4 flex items-center justify-between font-mono sticky top-0 bg-[#FAF8F5]/95 backdrop-blur-md z-10 pt-1">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950 flex items-center gap-1.5">
                  📡 THE QUICK WIRE
                </span>
                <span className="text-[10px] font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded uppercase">
                  REGULAR NEWS
                </span>
              </div>
              <div className="space-y-4">
                {briefStories.map((card) => renderBriefCard(card, getActionBadgeColor, setSelectedCard))}
              </div>
            </section>

            {/* COLUMNS 2 & 3: CENTER DECK (50% SCREEN WIDTH - HIGH PRIORITY ARCHITECTURAL NEWS) */}
            <section className="lg:col-span-2 lg:px-6 flex flex-col justify-start space-y-8 lg:h-[calc(100vh-135px)] lg:overflow-y-auto pb-12">
              {/* LEAD STORY (HIGHEST PRIORITY) */}
              {leadStory && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b-2 border-slate-900 pb-2 font-mono sticky top-0 bg-[#FAF8F5]/95 backdrop-blur-md z-10 pt-1">
                    <span className="px-2.5 py-0.5 rounded-sm text-xs font-black tracking-wider uppercase bg-rose-600 text-white shadow-xs">
                      🔥 LEAD ARCHITECTURAL STORY
                    </span>
                    <span className="text-slate-500 text-[11px] sm:text-xs font-bold uppercase">
                      • HIGH IMPACT DAILY SIGNAL
                    </span>
                  </div>
                  {renderLeadCard(leadStory, getActionBadgeColor, setSelectedCard)}
                </div>
              )}

              {/* MAJOR FEATURE STORIES (CORE ARCHITECTURAL UPDATES IN 2x2 GRID) */}
              {majorStories.length > 0 && (
                <div>
                  <div className="border-t-2 border-slate-900 pt-3 mb-4 flex flex-wrap items-center justify-between font-mono gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950">
                      📰 MAJOR SYSTEM ARCHITECTURE REPORTS
                    </span>
                    <span className="text-[11px] font-bold bg-amber-100 text-amber-950 px-2.5 py-0.5 rounded uppercase border border-amber-300">
                      CORE ENGINE UPDATES
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {majorStories.map((card) =>
                      renderMajorCard(card, getActionBadgeColor, setSelectedCard)
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* COLUMN 4: DEEP TECH WATCH & SPOTLIGHTS (25% SCREEN WIDTH - MEDIUM PRIORITY) */}
            <section className="lg:col-span-1 lg:pl-5 flex flex-col justify-start lg:h-[calc(100vh-135px)] lg:overflow-y-auto pb-12">
              <div className="border-b-2 border-slate-900 pb-2 mb-4 flex items-center justify-between font-mono sticky top-0 bg-[#FAF8F5]/95 backdrop-blur-md z-10 pt-1">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950 flex items-center gap-1">
                  🛠️ SYSTEM WATCH
                </span>
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-950 border border-indigo-200 px-2 py-0.5 rounded uppercase">
                  DEEP TECH TAKES
                </span>
              </div>
              <div className="space-y-5">
                {watchStories[0] && renderMajorCard(watchStories[0], getActionBadgeColor, setSelectedCard)}
                {spotlightStories[0] && renderSpotlightCard(spotlightStories[0], getActionBadgeColor, setSelectedCard)}
                {watchStories[1] && renderMajorCard(watchStories[1], getActionBadgeColor, setSelectedCard)}
                {spotlightStories[1] && renderSpotlightCard(spotlightStories[1], getActionBadgeColor, setSelectedCard)}
                {watchStories[2] && renderMajorCard(watchStories[2], getActionBadgeColor, setSelectedCard)}
              </div>
            </section>

          </div>
        )}
      </main>

      {/* 4. DEEP DETAILS MODAL / DRAWER (DISPLAYS ENRICHED NARRATIVE, CODE & MEDIA WITHOUT 4-POINT BULLET REPETITION) */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-10 relative text-slate-800">
            <button
              onClick={() => setSelectedCard(null)}
              className="absolute top-6 right-6 text-slate-500 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded-lg font-mono text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>✕ Close Detail</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 mb-4 pr-32">
              {selectedCard.target_stack.map((t) => (
                <span key={t} className="text-xs font-black px-3 py-1 rounded bg-slate-900 text-amber-300 uppercase font-mono tracking-wider shadow-2xs">
                  #{t}
                </span>
              ))}
              <span className="text-xs font-mono text-slate-500 font-bold tracking-wider">• DEEP ARCHITECTURAL INVESTIGATION</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-serif text-slate-950 tracking-tight leading-tight mb-6">
              {selectedCard.title}
            </h2>

            {/* NARRATIVE DESCRIPTION (DEEP DIVE TEXT WITHOUT THE 4-POINT ACTION CARD REPETITION) */}
            <div className="space-y-6 text-slate-700 leading-relaxed font-normal text-sm sm:text-base">
              <div className="p-4 rounded-xl bg-slate-50 border-l-4 border-indigo-600 font-medium text-slate-900 text-base sm:text-lg shadow-2xs">
                {selectedCard.card_content.why_it_matters}
              </div>
              
              <div className="space-y-4 text-slate-800 leading-relaxed">
                <p>
                  {selectedCard.deep_detail?.full_description ??
                    "In recent enterprise telemetry analyses and real-world infrastructure stress testing, industry leads uncovered vital patterns influencing this stack component. Relying on legacy configurations or default setups exposes systems to performance bottlenecks, unnecessary compute expenditure, and edge maintenance friction during large-scale operations."}
                </p>
                <p>
                  Transitioning to modern best practices in this area involves decoupling synchronous blockers and shifting verification steps earlier into automated CI/CD validation gates. By restructuring data boundaries and adopting asynchronous primitives, development teams experience smoother local iteration cycles and significantly greater operational resilience under high concurrency loads.
                </p>
              </div>

              {/* INTERACTIVE CODE / IMPLEMENTATION EXAMPLE (WHEN PRESENT) */}
              {selectedCard.deep_detail?.code_snippet && (
                <div className="rounded-xl bg-slate-950 text-slate-100 p-5 sm:p-6 font-mono text-xs sm:text-sm overflow-x-auto my-6 border border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold pb-2.5 mb-3 border-b border-slate-800 uppercase tracking-widest">
                    <span className="text-emerald-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      {selectedCard.deep_detail.code_snippet.language} Implementation Pattern
                    </span>
                    <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">PRODUCTION READY</span>
                  </div>
                  <pre className="leading-relaxed text-slate-200"><code>{selectedCard.deep_detail.code_snippet.code}</code></pre>
                </div>
              )}

              {/* ARCHITECTURAL DIAGRAM / MEDIA EMBED (WHEN PRESENT) */}
              {selectedCard.deep_detail?.has_visual_diagram && (
                <div className="my-6 rounded-xl overflow-hidden border-2 border-slate-800 shadow-md bg-slate-950 text-white">
                  <div className="bg-slate-900 px-5 py-2.5 font-mono text-xs font-black text-slate-300 border-b border-slate-800 flex items-center justify-between uppercase tracking-wider">
                    <span>📐 {selectedCard.deep_detail.diagram_title ?? "System Architecture Diagram"}</span>
                    <span className="text-amber-400 font-bold">LIVE TELEMETRY VIEW</span>
                  </div>
                  <div className="h-56 sm:h-72 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-8 text-center border-t border-slate-800/60 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:16px_16px]"></div>
                    <span className="text-4xl mb-3 z-10">📊 ⚡ 🛡️</span>
                    <h4 className="text-white text-base sm:text-lg font-bold mb-1 z-10 font-serif">{selectedCard.title}</h4>
                    <p className="text-slate-400 text-xs sm:text-sm max-w-md z-10 font-mono">
                      [Interactive Vector Topology & Throughput Optimization Curve — Simulated Media Player]
                    </p>
                    <div className="mt-4 px-4 py-1.5 rounded-full bg-indigo-600/30 border border-indigo-400/50 text-indigo-300 text-[11px] font-mono font-bold z-10 flex items-center gap-2">
                      <span>▶ Watch 4-Minute Engineering Walkthrough Video</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t-2 border-slate-200 flex flex-wrap items-center justify-between gap-4 font-mono">
              <a
                href={selectedCard.source_url}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-sm tracking-wider"
              >
                Read Full Original Documentation ↗
              </a>
              <button
                onClick={() => setSelectedCard(null)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-all tracking-wider cursor-pointer border border-slate-300"
              >
                Return to Gazette News Feed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* RENDER HELPER 1: LEAD STORY CARD */
function renderLeadCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void
) {
  return (
    <article key={card.id} className="rounded-xl bg-white border-2 border-slate-900 p-6 sm:p-8 shadow-md flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {card.rank !== undefined && (
              <span className="text-xs sm:text-sm font-black px-2.5 py-0.5 rounded-md bg-slate-950 text-amber-300 border border-slate-800 uppercase tracking-wider font-mono shadow-xs">
                #{String(card.rank).padStart(2, "0")}
              </span>
            )}
            {card.target_stack.map((tag) => (
              <span key={tag} className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 uppercase tracking-wider font-mono">
                #{tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onOpenDetail(card)}
              className="text-xs font-black text-indigo-700 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md font-mono transition-all cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <span>Deep Detail</span>
              <span>⤢</span>
            </button>
            <a href={card.source_url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-950 font-bold flex items-center gap-1 font-mono transition-colors underline decoration-slate-300 underline-offset-4 shrink-0">
              Origin Source ↗
            </a>
          </div>
        </div>

        <h3 className="text-2xl sm:text-3xl xl:text-4xl font-black text-slate-950 font-serif tracking-tight leading-tight mb-6">
          {card.title}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/90">
            <div className="text-slate-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-2.5">
              📌 WHAT HAPPENED
            </div>
            <ul className="space-y-2 text-slate-700 text-xs sm:text-sm list-disc list-inside leading-relaxed">
              {card.card_content.what_happened.map((bullet, idx) => (
                <li key={idx} className="text-slate-600">
                  <span className="text-slate-800 font-medium">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/90">
              <div className="text-indigo-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-2">
                💡 WHY IT MATTERS
              </div>
              <p className="text-slate-700 text-xs sm:text-sm leading-relaxed font-medium">
                {card.card_content.why_it_matters}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-emerald-50/80 border border-emerald-200/80">
              <div className="text-emerald-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-1.5">
                👤 IMPACT ON YOUR ROLE ({card.target_role.toUpperCase()})
              </div>
              <p className="text-emerald-950 text-xs sm:text-sm leading-relaxed font-medium">
                {card.card_content.how_it_affects_you}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4.5 rounded-lg bg-amber-50/90 border border-amber-300/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-amber-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-1 flex items-center gap-1.5">
              🎯 ACTION PROTOCOL
            </div>
            <p className="text-slate-900 text-xs sm:text-sm font-semibold leading-relaxed">
              {card.card_content.what_to_do_next.guidance}
            </p>
          </div>
          <span className={`text-[11px] px-3 py-1 rounded-full border uppercase tracking-widest shrink-0 font-mono ${getBadgeColor(card.card_content.what_to_do_next.action_type)}`}>
            {card.card_content.what_to_do_next.action_type}
          </span>
        </div>
      </div>
    </article>
  );
}

/* RENDER HELPER 2: MAJOR & WATCH FEATURE CARDS */
function renderMajorCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void
) {
  return (
    <article key={card.id} className="rounded-xl bg-white border border-slate-200 p-5 shadow-xs hover:border-slate-400 transition-all flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.rank !== undefined && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-950 text-amber-300 border border-slate-800 uppercase tracking-wider font-mono">
                #{String(card.rank).padStart(2, "0")}
              </span>
            )}
            {card.target_stack.map((tag) => (
              <span key={tag} className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200/80 uppercase tracking-wider font-mono">
                #{tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onOpenDetail(card)}
              className="text-[10px] font-black text-indigo-700 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded font-mono transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <span>Details</span>
              <span>⤢</span>
            </button>
            <a href={card.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-slate-900 font-bold font-mono transition-colors shrink-0">
              Source ↗
            </a>
          </div>
        </div>

        <h3 className="text-lg font-bold font-serif text-slate-950 leading-snug mb-3">
          {card.title}
        </h3>

        <div className="space-y-2.5 mb-4">
          <div className="p-3 rounded bg-slate-50 border border-slate-200/80 text-xs">
            <span className="font-extrabold text-slate-900 uppercase font-mono block mb-1">📌 What Happened</span>
            <p className="text-slate-700 leading-normal font-medium">{card.card_content.what_happened[0]}</p>
          </div>
          
          <div className="p-3 rounded bg-slate-50 border border-slate-200/80 text-xs">
            <span className="font-extrabold text-indigo-900 uppercase font-mono block mb-1">💡 Why It Matters</span>
            <p className="text-slate-700 leading-normal font-medium">{card.card_content.why_it_matters}</p>
          </div>
        </div>
      </div>

      <div className="p-3 rounded bg-amber-50/80 border border-amber-200/80 flex items-center justify-between gap-3 text-xs mt-auto">
        <div>
          <span className="font-extrabold text-amber-950 uppercase font-mono text-[10px] block">🎯 Next Step</span>
          <p className="text-slate-800 text-xs font-semibold line-clamp-2">{card.card_content.what_to_do_next.guidance}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded border uppercase shrink-0 font-mono ${getBadgeColor(card.card_content.what_to_do_next.action_type)}`}>
          {card.card_content.what_to_do_next.action_type}
        </span>
      </div>
    </article>
  );
}

/* RENDER HELPER 3: BRIEF WIRE CARDS (SIDEBAR) */
function renderBriefCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void
) {
  return (
    <article key={card.id} className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs hover:border-slate-400 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 truncate">
            {card.rank !== undefined && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 font-mono shrink-0">
                #{String(card.rank).padStart(2, "0")}
              </span>
            )}
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase tracking-wider font-mono truncate">
              #{card.target_stack[0]}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onOpenDetail(card)}
              className="text-[10px] font-extrabold text-indigo-700 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 px-2 py-0.5 rounded font-mono transition-all cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <span>Details</span>
              <span>⤢</span>
            </button>
            <a href={card.source_url} target="_blank" rel="noreferrer" className="text-[10px] text-slate-400 hover:text-slate-900 font-bold font-mono shrink-0">
              Source ↗
            </a>
          </div>
        </div>
        <h3 className="text-sm sm:text-base font-extrabold font-serif text-slate-950 hover:text-indigo-900 transition-colors leading-snug mb-2">
          {card.title}
        </h3>
        <p className="text-xs text-slate-600 line-clamp-3 leading-normal font-medium mb-3">
          {card.card_content.why_it_matters}
        </p>
      </div>
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-700 truncate">
          👉 {card.card_content.what_to_do_next.guidance}
        </span>
        <span className={`text-[9px] px-2 py-0.5 rounded border uppercase shrink-0 font-mono ${getBadgeColor(card.card_content.what_to_do_next.action_type)}`}>
          {card.card_content.what_to_do_next.action_type}
        </span>
      </div>
    </article>
  );
}

/* RENDER HELPER 4: SPOTLIGHT EDITORIAL ANALYSIS CARDS (RIGHT COLUMN) */
function renderSpotlightCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void
) {
  return (
    <article key={card.id} className="rounded-xl bg-slate-900 text-white p-5 shadow-md border border-slate-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between text-[10px] font-mono font-bold text-emerald-400 uppercase mb-2">
          <span className="flex items-center gap-1.5">
            {card.rank !== undefined && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono">
                #{String(card.rank).padStart(2, "0")}
              </span>
            )}
            <span>💡 ARCHITECTURAL SPOTLIGHT</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenDetail(card)}
              className="text-[9px] font-black text-amber-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 rounded font-mono transition-all cursor-pointer flex items-center gap-1"
            >
              <span>Details</span>
              <span>⤢</span>
            </button>
            <span>#{card.target_stack[0]}</span>
          </div>
        </div>
        <h3 className="text-base font-bold font-serif text-white leading-snug mb-2">
          {card.title}
        </h3>
        <p className="text-slate-300 text-xs leading-relaxed font-normal mb-4">
          {card.card_content.why_it_matters}
        </p>
      </div>
      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-300 font-medium truncate text-[11px]">
          Action: {card.card_content.what_to_do_next.guidance}
        </span>
        <span className={`text-[9px] px-2 py-0.5 rounded border uppercase shrink-0 font-mono ${getBadgeColor(card.card_content.what_to_do_next.action_type)}`}>
          {card.card_content.what_to_do_next.action_type}
        </span>
      </div>
    </article>
  );
}

/* EXPANSIVE BROADSHEET DATASET (16 ARTICLES) TO FULLY FILL ALL COLUMNS WITHOUT EMPTY SPACES */
function getBroadsheetCards(): BriefingCard[] {
  const cards: BriefingCard[] = [
    // 1 LEAD STORY (CENTER TOP)
    {
      id: "lead-1",
      title: "React Architecture Revolution: New Compilation & Runtime Standards Released",
      source_url: "https://react.dev",
      target_role: "Frontend Architect",
      target_stack: ["React", "System Architecture"],
      priority: "lead",
      card_content: {
        what_happened: [
          "Major core update announced for enterprise React introducing zero-bundle overhead build-time compiler tuning.",
          "New built-in asynchronous component profiling tools replace legacy third-party diagnostic libraries.",
        ],
        why_it_matters:
          "Dramatically lowers JavaScript memory footprints in production while streamlining CI/CD deployment verification pipelines across large teams.",
        how_it_affects_you:
          "You will experience up to 40% faster local dev builds, eliminate manual memoization hooks, and get improved strict type checking when writing modular UI components.",
        what_to_do_next: {
          action_type: "prepare",
          guidance:
            "Audit existing project dependencies and schedule a sprint chore to benchmark your build pipeline against the new compiler flags.",
        },
      },
      deep_detail: {
        full_description:
          "The latest enterprise compiler iteration alters how frontend DOM diffing operations calculate state mutations. Historically, runtime reconciliation loops executed extensive virtual DOM equality comparisons whenever component parent trees triggered re-renders. Under this newly published compilation pipeline, static analyzer heuristics determine component immutability ahead of time during automated builds, effectively removing memoization boilerplate across large engineering teams.",
        has_visual_diagram: true,
        diagram_title: "Zero-Bundle Compiler vs Legacy Virtual DOM Diffing",
        code_snippet: {
          language: "TypeScript",
          code: `// ENTERPRISE ARCHITECTURE: Automated Compiler Transformation
// No manual React.memo(), useMemo(), or useCallback() wrappers required

export function EnterpriseDashboardMetrics({ telemetry, onRefresh }: MetricsProps) {
  // Automatically memorized during CI build step via JSX static analysis
  const aggregatedThroughput = telemetry.reduce((acc, metric) => acc + metric.p99Latency, 0);

  return (
    <section className="dashboard-grid">
      <TelemetryGauge value={aggregatedThroughput} />
      <button onClick={onRefresh} className="btn-refresh">Fetch Real-Time Signals</button>
    </section>
  );
}`,
        },
      },
    },

    // 4 MAJOR SYSTEM FEATURE STORIES (CENTER BOTTOM 2x2 GRID)
    {
      id: "major-1",
      title: ".NET Core & Backend: Enterprise Migration to Minimal APIs & Vertical Slices",
      source_url: "https://devblogs.microsoft.com",
      target_role: "Backend Engineer",
      target_stack: [".NET Core", "Backend", "Architecture"],
      priority: "major",
      card_content: {
        what_happened: [
          "Enterprise engineering teams are accelerating migration away from rigid N-tier architecture toward self-contained vertical slices with Minimal APIs.",
        ],
        why_it_matters:
          "Feature slicing isolates domain boundaries and minimizes middleware routing overhead, reducing P99 latency by over 25% under concurrency.",
        how_it_affects_you:
          "Your code structure will shift from grouping by technical layer (/controllers, /services) to domain feature folders with localized validators.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Refactor one legacy controller into a vertical feature slice utilizing endpoint filters.",
        },
      },
    },
    {
      id: "major-2",
      title: "DevOps & Infrastructure: Zero-Downtime Rolling Deploys & eBPF Observability",
      source_url: "https://kubernetes.io",
      target_role: "DevOps Architect",
      target_stack: ["DevOps", "Kubernetes", "Observability"],
      priority: "major",
      card_content: {
        what_happened: [
          "Kernel-level eBPF probes are rapidly replacing sidecar telemetry agents in high-load production clusters.",
        ],
        why_it_matters:
          "Eliminates container proxy CPU overhead while giving real-time network packet visibility during live blue/green canary deployments.",
        how_it_affects_you:
          "Cluster administrators no longer need to inject logging sidecars simply to get distributed request traces.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Evaluate modern eBPF networking telemetry tools in staging environments.",
        },
      },
    },
    {
      id: "major-3",
      title: "Frontend Performance Watch: Server Actions vs Client Bundle Pruning",
      source_url: "https://nextjs.org",
      target_role: "Fullstack Engineer",
      target_stack: ["Frontend", "Next.js", "Performance"],
      priority: "major",
      card_content: {
        what_happened: [
          "Recent case studies demonstrate a 60% reduction in hydration payloads when migrating form mutations to Server Actions.",
        ],
        why_it_matters:
          "Smaller client bundles significantly improve Core Web Vitals (INP and LCP), directly raising organic search visibility and user retention.",
        how_it_affects_you:
          "Client-side API fetching libraries and manual loading state boilerplate can be supplanted by progressive enhancement HTML patterns.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Migrate complex form submission components from REST mutations to server action handlers.",
        },
      },
    },
    {
      id: "major-4",
      title: "Micro-Frontend Systems: Module Federation 2.0 & Static Synthesis",
      source_url: "https://webpack.js.org",
      target_role: "System Architect",
      target_stack: ["Micro-Frontends", "Webpack", "Vite"],
      priority: "major",
      card_content: {
        what_happened: [
          "Module Federation updates now allow runtime shared dependency version consolidation without full page reload deadlocks.",
        ],
        why_it_matters:
          "Allows autonomous engineering squads to deploy individual UI widgets to production without risking global framework version mismatches.",
        how_it_affects_you:
          "Shared Design System components will dynamically negotiate singleton instance execution across independent sub-application shells.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Review shared library exclusion patterns in your bundler configuration.",
        },
      },
    },

    // 3 DEEP TECH WATCH STORIES (RIGHT COLUMN)
    {
      id: "watch-1",
      title: "Kubernetes Security Audit: Zero-Trust Network Meshes & mTLS Enforcement",
      source_url: "https://cncf.io",
      target_role: "Security Engineer",
      target_stack: ["Security", "Kubernetes"],
      priority: "watch",
      card_content: {
        what_happened: [
          "CNCF security guidelines now strongly mandate strict mutual TLS (mTLS) enforcement at the CNI layer rather than app proxies.",
        ],
        why_it_matters:
          "Pre-empts lateral movement attacks across internal container networks even if an isolated application pod is compromised.",
        how_it_affects_you:
          "Application manifests must remove explicit plaintext HTTP debug ports from internal service YAML definitions.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Enforce default-deny network ingress policies in non-public cluster namespaces.",
        },
      },
    },
    {
      id: "watch-2",
      title: "Distributed Databases: Read-After-Write Consensus Benchmarks in Multi-Region Cloud",
      source_url: "https://jepsen.io",
      target_role: "Database Architect",
      target_stack: ["Databases", "Distributed Systems"],
      priority: "watch",
      card_content: {
        what_happened: [
          "Recent benchmarks reveal significant latency variances when utilizing quorum-based replication protocols across inter-continental cloud AZs.",
        ],
        why_it_matters:
          "Choosing strict linearizability over causal consistency can increase cross-region API database write durations by up to 180ms.",
        how_it_affects_you:
          "Data modeling must explicitly segregate eventual consistency analytics logs from real-time transactional financial ledgers.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Audit read-consistency configurations in high-frequency user profile query endpoints.",
        },
      },
    },
    {
      id: "watch-3",
      title: "Rust in the Backend: High-Throughput WebSockets with Memory Safety Guarantees",
      source_url: "https://tokio.rs",
      target_role: "Systems Engineer",
      target_stack: ["Rust", "Async IO", "Backend"],
      priority: "watch",
      card_content: {
        what_happened: [
          "Adoption of asynchronous Tokio-based web event engines continues to overtake Node.js and Go in real-time streaming architectures.",
        ],
        why_it_matters:
          "Rust eliminates garbage collection pauses entirely, delivering flat 99.9th percentile latency curves even under 500k simultaneous WebSocket connections.",
        how_it_affects_you:
          "Teams building real-time collaboration or streaming pipelines will benefit from migrating socket gateways to Rust micro-binaries.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Prototype an asynchronous TCP routing gateway using native async/await bindings.",
        },
      },
    },

    // 2 SPOTLIGHT EDITORIAL TAKES (MIXED INTO RIGHT COLUMN TO REFILL EMPTY SPACE)
    {
      id: "spotlight-1",
      title: "Editorial Spotlight: Async Event-Driven Resiliency vs Synchronous REST APIs",
      source_url: "https://martinfowler.com",
      target_role: "Chief Architect",
      target_stack: ["Enterprise", "Event-Driven"],
      priority: "spotlight",
      card_content: {
        what_happened: ["Synchronous chain-of-REST service communication remains the #1 cause of enterprise cascading outages."],
        why_it_matters: "By decoupling inter-service orchestration with asynchronous message brokers, systems retain high availability even when downstream dependencies degrade.",
        how_it_affects_you: "Architects should mandate circuit breaker patterns on all external HTTP invocations.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Implement outbox messaging queues for non-blocking database state transitions.",
        },
      },
    },
    {
      id: "spotlight-2",
      title: "AI Cost Optimization: Local Vector Indexing vs Heavy LLM API Cloud Invocations",
      source_url: "https://openai.com",
      target_role: "AI Architect",
      target_stack: ["AI Systems", "Cost Optimization"],
      priority: "spotlight",
      card_content: {
        what_happened: ["Cloud embedding API overhead increases exponentially with real-time keystroke user semantic filtering."],
        why_it_matters: "Executing lightweight localized embedding similarity calculations inside client browsers cuts recurring token server expenses by over 80%.",
        how_it_affects_you: "Frontend interfaces can provide instantaneous semantic autocomplete without network requests.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Test WASM vector indexing plugins for real-time table sorting.",
        },
      },
    },

    // 8 QUICK WIRE STORIES (LEFT COLUMN - COMPLETE PACKED FEED TO PREVENT BOTTOM VOIDS)
    {
      id: "brief-1",
      title: "Security Bulletin: JWT Token Lifecycle Middleware Vulnerability Mitigated",
      source_url: "https://github.com",
      target_role: "Security Engineer",
      target_stack: ["Security", "Backend"],
      priority: "brief",
      card_content: {
        what_happened: ["Audit reports highlight race conditions when verifying unexpired refresh tokens under asynchronous burst loads."],
        why_it_matters: "Unoptimized synchronous cryptographic decoding in event loops can cause request blocking and transient P99 timeouts.",
        how_it_affects_you: "Authentication gateway layers require upgrading to native asynchronous cryptographic verification helpers.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Move token validation into centralized gateway middlewares with async hashing.",
        },
      },
      deep_detail: {
        full_description:
          "Enterprise authentication audits recently uncovered a widespread cryptographic blocking vulnerability occurring when OAuth2 and JWT validation middlewares parse high-concurrency refresh token rotations. Because traditional cryptographic verification libraries often execute synchronous CPU-intensive decoding loops directly on main event threads, high-frequency request spikes introduce transient thread starvation, increasing P99 request latency and causing cascading timeout errors across dependent microservices.",
        has_visual_diagram: true,
        diagram_title: "Async Gateway Auth Middleware vs Sync Blocking Event Loop",
        code_snippet: {
          language: "TypeScript",
          code: `// MITIGATED MIDDLEWARE ARCHITECTURE: Asynchronous JWT Verification
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS_URI = new URL('https://auth.becon.dev/.well-known/jwks.json');
const JWKS = createRemoteJWKSet(JWKS_URI, { cacheMaxAge: 3600000 });

export async function authGatewayMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  try {
    // Non-blocking async verification utilizing Web Crypto API worker thread pools
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://auth.becon.dev',
      audience: 'becon-enterprise-api',
    });
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(403).json({ error: "Token expired or cryptographic mismatch" });
  }
}`,
        },
      },
    },
    {
      id: "brief-2",
      title: "Angular 19 Release: Zoneless Change Detection Reaches Production Readiness",
      source_url: "https://angular.dev",
      target_role: "Frontend Engineer",
      target_stack: ["Angular", "Frontend"],
      priority: "brief",
      card_content: {
        what_happened: ["Angular formally endorses Signals as default reactive primitive, allowing developers to deprecate zone.js."],
        why_it_matters: "Removing zone.js cuts core framework bundle sizes and produces predictable, highly targeted UI DOM rerenders.",
        how_it_affects_you: "New Angular services should default to Signal inputs, computed values, and effect handlers.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Experiment with enableZonelessChangeDetection in newest frontend modules.",
        },
      },
    },
    {
      id: "brief-3",
      title: "AI Architecture Engineering: Caching Local Embeddings with WebAssembly & SQLite",
      source_url: "https://sqlite.org",
      target_role: "AI Engineer",
      target_stack: ["AI Systems", "WebAssembly"],
      priority: "brief",
      card_content: {
        what_happened: ["New in-browser WASM vector search extensions allow client apps to perform similarity searches with zero server latency."],
        why_it_matters: "Offloading vector embeddings to client storage reduces LLM API server costs and delivers instant local autocompletion.",
        how_it_affects_you: "Offline-capable semantic search filters can live directly inside high-density web apps.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Benchmark local browser WASM SQLite extensions with vector plugins.",
        },
      },
    },
    {
      id: "brief-4",
      title: "Cloud Infrastructure: Serverless Cold-Start Tuning with Native Rust Compilers",
      source_url: "https://aws.amazon.com",
      target_role: "Cloud Engineer",
      target_stack: ["Cloud", "Rust"],
      priority: "brief",
      card_content: {
        what_happened: ["Runtime optimizations combining lightweight micro-VMs with Rust binaries achieve sub-5ms cold start initialization."],
        why_it_matters: "Eliminates latency penalties historically associated with serverless architectures in latency-sensitive endpoints.",
        how_it_affects_you: "Critical path authorization handlers benefit from cross-compiling lightweight Rust bindings.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Evaluate migrating slow serverless cloud routers to native binary builds.",
        },
      },
    },
    {
      id: "brief-5",
      title: "TypeScript 5.6 Release: Strict Type-Checking Enhancements & Nullish Refining",
      source_url: "https://www.typescriptlang.org",
      target_role: "Frontend Developer",
      target_stack: ["TypeScript", "Tooling"],
      priority: "brief",
      card_content: {
        what_happened: ["New TypeScript compiler releases catch accidental truthy evaluations and enhance generic iterator type inference."],
        why_it_matters: "Prevents subtle runtime null-reference exceptions in conditional logical branching and complex asynchronous array transformations.",
        how_it_affects_you: "CI validation pipelines will now accurately flag redundant null checks and dead code branches in compiler warnings.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Enable strict null checking flags across all frontend library configs.",
        },
      },
    },
    {
      id: "brief-6",
      title: "Containerization Trends: Rootless Podman vs Daemon-Based Docker Runtimes",
      source_url: "https://podman.io",
      target_role: "DevOps Specialist",
      target_stack: ["Docker", "Containers", "DevOps"],
      priority: "brief",
      card_content: {
        what_happened: ["Enterprise security compliance standards are pushing container executions away from root daemon architectures toward daemonless Podman CLI engines."],
        why_it_matters: "Running containers as unprivileged users eliminates container breakout risks on developer laptops and CI shared runner VMs.",
        how_it_affects_you: "Dockerfiles remain totally compatible, but build pipelines should transition to rootless OCI image builders.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Test executing localized docker-compose environments using alias podman-compose.",
        },
      },
    },
    {
      id: "brief-7",
      title: "GraphQL Caching Architecture: Automated Persisted Queries & Stale Revalidation",
      source_url: "https://graphql.org",
      target_role: "API Engineer",
      target_stack: ["GraphQL", "API Design"],
      priority: "brief",
      card_content: {
        what_happened: ["Modern GraphQL gateway servers now automatically transform verbose POST POST query strings into lightweight GET requests with cryptographic hash identifiers."],
        why_it_matters: "Enables standard edge HTTP CDN edge caching for complex GraphQL payloads, drastically dropping downstream database load.",
        how_it_affects_you: "Client application fetch headers must adopt persisted query validation protocol middleware.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Configure edge CDN cache-control headers on authenticated API read queries.",
        },
      },
    },
    {
      id: "brief-8",
      title: "PostgreSQL Database Mechanics: B-Tree vs GIN Index Performance Under Burst Writes",
      source_url: "https://postgresql.org",
      target_role: "Database Admin",
      target_stack: ["PostgreSQL", "Database"],
      priority: "brief",
      card_content: {
        what_happened: ["Production benchmarking shows over-indexing JSONB column fields with generalized inverted indexes (GIN) severely degrade transaction write speeds during peak insert traffic."],
        why_it_matters: "Unoptimized index maintenance overhead during massive concurrent batch inserts causes transaction pool starvation.",
        how_it_affects_you: "Developers should limit GIN indexing solely to frequently queried JSON key paths instead of indexing entire document blobs.",
        what_to_do_next: {
          action_type: "avoid",
          guidance: "Audit database schema definitions and drop unused wildcard JSONB column indexes.",
        },
      },
    },
  ];
  return cards.map((c, index) => ({
    ...c,
    rank: index < 10 ? index + 1 : undefined,
  }));
}

