"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [unsubscribedEmail, setUnsubscribedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      queueMicrotask(() => {
        setStatus("error");
        setErrorMessage("No unsubscribe token was provided in the link.");
      });
      return;
    }

    const performUnsubscribe = async () => {
      setStatus("loading");
      try {
        const res = await apiFetch<{ status: string; email?: string }>(
          `/api/unsubscribe?token=${encodeURIComponent(token)}`,
          { method: "GET" }
        );
        if (res.status === "unsubscribed") {
          setStatus("success");
          if (res.email) setUnsubscribedEmail(res.email);
        } else {
          setStatus("error");
          setErrorMessage("Failed to unsubscribe. Please check your settings in your profile.");
        }
      } catch (err: unknown) {
        setStatus("error");
        const msg =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Invalid or expired unsubscribe link.";
        setErrorMessage(msg);
      }
    };

    performUnsubscribe();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block hover:opacity-85 transition-opacity">
            <h1 className="font-serif text-2xl font-black tracking-widest text-slate-950 dark:text-white uppercase">
              B E C O N
            </h1>
          </Link>
          <div className="mt-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
            Email Digest Preferences
          </div>
        </div>

        {status === "loading" && (
          <div className="py-8 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-mono text-slate-600 dark:text-slate-400">
              Processing your unsubscribe request…
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
              Unsubscribed Successfully
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {unsubscribedEmail ? (
                <>
                  <strong className="text-slate-900 dark:text-slate-200">{unsubscribedEmail}</strong> has been
                  removed from the Becon Daily Email Digest.
                </>
              ) : (
                "You have been successfully unsubscribed from the Becon Daily Email Digest."
              )}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              You can re-enable email digests anytime in your profile settings.
            </p>
            <div className="pt-4 flex flex-col gap-2">
              <Link
                href="/profile"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-amber-400 text-amber-300 dark:text-slate-950 font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <span>Go to Profile</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/"
                className="w-full py-2 px-4 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                Back to Becon Home
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
              Unable to Unsubscribe
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {errorMessage}
            </p>
            <div className="pt-4 flex flex-col gap-2">
              <Link
                href="/profile"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-amber-400 text-amber-300 dark:text-slate-950 font-mono font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <span>Manage Digest in Profile</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/"
                className="w-full py-2 px-4 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                Back to Becon Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#070b12]">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
