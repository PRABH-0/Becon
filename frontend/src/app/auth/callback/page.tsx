"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getMe } from "@/lib/api";
import { getSafeRedirectUrl } from "@/lib/redirect";

export const CALLBACK_TIMEOUT_MS = 10000;
export const API_TIMEOUT_MS = 5000;

// Track in-flight PKCE code exchanges across React Strict Mode mount/remount
let pendingCodeExchange: {
  code: string;
  promise: Promise<{ error: Error | null }>;
} | null = null;

export function resetCodeExchangeLock(): void {
  pendingCodeExchange = null;
}

export function extractUrlError(searchParams: URLSearchParams): { code: string; message: string } | null {
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  if (errorParam || errorDesc) {
    return {
      code: errorParam || "auth_error",
      message: errorDesc
        ? decodeURIComponent(errorDesc)
        : "The authentication link is invalid or has expired.",
    };
  }

  if (typeof window !== "undefined" && window.location.hash) {
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    try {
      const hashParams = new URLSearchParams(rawHash);
      const hError = hashParams.get("error");
      const hDesc = hashParams.get("error_description");
      if (hError || hDesc) {
        return {
          code: hError || "auth_error",
          message: hDesc
            ? decodeURIComponent(hDesc)
            : "The authentication link is invalid or has expired.",
        };
      }
    } catch {
      // Ignore hash parse errors
    }
  }

  return null;
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = useCallback(() => {
    pendingCodeExchange = null;
    setStatus("processing");
    setErrorMessage("");
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Hard 10-second safety timeout that always runs across all code paths
    timer = setTimeout(() => {
      if (!mounted) return;
      setStatus("error");
      setErrorMessage(
        "Authentication verification timed out after 10 seconds. We were unable to confirm your session in time. Please try again or return to sign in."
      );
    }, CALLBACK_TIMEOUT_MS);

    const handleCallback = async () => {
      // 1. Check for errors returned in query params or URL hash fragments first
      const urlError = extractUrlError(searchParams);
      if (urlError) {
        if (!mounted) return;
        if (timer) clearTimeout(timer);
        setStatus("error");
        setErrorMessage(urlError.message);
        return;
      }

      // 2. Immediate session check: if session exists (e.g. detectSessionInUrl already consumed URL or existing session),
      // go straight to getMe and redirect immediately without waiting for events.
      try {
        const { data: immediateData } = await supabase.auth.getSession();
        if (immediateData?.session) {
          try {
            const me = await getMe({ timeoutMs: API_TIMEOUT_MS });
            if (!mounted) return;
            if (timer) clearTimeout(timer);
            const nextParam = searchParams.get("next");
            if (!me.has_completed_setup) {
              router.replace("/profile?setup=true");
            } else {
              const destination = getSafeRedirectUrl(nextParam, "/");
              router.replace(destination);
            }
            return;
          } catch (err) {
            if (!mounted) return;
            if (timer) clearTimeout(timer);
            console.error("Failed to fetch /api/me in callback:", err);
            setStatus("error");
            setErrorMessage(
              "Failed to load user profile. Please check your connection and try again."
            );
            return;
          }
        }
      } catch {
        // Fall through to code exchange handling
      }

      // 3. PKCE code exchange if ?code= is present (deduplicated across Strict Mode mounts)
      const code = searchParams.get("code");
      if (code) {
        try {
          if (!pendingCodeExchange || pendingCodeExchange.code !== code) {
            pendingCodeExchange = {
              code,
              promise: supabase.auth.exchangeCodeForSession(code).then(({ error }) => ({ error })),
            };
          }

          const { error } = await pendingCodeExchange.promise;
          if (error) {
            // Check if user already has an active session (e.g. concurrent or prior exchange)
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session) {
              if (!mounted) return;
              if (timer) clearTimeout(timer);
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
          if (!mounted) return;
          if (timer) clearTimeout(timer);
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Authentication failed.");
          return;
        }
      }

      // 4. Confirm session presence after code exchange
      let activeSession = null;
      try {
        const { data } = await supabase.auth.getSession();
        activeSession = data?.session ?? null;
      } catch {
        activeSession = null;
      }

      if (!activeSession) {
        // Wait briefly for background processing / hash fragment detection (e.g. 500ms)
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!mounted) return;
        try {
          const { data } = await supabase.auth.getSession();
          activeSession = data?.session ?? null;
        } catch {
          activeSession = null;
        }
      }

      if (activeSession) {
        // 5. Fetch profile setup status via GET /api/me with timeout
        try {
          const me = await getMe({ timeoutMs: API_TIMEOUT_MS });
          if (!mounted) return;
          if (timer) clearTimeout(timer);
          const nextParam = searchParams.get("next");
          if (!me.has_completed_setup) {
            router.replace("/profile?setup=true");
          } else {
            const destination = getSafeRedirectUrl(nextParam, "/");
            router.replace(destination);
          }
          return;
        } catch (err) {
          if (!mounted) return;
          if (timer) clearTimeout(timer);
          console.error("Failed to fetch /api/me in callback:", err);
          setStatus("error");
          setErrorMessage(
            "Failed to load user profile. Please check your connection and try again."
          );
          return;
        }
      }

      // If activeSession is still null, do NOT clear timer:
      // The 10s timer is running and will trigger the error screen if no session arrives.
    };

    handleCallback();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [searchParams, router, retryKey]);

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
          <div className="flex flex-col sm:flex-row gap-2 pt-2 w-full">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center gap-2 flex-1 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-800 dark:text-slate-100 font-semibold text-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Try again</span>
            </button>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 flex-1 py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
            >
              <span>Back to login</span>
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
