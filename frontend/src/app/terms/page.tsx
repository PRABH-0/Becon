import React from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ShieldCheck, Cpu, Mail, Scale } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Terms of Service // Becon Intelligence Gazette",
  description: "Terms of service and legal agreement for Becon AI Intelligence Briefing Engine.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col selection:bg-slate-900 selection:text-white transition-colors duration-200">
      {/* Top Header */}
      <header className="bg-slate-950 text-slate-200 py-3.5 px-4 sm:px-6 border-b border-slate-800 sticky top-0 z-50 backdrop-blur-md bg-opacity-95 shadow-md">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-85 transition-opacity">
              <h1 className="font-serif text-xl sm:text-2xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden sm:inline">
              TERMS OF SERVICE
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300 hover:text-white transition-colors border border-slate-700 hover:border-slate-500 rounded px-3 py-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Gazette
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[860px] w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 flex-1">
        {/* Draft Notice Banner */}
        <div className="mb-8 p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold uppercase tracking-wider font-mono">
              Draft Document — Pending Formal Legal Review
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              This document is an honest, plain-English summary of our operating terms during the launch preview period (November 2026). It will be superseded by formal legal counsel before enterprise tiers open.
            </p>
          </div>
        </div>

        {/* Masthead */}
        <div className="border-b-2 border-slate-900 dark:border-slate-700 pb-6 mb-8 text-center sm:text-left">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            {"LEGAL ARCHIVE // SECTION 01"}
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
            Terms of Service
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-2">
            {"Last Updated: November 2026 // Effective immediately upon registration or guest session"}
          </p>
        </div>

        {/* Clauses */}
        <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              1. Acceptance & Nature of the Service
            </h3>
            <p>
              By accessing or using Becon (the &quot;Service&quot;), you agree to these Terms. Becon is an editorial-first intelligence service designed to deliver concise, action-oriented briefings synthesized from public release notes, software changelogs, RFCs, and security advisories.
            </p>
            <p>
              The Service is provided to you for technical education, professional awareness, and workflow planning. You agree to use the Service in good faith and not to scrape, overwhelm, or attempt unauthorized access to our APIs.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              2. Accounts & User Responsibilities
            </h3>
            <p>
              Authentication is handled through Supabase Auth via email/password, OAuth, or temporary guest sessions. You are responsible for safeguarding your credentials and any activity under your account.
            </p>
            <p>
              You may explore the Service as a guest without creating an account. Guest briefings are stored in temporary browser sessions. You may upgrade a guest session to a full account at any time, or permanently delete your account directly from your Profile settings.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              3. AI Synthesis & Third-Party Processors
            </h3>
            <p>
              To synthesize developer cards from public feeds, Becon utilizes third-party infrastructure and sub-processors:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Google Gemini API:</strong> Used to cluster, summarize, and fact-check public release notes into 4-part action cards. Your private passwords and database contents are never sent to Gemini.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Resend:</strong> Used to deliver optional daily morning email digests requested by you.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Supabase:</strong> Provides managed PostgreSQL hosting, Row-Level Security, and identity storage.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              4. Technical Accuracy Disclaimer (No Migration Warranty)
            </h3>
            <p>
              While every card generated by Becon undergoes automated fact-checking and grounding verification against raw source documentation, technical ecosystems evolve rapidly.
            </p>
            <p className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-200">
              ACTION GUIDANCE (LEARN, APPLY, AVOID, PREPARE) IS PROVIDED FOR INFORMATIONAL PURPOSES ONLY. ALWAYS VERIFY OFFICIAL DOCUMENTATION AND TEST IN A STAGING ENVIRONMENT BEFORE EXECUTING BREAKING DATABASE MIGRATIONS, FRAMEWORK UPGRADES, OR INFRASTRUCTURE CHANGES.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
              5. Account Deletion & Termination
            </h3>
            <p>
              You have complete control over your data. You may delete your account at any moment through the Profile Danger Zone. Deleting your account immediately triggers an automated cascade delete of your profile, saved cards, feedback, and cached briefings from our database.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
              6. Contact Information
            </h3>
            <p>
              For legal inquiries or questions regarding these terms, contact the maintainers at <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">legal@becon.dev</code>.
            </p>
          </section>
        </div>

        {/* Footer Link Navigation */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white underline">
              Privacy Policy
            </Link>
            <Link href="/about" className="hover:text-slate-900 dark:hover:text-white underline">
              About & Manifesto
            </Link>
          </div>
          <div>© 2026 Becon Gazette. All rights reserved.</div>
        </div>
      </main>
    </div>
  );
}
