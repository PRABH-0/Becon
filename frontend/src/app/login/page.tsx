"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, ArrowRight, Lock, Mail, AlertCircle, Eye, EyeOff, Sparkles } from "lucide-react";
import { useLoader } from "@/context/LoadingContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabaseClient";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const router = useRouter();
  const { showLoader } = useLoader();

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("becon_token", data.access_token);
        router.push("/");
      } else {
        const data = await res.json();
        setError(data.detail || "Invalid email or password");
      }
    } catch (err) {
      setError("Unable to connect to the server.");
    } finally {
      setIsLoading(false);
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
          Or{" "}
          <Link href="/register" className="font-bold text-rose-600 hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300 transition-colors">
            create a new account & profile
          </Link>
        </p>

        <div className="w-full mt-5 sm:mt-6">
          <div className="bg-white dark:bg-slate-900 py-6 sm:py-7 px-5 sm:px-8 shadow-xl dark:shadow-slate-950/80 border-2 border-slate-900 dark:border-slate-800 rounded-2xl relative overflow-hidden transition-colors">
            {/* Glassmorphism gradient orb */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-200 dark:bg-rose-950/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 animate-blob pointer-events-none"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-200 dark:bg-indigo-950/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-2000 pointer-events-none"></div>

            <div className="relative z-10 space-y-3 mb-4">
              {/* GOOGLE SIGN IN BUTTON */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isGuestLoading || isLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750 font-semibold text-xs sm:text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <div className="h-4 w-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
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

              {/* GUEST ACCESS BUTTON */}
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={isGoogleLoading || isGuestLoading || isLoading}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-600 font-mono text-xs font-semibold tracking-wide transition-all cursor-pointer disabled:opacity-60"
              >
                {isGuestLoading ? (
                  <div className="h-3.5 w-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Continue as Guest (Instant Access)</span>
              </button>

              {/* OR DIVIDER */}
              <div className="relative my-3 pt-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] font-mono uppercase tracking-wider">
                  <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500 font-bold">
                    Or with email
                  </span>
                </div>
              </div>
            </div>

            <form className="space-y-4 sm:space-y-5 relative z-10" onSubmit={handleLogin}>
              {error && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-500 p-3 rounded-r-lg shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono uppercase tracking-wider">{error}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-lg pl-10 pr-3 py-2 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-colors outline-none shadow-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-lg pl-10 pr-10 py-2 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-colors outline-none shadow-xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 dark:border-slate-700 rounded cursor-pointer dark:bg-slate-800"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-bold text-rose-600 hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300 text-xs">
                    Forgot password?
                  </a>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center gap-2 py-2.5 sm:py-3 px-4 border border-transparent dark:border-slate-700 rounded-lg shadow-md text-xs sm:text-sm font-black font-mono tracking-widest uppercase text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" /> Sign In <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="mt-4 sm:mt-5 text-center">
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
