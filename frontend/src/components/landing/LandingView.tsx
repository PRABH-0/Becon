"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

type RoleCardKey = "frontend" | "devops" | "dotnet" | "finance";

interface SampleActionCard {
  role: string;
  category: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  actionType: "learn" | "apply" | "avoid" | "prepare";
  actionColor: string;
  whatHappened: string[];
  whyItMatters: string;
  howItAffectsYou: string;
  whatToDoNext: string;
}

const SAMPLE_CARDS: Record<RoleCardKey, SampleActionCard> = {
  frontend: {
    role: "Senior Frontend Engineer",
    category: "React & Next.js Systems",
    title: "Next.js App Router: Dynamic Request APIs Switched to Asynchronous Promises",
    sourceUrl: "https://nextjs.org/blog",
    sourceName: "Next.js Official Releases",
    actionType: "prepare",
    actionColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700/60",
    whatHappened: [
      "Dynamic functions including cookies(), headers(), params, and searchParams now return Promises instead of synchronous objects.",
      "Synchronous access triggers runtime deprecation warnings in current versions and will throw errors in upcoming releases.",
    ],
    whyItMatters:
      "Aligns Next.js with modern streaming server rendering architectures and opt-in partial prerendering (PPR) models.",
    howItAffectsYou:
      "Any shared layout, auth guard, or utility function directly reading cookies() without 'await' will break during major version upgrades.",
    whatToDoNext:
      "Prepare: Run the automated Next.js codemod across your repository to asynchronously await request headers and cookies.",
  },
  devops: {
    role: "Cloud Architect & DevOps",
    category: "Kubernetes & Cloud Infrastructure",
    title: "Kubernetes Retires In-Tree Cloud Controller Managers in Favor of Out-of-Tree Plugins",
    sourceUrl: "https://kubernetes.io/blog",
    sourceName: "Kubernetes Official Engineering",
    actionType: "avoid",
    actionColor: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-700/60",
    whatHappened: [
      "Legacy cloud-provider integration flags (--cloud-provider=aws|azure|gcp) are completely disabled in new cluster control planes.",
      "All cloud-specific volume plugins and route synchronizers now require external Cloud Controller Manager (CCM) daemonsets.",
    ],
    whyItMatters:
      "Decouples Kubernetes core release cadence from third-party cloud SDK upgrades and drastically decreases kubelet binary footprint.",
    howItAffectsYou:
      "Spinning up self-managed control plane nodes using outdated Terraform modules will crash kube-apiserver on cluster boot.",
    whatToDoNext:
      "Avoid: Do not deploy unpinned k8s worker nodegroups without verifying external CCM daemonset manifests are deployed first.",
  },
  dotnet: {
    role: "Senior .NET & Microservices Lead",
    category: ".NET Core & C# Architecture",
    title: "Apple Deprecates Legacy App Lifecycle in Favor of Scene-Based Initialization",
    sourceUrl: "https://devblogs.microsoft.com/dotnet/",
    sourceName: "Microsoft .NET Blog",
    actionType: "apply",
    actionColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/60",
    whatHappened: [
      "Apple is transitioning all iOS application startup code to scene-based delegate architectures.",
      "Legacy AppDelegate lifecycle hooks are marked for deprecation in forthcoming Xcode minimum requirement builds.",
    ],
    whyItMatters:
      "Enables multi-window application state persistence and decouples window orchestration from root application process boot.",
    howItAffectsYou:
      "Your .NET MAUI iOS project requires a manual configuration migration to maintain compatibility with new App Store submission rules.",
    whatToDoNext:
      "Apply: Update your MauiProgram.cs and iOS scene delegate hooks before your team's next Xcode SDK rollout.",
  },
  finance: {
    role: "Financial Analyst & Corporate Accountant",
    category: "Tax Regulations & GST Compliance",
    title: "New E-Invoicing Threshold and Automated ITC Reversal Directives Released",
    sourceUrl: "https://gst.gov.in",
    sourceName: "GST & Tax Regulatory Council",
    actionType: "apply",
    actionColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/60",
    whatHappened: [
      "Regulatory council establishes mandatory real-time electronic invoice generation for all B2B transactions above revised revenue limits.",
      "Automated matching rules enforce instant Input Tax Credit (ITC) blocks on mismatched supplier GSTR-1 filings.",
    ],
    whyItMatters:
      "Closes compliance loopholes and eliminates manual reconciliation delays between monthly purchasing ledgers.",
    howItAffectsYou:
      "Accounts receivable and ERP systems must validate IRN portal tokens in real time before releasing shipment dispatch documents.",
    whatToDoNext:
      "Apply: Audit your ERP accounting integration endpoints and configure automatic supplier reconciliation alerts.",
  },
};

export function LandingView() {
  const [selectedRole, setSelectedRole] = useState<RoleCardKey>("frontend");
  const [guestLoading, setGuestLoading] = useState<boolean>(false);
  const { signInAsGuest } = useAuth();
  const router = useRouter();

  const currentCard = SAMPLE_CARDS[selectedRole];

  const handleGuestExplore = async () => {
    setGuestLoading(true);
    try {
      const { error } = await signInAsGuest();
      if (!error) {
        router.push("/onboarding");
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col selection:bg-slate-900 selection:text-white transition-colors duration-200">
      {/* 1. EDITORIAL HEADER */}
      <header className="bg-slate-950 text-slate-200 py-3.5 px-4 sm:px-6 border-b border-slate-800 sticky top-0 z-50 backdrop-blur-md bg-opacity-95 shadow-md">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-85 transition-opacity" id="landing-logo-link">
              <h1 className="font-serif text-2xl sm:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden sm:inline">
              THE ENGINEER&apos;S DAILY GAZETTE
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono">
            <Link
              href="/about"
              className="text-slate-300 hover:text-white transition-colors hidden md:inline"
            >
              Manifesto
            </Link>
            <Link
              href="/login"
              className="text-slate-300 hover:text-white transition-colors"
              id="landing-signin-link"
            >
              Sign In
            </Link>
            <ThemeToggle />
            <Link
              href="/register"
              id="landing-header-cta"
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs"
            >
              Start Reading <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <main id="main-content" className="flex-1">
      <section className="relative border-b border-slate-200 dark:border-slate-800/80 pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-[1000px] mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 dark:bg-slate-800 text-slate-300 text-xs font-mono font-semibold uppercase tracking-wider shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Editorial-First Developer Intelligence</span>
          </div>

          <h2
            data-testid="landing-tagline"
            className="font-serif text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-slate-50 tracking-tight leading-[1.12]"
          >
            Your stack changed overnight.
            <br />
            <span className="text-emerald-700 dark:text-emerald-400">
              Becon tells you what to do about it.
            </span>
          </h2>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
            No algorithmic feeds, no influencer engagement bait. Every morning, 5 to 10 verified cards synthesized directly from official release notes and CVE advisories, translated into clear tactical actions.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <Link
              href="/register"
              id="landing-hero-signup-cta"
              data-testid="landing-hero-signup-cta"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold text-sm sm:text-base shadow-md transition-all cursor-pointer font-mono uppercase tracking-wider"
            >
              Create Free Account <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={handleGuestExplore}
              disabled={guestLoading}
              id="landing-hero-guest-btn"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-sm sm:text-base shadow-2xs transition-colors cursor-pointer font-mono"
            >
              {guestLoading ? "Opening Gazette..." : "Explore as Guest"}
            </button>
          </div>

          <div className="flex items-center justify-center gap-6 text-xs font-mono text-slate-500 dark:text-slate-400 pt-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Finite Daily Edition
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Strict Fact Grounding
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Zero Ad Tracking
            </span>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE 4-PART ACTION CARD DEMO */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 bg-white/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1100px] mx-auto space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Interactive Blueprint
            </span>
            <h3 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
              The 4-Part Action Card Structure
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              Every card answers four essential questions with no fluff. Select a role below to preview live editorial cards.
            </p>
          </div>

          {/* Role selector tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2" role="tablist">
            {(
              [
                ["frontend", "Frontend Engineer"],
                ["devops", "Cloud & DevOps"],
                ["dotnet", ".NET Architect"],
                ["finance", "Financial Systems"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selectedRole === key}
                onClick={() => setSelectedRole(key)}
                className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedRole === key
                    ? "bg-slate-950 dark:bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Action Card Demo View */}
          <div className="max-w-3xl mx-auto rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-[#FAF8F5] dark:bg-[#070b12] shadow-xl overflow-hidden">
            {/* Card Header Bar */}
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {`${currentCard.category} // ${currentCard.role}`}
                </span>
                <span
                  className={`text-[11px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border ${currentCard.actionColor}`}
                >
                  {currentCard.actionType}
                </span>
              </div>
              <h4 className="font-serif text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                {currentCard.title}
              </h4>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span>Source: {currentCard.sourceName}</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </div>
            </div>

            {/* The 4-Part Body */}
            <div className="p-4 sm:p-6 space-y-5 text-xs sm:text-sm">
              {/* 1. What Happened */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center text-[11px]">
                    1
                  </span>
                  <span>What Happened</span>
                </div>
                <ul className="list-disc pl-8 space-y-1 text-slate-700 dark:text-slate-300">
                  {currentCard.whatHappened.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </div>

              {/* 2. Why It Matters */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center text-[11px]">
                    2
                  </span>
                  <span>Why It Matters</span>
                </div>
                <p className="pl-7 text-slate-700 dark:text-slate-300 leading-relaxed">
                  {currentCard.whyItMatters}
                </p>
              </div>

              {/* 3. How It Affects You */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center text-[11px]">
                    3
                  </span>
                  <span>How It Affects You</span>
                </div>
                <p className="pl-7 text-slate-700 dark:text-slate-300 leading-relaxed">
                  {currentCard.howItAffectsYou}
                </p>
              </div>

              {/* 4. What To Do Next */}
              <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]">
                      4
                    </span>
                    <span>What To Do Next</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase font-bold text-amber-400">
                    Tactical Directive
                  </span>
                </div>
                <p className="pl-7 text-xs sm:text-sm text-slate-100 leading-relaxed">
                  {currentCard.whatToDoNext}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. WHY BECON: THREE PILLARS */}
      <section className="py-14 sm:py-20 px-4 sm:px-6">
        <div className="max-w-[1100px] mx-auto grid sm:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h4 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
              Built For Depth, Not Dopamine
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Finite editions mean zero infinite scrolling. Read your 10 cards in 3 minutes, understand your risks, and get back to writing code.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
              Grounded In Source Truth
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every synthesized claim is verified against official release text hashes. Unverified or hallucinated claims are rejected automatically.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h4 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
              Tailored To Your Stack
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Select your profession and stack focus topics. Becon filters thousands of daily changelogs down to the updates that actually break your code.
            </p>
          </div>
        </div>
      </section>

      {/* 5. BOTTOM CTA */}
      <section className="border-t border-slate-200 dark:border-slate-800 py-12 px-4 sm:px-6 bg-slate-900 text-white text-center space-y-4">
        <h3 className="font-serif text-2xl sm:text-3xl font-bold">
          Ready for a calmer, higher-signal morning?
        </h3>
        <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
          Start your morning briefing in under 60 seconds with full account or anonymous guest access.
        </p>
        <div className="pt-2">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm font-mono uppercase tracking-wider shadow-lg transition-colors"
          >
            Create Your Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
      </main>

      {/* 6. EDITORIAL FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-950 text-slate-400 py-8 px-4 sm:px-6 text-xs font-mono">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
          <div>
            {"© 2026 Becon Gazette // Published daily at 07:00 UTC"}
          </div>
        </div>
      </footer>
    </div>
  );
}
