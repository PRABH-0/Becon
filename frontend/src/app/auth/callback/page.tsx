"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getMe } from "@/lib/api";
import { getSafeRedirectUrl } from "@/lib/redirect";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRunRef = useRef(false);

  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const handleCallback = async () => {
      // 1. Check for errors returned in query params
      const errorParam = searchParams.get("error");
      const errorDesc = searchParams.get("error_description");
      if (errorParam || errorDesc) {
        setStatus("error");
        setErrorMessage(
          errorDesc
            ? decodeURIComponent(errorDesc)
            : "The authentication link is invalid or has expired."
        );
        return;
      }

      // 2. PKCE code exchange if ?code= is present
      const code = searchParams.get("code");
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            // Check if user actually already has an active session (e.g. React StrictMode double run)
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData.session) {
              setStatus("error");
              setErrorMessage(
                error.message.toLowerCase().includes("pkce") ||
                  error.message.toLowerCase().includes("invalid grant")
                  ? "This confirmation link has already been used or has expired. Please sign in or request a new link."
                  : error.message
              );
              return;
            }
          }
        } catch (err) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Authentication failed.");
          return;
        }
      }

      // 3. Confirm session presence
      let activeSession = null;
      try {
        const { data } = await supabase.auth.getSession();
        activeSession = data.session;
      } catch {
        activeSession = null;
      }

      if (!activeSession) {
        // Wait briefly for potential auth state change (e.g. hash fragments)
        await new Promise((resolve) => setTimeout(resolve, 500));
        const { data } = await supabase.auth.getSession();
        activeSession = data.session;
      }

      if (!activeSession) {
        setStatus("error");
        setErrorMessage("Unable to establish an authenticated session. Please try signing in again.");
        return;
      }

      // 4. Fetch profile setup status via GET /api/me
      try {
        const me = await getMe();
        const nextParam = searchParams.get("next");
        if (!me.has_completed_setup) {
          router.replace("/profile?setup=true");
        } else {
          const destination = getSafeRedirectUrl(nextParam, "/");
          router.replace(destination);
        }
      } catch (err) {
        // If /api/me fails, still navigate forward to setup
        console.error("Failed to fetch /api/me in callback:", err);
        router.replace("/profile?setup=true");
      }
    };

    handleCallback();
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <div className="min-h-screen w-full bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-800 rounded-2xl p-7 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
              Authentication Error
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono tracking-wide leading-relaxed">
              {errorMessage}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
            >
              <span>Return to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="w-10 h-10 rounded-full border-3 border-emerald-600 border-t-transparent animate-spin mb-4" />
        <h2 className="font-serif text-xl font-bold tracking-tight mb-1 text-slate-900 dark:text-slate-100">
          Confirming Authentication
        </h2>
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Finalizing intelligence workspace...
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#070b12]">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
