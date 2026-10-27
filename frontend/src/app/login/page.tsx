"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, AlertCircle, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabaseClient";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function LoginPage() {
  const [error, setError] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get("error");
      if (urlError) {
        setError(decodeURIComponent(urlError));
      }
    }
  }, []);

  const handleGoogleLogin = async () => {
    setError("");
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) {
        setError(error.message);
        setIsGoogleLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to initialize Google authentication");
      setIsGoogleLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError("");
    setIsGuestLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/guest`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("becon_token", data.access_token);
        localStorage.setItem("becon_user_name", "Guest Reader");
        localStorage.setItem("becon_is_guest", "true");
        localStorage.removeItem("becon_user_avatar");
        router.push("/");
      } else {
        setError("Unable to initialize guest session.");
      }
    } catch (err) {
      setError("Unable to connect to the server.");
    } finally {
      setIsGuestLoading(false);
    }
  };

  return (
    <div className="h-screen max-h-screen w-full bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 overflow-y-auto no-scrollbar selection:bg-slate-900 selection:text-white py-4 sm:py-6 transition-colors duration-200 relative">
      {/* Top Right Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50">
        <ThemeToggle size="sm" />
      </div>

      <div className="w-full max-w-md mx-auto my-auto flex flex-col items-center">
        <Link href="/" className="hover:opacity-85 transition-opacity mb-2 sm:mb-3">
          <h1 className="font-serif text-3xl sm:text-4xl font-black tracking-widest text-slate-950 dark:text-white uppercase drop-shadow-sm flex items-center gap-3">
            B E C O N
          </h1>
        </Link>
        <h2 className="mt-1 text-center text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 font-serif">
          Sign in to your account
        </h2>
        <p className="mt-1 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
          Daily personalized intelligence for modern software engineers
        </p>

        <div className="w-full mt-6">
          <div className="bg-white dark:bg-slate-900 py-7 px-5 sm:px-8 shadow-xl dark:shadow-slate-950/80 border-2 border-slate-900 dark:border-slate-800 rounded-2xl relative overflow-hidden transition-colors">
            {/* Glassmorphism subtle background glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-200 dark:bg-rose-950/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 animate-blob pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-200 dark:bg-indigo-950/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-2000 pointer-events-none"></div>

            <div className="relative z-10 space-y-4">
              {error && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-500 p-3 rounded-r-lg shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono uppercase tracking-wider">{error}</p>
                  </div>
                </div>
              )}

              {/* 1. GOOGLE SIGN IN BUTTON */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isGuestLoading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750 font-semibold text-xs sm:text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <div className="h-4 w-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              {/* 2. GUEST ACCESS BUTTON (WITH COMPASS EXPLORATION ICON) */}
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={isGoogleLoading || isGuestLoading}
                className="group w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-600 font-mono text-xs font-semibold tracking-wide transition-all cursor-pointer disabled:opacity-60"
              >
                {isGuestLoading ? (
                  <div className="h-4 w-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Compass className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors shrink-0" />
                )}
                <span>Continue as Guest (Instant Access)</span>
              </button>

              {/* VALUE BADGES */}
              <div className="pt-2 flex items-center justify-center gap-3 text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider select-none">
                <span>Instant Access</span>
                <span>•</span>
                <span>Zero Setup</span>
                <span>•</span>
                <span>Strict Privacy</span>
              </div>
            </div>
          </div>

          <div className="mt-5 text-center">
            <Link
              href="/about"
              className="font-mono text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-amber-300 transition-colors inline-flex items-center gap-1.5 font-bold"
            >
              <span>Learn how Becon works & read our manifesto</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
