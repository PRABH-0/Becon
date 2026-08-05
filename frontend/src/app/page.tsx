"use client";

import { useState, useEffect } from "react";

interface ActionGuidance {
  action_type: "learn" | "apply" | "avoid" | "prepare";
  guidance: string;
}

interface BriefingCardContent {
  what_happened: string[];
  why_it_matters: string;
  how_it_affects_you: string;
  what_to_do_next: ActionGuidance;
}

interface BriefingCard {
  id: string;
  title: string;
  source_url: string;
  target_role: string;
  target_stack: string[];
  card_content: BriefingCardContent;
}

const STACKS = ["Frontend", "Angular", "React", ".NET", "Backend", "DevOps"];

export default function Home() {
  const [selectedStack, setSelectedStack] = useState<string>("Frontend");
  const [briefings, setBriefings] = useState<BriefingCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchBriefings(selectedStack);
  }, [selectedStack]);

  const fetchBriefings = async (stack: string) => {
    setLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/briefings?stack=${stack}`);
      if (res.ok) {
        const data = await res.json();
        setBriefings(data);
      } else {
        setBriefings(getFallbackCards(stack));
      }
    } catch (err) {
      console.log("API offline, showing preview card", err);
      setBriefings(getFallbackCards(stack));
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case "apply":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "learn":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "avoid":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "prepare":
      default:
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25">
              B
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Becon
              </h1>
              <p className="text-xs text-slate-400">Distraction-Free AI Career Briefing</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            ● Live AI Daily Digest
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Intro Banner */}
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Your Personal Tech Briefing
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl">
            Only what matters for your stack — zero social media noise, structured with actionable next steps.
          </p>

          {/* Stack Filter Pills */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mr-1">
              Stack:
            </span>
            {STACKS.map((stack) => (
              <button
                key={stack}
                onClick={() => setSelectedStack(stack)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedStack === stack
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {stack}
              </button>
            ))}
          </div>
        </div>

        {/* Briefing Cards Feed */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800/80 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {briefings.map((card) => (
              <article
                key={card.id || card.title}
                className="rounded-2xl bg-slate-900/80 border border-slate-800/90 p-6 shadow-xl hover:border-slate-700/80 transition-all"
              >
                {/* Tags & Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {card.target_stack.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] px-2.5 py-0.5 rounded-md bg-slate-800 text-indigo-300 border border-slate-700/50 font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <a
                    href={card.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-400 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                  >
                    Read Source ↗
                  </a>
                </div>

                <h3 className="text-xl font-bold text-slate-100 mb-5 leading-snug">
                  {card.title}
                </h3>

                {/* 4-Part Structured Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. What Happened */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60">
                    <div className="flex items-center gap-2 mb-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
                      📌 What Happened
                    </div>
                    <ul className="space-y-1.5 text-slate-300 text-xs sm:text-sm list-disc list-inside">
                      {card.card_content.what_happened.map((bullet, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 2. Why It Matters */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60">
                    <div className="flex items-center gap-2 mb-2 text-purple-400 font-semibold text-xs uppercase tracking-wider">
                      💡 Why It Matters
                    </div>
                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                      {card.card_content.why_it_matters}
                    </p>
                  </div>

                  {/* 3. How It Affects You */}
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/30">
                    <div className="flex items-center gap-2 mb-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                      👤 How It Affects You
                    </div>
                    <p className="text-slate-200 text-xs sm:text-sm leading-relaxed">
                      {card.card_content.how_it_affects_you}
                    </p>
                  </div>

                  {/* 4. What To Do Next */}
                  <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/30 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-amber-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                          🎯 What To Do Next
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold tracking-wider ${getActionBadgeColor(
                            card.card_content.what_to_do_next.action_type
                          )}`}
                        >
                          {card.card_content.what_to_do_next.action_type}
                        </span>
                      </div>
                      <p className="text-slate-200 text-xs sm:text-sm leading-relaxed">
                        {card.card_content.what_to_do_next.guidance}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function getFallbackCards(stack: string): BriefingCard[] {
  return [
    {
      id: "preview-1",
      title: `${stack} Ecosystem Updates & New Architectural Guidance`,
      source_url: "https://blog.angular.dev",
      target_role: "Developer",
      target_stack: [stack, "TypeScript"],
      card_content: {
        what_happened: [
          `New release features performance enhancements and streamlined tooling for ${stack}.`,
          "Improved developer diagnostics and build pipeline optimization flags added."
        ],
        why_it_matters: "Reduces bundle overhead and fixes security patch vulnerabilities across production deployments.",
        how_it_affects_you: `Directly speeds up your local dev server startup and improves runtime performance for your ${stack} applications.`,
        what_to_do_next: {
          action_type: "prepare",
          guidance: `Review current project dependencies and test upgrading to the latest minor version in a feature branch.`
        }
      }
    }
  ];
}
