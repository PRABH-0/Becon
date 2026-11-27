import React from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Shield, Lock, EyeOff, Trash2, Database } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Privacy Policy // Becon Intelligence Gazette",
  description: "Privacy policy explaining honest data collection, sub-processors, and data deletion rights at Becon.",
};

export default function PrivacyPage() {
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
              PRIVACY POLICY
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
      <main id="main-content" className="max-w-[860px] w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 flex-1">
        {/* Draft Notice Banner */}
        <div className="mb-8 p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold uppercase tracking-wider font-mono">
              Draft Document — Pending Formal Legal Review
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              This document is an honest, plain-English summary of our operating data practices during the launch preview period (November 2026). We believe in total transparency without legalese.
            </p>
          </div>
        </div>

        {/* Masthead */}
        <div className="border-b-2 border-slate-900 dark:border-slate-700 pb-6 mb-8 text-center sm:text-left">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            {"DATA ETHICS // SECTION 02"}
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
            Privacy Policy
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-2">
            {"Last Updated: November 2026 // Built for engineers who value zero-tracking privacy"}
          </p>
        </div>

        {/* Content sections */}
        <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              1. Our Core Privacy Philosophy
            </h3>
            <p>
              Becon was created out of frustration with engagement algorithms, surveillance ads, and endless tracking pixels. We believe in:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-sm">
              <li><strong>Zero behavioral tracking:</strong> No Meta pixels, no Google Ads tags, no third-party data brokers.</li>
              <li><strong>No model training on your data:</strong> We do not train proprietary AI models on your private queries, email, or reading habits.</li>
              <li><strong>Finite reading:</strong> We do not design dopamine-loop feeds intended to trap your attention. When your 10 cards are read, you are done.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              2. What Data We Collect (Honest Inventory)
            </h3>
            <p>
              We only collect data necessary to tailor your daily intelligence briefing:
            </p>
            <div className="grid gap-3 pt-2">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-1">
                  A. Account & Profile
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Your email address (if registered with email/password or OAuth), display name, and optional avatar URL provided by your OAuth provider. Guest users have no email recorded.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-1">
                  B. Professional Focus & Preferences
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Your selected role (e.g. Senior Frontend Engineer), focus topics (e.g. Next.js, Kubernetes), custom briefing tone, and scheduled delivery time for morning briefings.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-1">
                  C. Saved Cards & Feedback
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Cards you choose to bookmark, useful / not-useful feedback you submit, and factual error reports you flag to help improve editorial accuracy.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-1">
                  D. Minimal Product Telemetry
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Aggregate events (<code className="text-[11px] font-mono">briefing_viewed</code>, <code className="text-[11px] font-mono">card_opened</code>, <code className="text-[11px] font-mono">source_clicked</code>) recorded anonymously to measure feed reliability and feature usage. No IP addresses or device fingerprints are stored in telemetry records.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              3. Third-Party Sub-Processors
            </h3>
            <p>
              We partner with trusted enterprise cloud infrastructure providers to run Becon:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Google Gemini (Google Cloud):</strong> Runs automated synthesis and grounding validation over public developer changelogs. Google does not use our API inputs or outputs to train foundation models under commercial enterprise agreements.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Resend:</strong> Handles transactional email delivery for optional daily digests. We only share your email address when email digests are actively enabled in your profile.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Supabase (PostgreSQL & Auth):</strong> Hosts our primary PostgreSQL database with encryption at rest and manages user session security.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-slate-100">Sentry (Optional):</strong> Captures frontend and backend exceptions if configured, with sensitive parameters and credentials scrubbed before transmission.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              4. Complete Data Deletion (GDPR & CCPA Rights)
            </h3>
            <p>
              We honor your right to be forgotten unconditionally. You may delete your account at any time:
            </p>
            <ol className="list-decimal pl-6 space-y-1.5 text-sm">
              <li>Navigate to your <strong>Profile</strong> (<code className="text-xs font-mono">/profile</code>).</li>
              <li>Scroll down to the <strong>Danger Zone</strong>.</li>
              <li>Click <strong>Delete Account & Data</strong> and confirm.</li>
            </ol>
            <p className="text-sm">
              Upon confirmation, our database immediately executes a cascade deletion: your user record, profile preferences, saved cards, card feedback, and cached briefings are permanently expunged.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              5. Cookies & Local Storage
            </h3>
            <p>
              Becon uses minimal local storage solely for essential operational functionality:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-sm">
              <li><code className="text-xs font-mono">sb-*-auth-token:</code> Secure authentication token managed by Supabase Auth.</li>
              <li><code className="text-xs font-mono">becon-theme:</code> Your chosen visual appearance (light or dark mode).</li>
              <li><code className="text-xs font-mono">becon_briefing_cache_*:</code> Encrypted local cache of today&apos;s briefing cards for instant sub-second page loads.</li>
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              We do not use advertising or cross-site tracking cookies of any kind.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
              6. Privacy Questions & Data Inquiries
            </h3>
            <p>
              If you have any questions about this Privacy Policy or wish to request data verification, email us at <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">privacy@becon.dev</code>.
            </p>
          </section>
        </div>

        {/* Footer Link Navigation */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-slate-900 dark:hover:text-white underline">
              Terms of Service
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
