"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Layers,
  Cpu,
  Zap,
  Clock,
  Compass,
  Database,
  Terminal,
  BookOpen,
  ArrowUpRight,
  Filter,
  Check,
  Flame,
  Pin,
  Bot
} from "lucide-react";

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
    actionColor: "bg-amber-500/10 text-amber-700 border-amber-300",
    whatHappened: [
      "Dynamic functions including cookies(), headers(), params, and searchParams now return Promises instead of synchronous objects.",
      "Synchronous access triggers runtime deprecation warnings in current versions and will throw errors in upcoming releases."
    ],
    whyItMatters:
      "Aligns Next.js with modern streaming server rendering architectures and opt-in partial prerendering (PPR) models.",
    howItAffectsYou:
      "Any shared layout, auth guard, or utility function directly reading cookies() without 'await' will break during major version upgrades.",
    whatToDoNext:
      "Prepare: Run the automated Next.js codemod across your repository to asynchronously await request headers and cookies."
  },
  devops: {
    role: "Cloud Architect & DevOps",
    category: "Kubernetes & Cloud Infrastructure",
    title: "Kubernetes Retires In-Tree Cloud Controller Managers in Favor of Out-of-Tree Plugins",
    sourceUrl: "https://kubernetes.io/blog",
    sourceName: "Kubernetes Official Engineering",
    actionType: "avoid",
    actionColor: "bg-rose-500/10 text-rose-700 border-rose-300",
    whatHappened: [
      "Legacy cloud-provider integration flags (--cloud-provider=aws|azure|gcp) are completely disabled in new cluster control planes.",
      "All cloud-specific volume plugins and route synchronizers now require external Cloud Controller Manager (CCM) daemonsets."
    ],
    whyItMatters:
      "Decouples Kubernetes core release cadence from third-party cloud SDK upgrades and drastically decreases kubelet binary footprint.",
    howItAffectsYou:
      "Spinning up self-managed control plane nodes using outdated Terraform modules will crash kube-apiserver on cluster boot.",
    whatToDoNext:
      "Avoid: Do not deploy unpinned k8s worker nodegroups without verifying external CCM daemonset manifests are deployed first."
  },
  dotnet: {
    role: "Senior .NET & Microservices Lead",
    category: ".NET Core & C# Architecture",
    title: "Apple Deprecates Legacy App Lifecycle in Favor of Scene-Based Initialization",
    sourceUrl: "https://devblogs.microsoft.com/dotnet/",
    sourceName: "Microsoft .NET Blog",
    actionType: "apply",
    actionColor: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
    whatHappened: [
      "Apple is transitioning all iOS application startup code to scene-based delegate architectures.",
      "Legacy AppDelegate lifecycle hooks are marked for deprecation in forthcoming Xcode minimum requirement builds."
    ],
    whyItMatters:
      "Enables multi-window application state persistence and decouples window orchestration from root application process boot.",
    howItAffectsYou:
      "Your .NET MAUI iOS project requires a manual configuration migration to maintain compatibility with new App Store submission rules.",
    whatToDoNext:
      "Apply: Update your MauiProgram.cs and iOS scene delegate hooks before your team's next Xcode SDK rollout."
  },
  finance: {
    role: "Financial Analyst & Corporate Accountant",
    category: "Tax Regulations & GST Compliance",
    title: "New E-Invoicing Threshold and Automated ITC Reversal Directives Released",
    sourceUrl: "https://gst.gov.in",
    sourceName: "GST & Tax Regulatory Council",
    actionType: "apply",
    actionColor: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
    whatHappened: [
      "Regulatory council establishes mandatory real-time electronic invoice generation for all B2B transactions above revised revenue limits.",
      "Automated matching rules enforce instant Input Tax Credit (ITC) blocks on mismatched supplier GSTR-1 filings."
    ],
    whyItMatters:
      "Closes compliance loopholes and eliminates manual reconciliation delays between monthly purchasing ledgers.",
    howItAffectsYou:
      "Accounts receivable and ERP systems must validate IRN portal tokens in real time before releasing shipment dispatch documents.",
    whatToDoNext:
      "Apply: Audit your ERP accounting integration endpoints and configure automatic supplier reconciliation alerts."
  }
};

export default function AboutPage() {
  const [selectedRole, setSelectedRole] = useState<RoleCardKey>("frontend");
  const currentCard = SAMPLE_CARDS[selectedRole];

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans flex flex-col selection:bg-slate-900 selection:text-white">
      {/* 1. TOP EDITORIAL HEADER BAR */}
      <header className="bg-slate-950 text-slate-200 py-3.5 px-4 sm:px-6 border-b border-slate-800 sticky top-0 z-50 backdrop-blur-md bg-opacity-95 shadow-md">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-85 transition-opacity" id="header-logo-link">
              <h1 className="font-serif text-2xl sm:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden sm:inline">
              ABOUT THE PROJECT & MANIFESTO
            </span>
          </div>

          <nav className="flex items-center gap-3 sm:gap-5 text-xs font-mono">
            <Link
              href="/"
              className="text-slate-300 hover:text-amber-300 transition-colors font-semibold hidden md:inline"
              id="nav-daily-gazette"
            >
              Daily Gazette
            </Link>
            <Link
              href="/onboarding"
              className="text-slate-300 hover:text-amber-300 transition-colors font-semibold hidden lg:inline"
              id="nav-ai-onboarding"
            >
              AI Onboarding
            </Link>
            <Link
              href="/profile"
              className="text-slate-300 hover:text-amber-300 transition-colors font-semibold hidden sm:inline"
              id="nav-profile-link"
            >
              Profile & Stack
            </Link>
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black tracking-wider uppercase transition-all shadow-xs cursor-pointer"
              id="nav-get-started"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="bg-slate-950 text-white pt-14 pb-18 px-4 sm:px-6 border-b border-slate-800 relative overflow-hidden">
        {/* Subtle broadsheet watermark grid */}
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700/80 text-amber-300 font-mono text-xs font-bold uppercase tracking-wider mb-6 animate-in fade-in duration-300">
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span>Updates, Not News • Built For Professionals</span>
          </div>

          <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight sm:leading-tight mb-6">
            Your stack changed overnight.
            <br />
            <span className="text-amber-300 italic font-normal">
              Becon tells you what to do about it.
            </span>
          </h2>

          <p className="text-slate-300 text-base sm:text-lg max-w-3xl mx-auto leading-relaxed mb-8 font-normal font-sans">
            Becon converts the relentless firehose of releases, deprecations, breaking changes, and
            security advisories into a structured, 3-to-5 minute daily intelligence briefing
            customized to your exact role and tech stack.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-xs">
            <Link
              href="/"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black tracking-wider uppercase transition-all shadow-lg hover:shadow-amber-400/20 cursor-pointer"
              id="hero-read-gazette"
            >
              <span>Explore Today's Gazette</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/onboarding"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-500 font-bold tracking-wider uppercase transition-all cursor-pointer"
              id="hero-setup-profile"
            >
              <span>Tune Your Stack</span>
              <Compass className="w-4 h-4 text-amber-300" />
            </Link>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-12 pt-8 border-t border-slate-800/80 max-w-4xl mx-auto text-left font-mono">
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <div className="text-amber-300 font-black text-xl sm:text-2xl">3–5 Min</div>
              <div className="text-slate-400 text-xs mt-0.5">Time-boxed daily scan</div>
            </div>
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <div className="text-rose-400 font-black text-xl sm:text-2xl">0% Noise</div>
              <div className="text-slate-400 text-xs mt-0.5">Zero social engagement tricks</div>
            </div>
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <div className="text-emerald-400 font-black text-xl sm:text-2xl">100%</div>
              <div className="text-slate-400 text-xs mt-0.5">Traceable official sources</div>
            </div>
            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <div className="text-indigo-400 font-black text-xl sm:text-2xl">4-Part</div>
              <div className="text-slate-400 text-xs mt-0.5">Action card methodology</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. THE PROBLEM VS BECON (COMPARISON TABLE) */}
      <section className="py-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded">
            THE PARADIGM SHIFT
          </span>
          <h3 className="font-serif text-2xl sm:text-4xl font-black text-slate-950 mt-3">
            Why Developer News Feeds Are Broken
          </h3>
          <p className="text-slate-600 max-w-2xl mx-auto mt-2 text-sm sm:text-base">
            Modern software engineers are bombarded with hot takes, duplicate press releases, and
            engagement farming algorithms that bury actual breaking changes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Traditional Feeds */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-300 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 text-rose-600 font-mono text-xs font-bold uppercase tracking-wider">
                <XCircle className="w-4 h-4" />
                <span>Traditional Tech Feeds & Social Feeds</span>
              </div>
              <h4 className="font-serif text-xl font-bold text-slate-900 mb-4">
                Built to maximize your screen time
              </h4>
              <ul className="space-y-3.5 text-sm text-slate-600">
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold shrink-0">✕</span>
                  <span><strong>Same feed for everyone:</strong> A junior web designer and a senior cloud SRE see the exact same generic headline.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold shrink-0">✕</span>
                  <span><strong>Redundant duplicates:</strong> One release generates ten identical reaction posts with varying accuracy.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold shrink-0">✕</span>
                  <span><strong>Never actionable:</strong> Tells you an announcement happened, but never what you need to change in your codebase.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-rose-500 font-bold shrink-0">✕</span>
                  <span><strong>Critical advisories missed:</strong> A deprecation notice or critical CVE gets buried because it didn't go viral.</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 font-mono text-xs text-slate-400">
              Result: 45 minutes lost to mindless scrolling, zero code changes made.
            </div>
          </div>

          {/* Becon Intelligence */}
          <div className="bg-slate-950 text-slate-200 rounded-2xl p-6 sm:p-8 border-2 border-slate-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center gap-2 mb-4 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                <span>Becon Daily Intelligence Gazette</span>
              </div>
              <h4 className="font-serif text-xl font-bold text-white mb-4">
                Built to get you back to building
              </h4>
              <ul className="space-y-3.5 text-sm text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Role & Stack filtered:</strong> Tailored exclusively to the frameworks, languages, and systems you actually use.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Semantic deduplication:</strong> Multiple articles covering the same update collapse into a single high-signal card.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Strict 4-part action card:</strong> Tells you what changed, why it matters, how it hits your role, and what to do next.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Official verified sources:</strong> Scans engineering blogs, official release notes, and security advisories only.</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 font-mono text-xs text-amber-300 font-semibold">
              Result: 3 minutes scanned, clear tactical next steps, zero distraction.
            </div>
          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE ACTION CARD ANATOMY */}
      <section className="py-16 px-4 sm:px-6 bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-mono font-bold tracking-widest uppercase text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded">
              INTERACTIVE DEMONSTRATION
            </span>
            <h3 className="font-serif text-2xl sm:text-4xl font-black text-slate-950 mt-3">
              The 4-Part Action Card Anatomy
            </h3>
            <p className="text-slate-600 max-w-2xl mx-auto mt-2 text-sm sm:text-base">
              Every update in Becon adheres to a strict editorial schema enforced by Google Gemini AI.
              Switch roles below to inspect how the same event is analyzed for different stacks.
            </p>

            {/* Role Switcher Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 font-mono text-xs">
              <button
                type="button"
                onClick={() => setSelectedRole("frontend")}
                className={`px-3.5 py-2 rounded-xl border transition-all cursor-pointer font-bold ${
                  selectedRole === "frontend"
                    ? "bg-slate-950 text-amber-300 border-slate-900 shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-300"
                }`}
              >
                Frontend (React / Next.js)
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("devops")}
                className={`px-3.5 py-2 rounded-xl border transition-all cursor-pointer font-bold ${
                  selectedRole === "devops"
                    ? "bg-slate-950 text-amber-300 border-slate-900 shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-300"
                }`}
              >
                DevOps & Cloud (Kubernetes)
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("dotnet")}
                className={`px-3.5 py-2 rounded-xl border transition-all cursor-pointer font-bold ${
                  selectedRole === "dotnet"
                    ? "bg-slate-950 text-amber-300 border-slate-900 shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-300"
                }`}
              >
                Mobile & .NET (.NET MAUI)
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("finance")}
                className={`px-3.5 py-2 rounded-xl border transition-all cursor-pointer font-bold ${
                  selectedRole === "finance"
                    ? "bg-slate-950 text-amber-300 border-slate-900 shadow-sm"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-300"
                }`}
              >
                Finance & Tax (GST / ERP)
              </button>
            </div>
          </div>

          {/* Action Card Showcase */}
          <div className="max-w-3xl mx-auto rounded-2xl bg-white border-2 border-slate-900 shadow-xl p-6 sm:p-8">
            {/* Header Meta */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-950 text-amber-300">
                  {currentCard.category}
                </span>
                <span className={`font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${currentCard.actionColor}`}>
                  {currentCard.actionType}
                </span>
              </div>
              <div className="font-mono text-xs text-slate-500 flex items-center gap-1.5">
                <span>Role:</span>
                <strong className="text-slate-900 font-semibold">{currentCard.role}</strong>
              </div>
            </div>

            {/* Title */}
            <h4 className="font-serif text-xl sm:text-2xl font-black text-slate-950 mt-4 mb-5 leading-snug">
              {currentCard.title}
            </h4>

            {/* 4 Sections Breakdown */}
            <div className="space-y-4 font-sans text-sm">
              {/* 1. What Happened */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-xs font-mono font-extrabold uppercase tracking-wider text-slate-950 mb-2">
                  <Pin className="w-3.5 h-3.5 text-rose-600" />
                  <span>1. WHAT HAPPENED</span>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {currentCard.whatHappened.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-700 text-xs sm:text-sm">
                      <span className="text-rose-600 font-bold shrink-0">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 2. Why It Matters */}
              <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-indigo-900 mb-1">
                  2. WHY IT MATTERS (ARCHITECTURAL CONTEXT)
                </div>
                <p className="text-slate-700 text-xs sm:text-sm leading-relaxed">
                  {currentCard.whyItMatters}
                </p>
              </div>

              {/* 3. How It Affects You */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
                <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-900 mb-1">
                  3. HOW IT AFFECTS YOU (ROLE IMPACT)
                </div>
                <p className="text-slate-700 text-xs sm:text-sm leading-relaxed">
                  {currentCard.howItAffectsYou}
                </p>
              </div>

              {/* 4. What To Do Next */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800">
                <div className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-300 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>4. WHAT TO DO NEXT (ACTIONABLE GUIDANCE)</span>
                </div>
                <p className="text-slate-200 text-xs sm:text-sm leading-relaxed font-mono">
                  {currentCard.whatToDoNext}
                </p>
              </div>
            </div>

            {/* Bottom Footer Source Link */}
            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">
                Verified Source: <strong className="text-slate-800">{currentCard.sourceName}</strong>
              </span>
              <a
                href={currentCard.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition-colors cursor-pointer"
              >
                <span>Read Original Docs</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 5. THE AI & INGESTION PIPELINE */}
      <section className="py-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded">
            THE INTELLIGENCE ENGINE
          </span>
          <h3 className="font-serif text-2xl sm:text-4xl font-black text-slate-950 mt-3">
            How Becon Synthesizes Your Daily Briefing
          </h3>
          <p className="text-slate-600 max-w-2xl mx-auto mt-2 text-sm sm:text-base">
            From raw RSS feeds to verified, schema-enforced Action Cards in under a minute.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
          {/* Step 1 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-300 shadow-xs hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-slate-950 text-amber-300 flex items-center justify-center font-mono font-black text-base mb-4">
              01
            </div>
            <h4 className="font-serif text-lg font-bold text-slate-900 mb-2">
              Continuous Ingestion
            </h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              Becon monitors official engineering blogs, release notes, CVE repositories, and
              RSS/Atom feeds from top organizations (Microsoft, Google, Apple, Linux, AWS,
              Cloudflare, and domain councils).
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-300 shadow-xs hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-slate-950 text-rose-400 flex items-center justify-center font-mono font-black text-base mb-4">
              02
            </div>
            <h4 className="font-serif text-lg font-bold text-slate-900 mb-2">
              Deduplication & Ranking
            </h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              When multiple publications cover the same release, Becon groups them into a single
              canonical event. The story is then scored against your personal stack and seniority
              level.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-300 shadow-xs hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-slate-950 text-emerald-400 flex items-center justify-center font-mono font-black text-base mb-4">
              03
            </div>
            <h4 className="font-serif text-lg font-bold text-slate-900 mb-2">
              Gemini Structured Synthesis
            </h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              Google Gemini processes the source material and outputs a Pydantic-validated JSON
              Action Card. Every output is strictly constrained to prevent hallucinations and provide
              clear operational advice.
            </p>
          </div>
        </div>
      </section>

      {/* 6. MANIFESTO & CORE PRINCIPLES */}
      <section className="py-16 px-4 sm:px-6 bg-slate-950 text-slate-200 border-t border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-mono font-bold tracking-widest uppercase text-amber-300 bg-amber-950/60 border border-amber-800 px-2.5 py-1 rounded">
              OUR MANIFESTO
            </span>
            <h3 className="font-serif text-2xl sm:text-4xl font-black text-white mt-3">
              Six Principles Behind Becon
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-mono text-amber-300 text-xs font-bold uppercase mb-2">
                1. Action Over Information
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                A briefing card without a concrete next step is unfinished. We don't just report what
                happened; we provide guidance on what to do next.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-mono text-amber-300 text-xs font-bold uppercase mb-2">
                2. Signal Over Volume
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Fewer items, exponentially higher relevance. You don't need 100 links; you need the
                five updates that affect your sprint.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-mono text-amber-300 text-xs font-bold uppercase mb-2">
                3. Trusted Sources Only
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Official engineering blogs, vendor release notes, and security advisories come first.
                No drama, no clickbait, no social media speculation.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-mono text-amber-300 text-xs font-bold uppercase mb-2">
                4. Time-Boxed by Design
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                A full briefing takes 3 to 5 minutes. You read your cards, understand where your stack
                stands, and close the tab to go back to building.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-mono text-amber-300 text-xs font-bold uppercase mb-2">
                5. Transparent AI
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Every AI summary links directly to its original source documentation so you can
                verify claims and dive deeper into the code.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-mono text-amber-300 text-xs font-bold uppercase mb-2">
                6. Calm Editorial Layout
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                A newspaper-inspired broadsheet design with clear typographic hierarchy, quiet colors,
                and zero algorithmic dopamine traps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. TECHNOLOGY ARCHITECTURE */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        <div className="text-center mb-10">
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded">
            UNDER THE HOOD
          </span>
          <h3 className="font-serif text-2xl sm:text-4xl font-black text-slate-950 mt-3">
            Production Full-Stack Architecture
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
          <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-2xs">
            <div className="text-slate-500 uppercase text-[10px] font-bold mb-1">Frontend</div>
            <div className="text-slate-950 font-black text-sm">Next.js 16</div>
            <div className="text-slate-600 text-[11px] mt-1 font-sans">
              React 19, TypeScript, App Router, Tailwind CSS v4 broadsheet styling.
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-2xs">
            <div className="text-slate-500 uppercase text-[10px] font-bold mb-1">Backend API</div>
            <div className="text-slate-950 font-black text-sm">FastAPI & Python</div>
            <div className="text-slate-600 text-[11px] mt-1 font-sans">
              Asynchronous endpoint handling, Uvicorn, OAuth2 with JWT authentication.
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-2xs">
            <div className="text-slate-500 uppercase text-[10px] font-bold mb-1">AI Orchestration</div>
            <div className="text-slate-950 font-black text-sm">Google Gemini</div>
            <div className="text-slate-600 text-[11px] mt-1 font-sans">
              Schema-enforced JSON structured output via google-genai SDK.
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-2xs">
            <div className="text-slate-500 uppercase text-[10px] font-bold mb-1">Persistence</div>
            <div className="text-slate-950 font-black text-sm">Supabase PostgreSQL</div>
            <div className="text-slate-600 text-[11px] mt-1 font-sans">
              SQLAlchemy 2.0 ORM, user profile tuning, and persistent action cards.
            </div>
          </div>
        </div>
      </section>

      {/* 8. CALL TO ACTION FOOTER */}
      <footer className="bg-slate-950 text-slate-400 py-12 px-4 sm:px-6 border-t border-slate-800 mt-auto font-mono text-xs">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <div className="flex items-center justify-center md:justify-start gap-2 text-white font-serif text-xl font-black tracking-widest uppercase">
              <span>B E C O N</span>
              <span className="text-[10px] font-mono text-amber-300 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                INTELLIGENCE GAZETTE
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-1.5 font-sans max-w-md">
              Not news. Updates you can act on. Personalized daily briefings for software professionals.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="text-slate-300 hover:text-amber-300 transition-colors font-bold"
              id="footer-home"
            >
              Today's Gazette
            </Link>
            <Link
              href="/onboarding"
              className="text-slate-300 hover:text-amber-300 transition-colors font-bold"
              id="footer-onboarding"
            >
              Interactive Onboarding
            </Link>
            <Link
              href="/profile"
              className="text-slate-300 hover:text-amber-300 transition-colors font-bold"
              id="footer-profile"
            >
              Profile Settings
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black uppercase tracking-wider transition-all cursor-pointer"
              id="footer-login"
            >
              Sign In
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 text-[11px]">
          <span>© {new Date().getFullYear()} BECON Intelligence Gazette. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <span>Powered by Google Gemini & Official Source Feeds</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
