"use client";

import React, { useState, useEffect, useId } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Compass,
  Eye,
  EyeOff,
  Mail,
  Lock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/context/AuthContext";
import {
  getSupabaseUrlConfigError,
  isSupabaseMisconfiguredError,
  supabase,
} from "@/lib/supabaseClient";
import { getSafeRedirectUrl } from "@/lib/redirect";

export type AuthMode = "login" | "signup" | "upgrade";

interface AuthFormProps {
  mode: AuthMode;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    session,
    isAnonymous,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signInAsGuest,
    upgradeGuestWithEmail,
  } = useAuth();

  // Check URL error or notice params (e.g. ?error=... or ?deleted=1)
  const deletedNotice = searchParams.get("deleted");
  const urlError = searchParams.get("error");
  const nextDestination = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(() => {
    if (urlError) return decodeURIComponent(urlError);
    const configErr = getSupabaseUrlConfigError();
    if (configErr) {
      console.error(configErr);
      return "Auth is misconfigured. Please check your Supabase project URL configuration.";
    }
    return "";
  });
  const [clientErrors, setClientErrors] = useState<{ email?: string; password?: string }>({});

  // Confirmation email sent state
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const emailInputId = useId();
  const passwordInputId = useId();

  // Redirect signed-in non-guest users away from login/signup
  useEffect(() => {
    if (session && !isAnonymous && mode !== "upgrade") {
      router.replace("/");
    }
  }, [session, isAnonymous, mode, router]);

  // Handle Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      errors.email = "Email address is required.";
    } else if (!emailRegex.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const mapSupabaseError = (err: Error): string => {
    if (isSupabaseMisconfiguredError(err)) {
      return "Auth is misconfigured. Please check your Supabase project URL configuration.";
    }
    const msg = err.message.toLowerCase();
    if (msg.includes("invalid login credentials")) {
      return "Invalid email or password. Please verify your credentials.";
    }
    if (msg.includes("email not confirmed")) {
      return "Please confirm your email address. Check your inbox for the activation link.";
    }
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return "Too many attempts. Please wait a minute and try again.";
    }
    if (msg.includes("password should be at least")) {
      return "Password must be at least 8 characters long.";
    }
    return err.message || "An unexpected authentication error occurred. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setResendMessage("");

    if (!validate()) return;

    setIsSubmitting(true);
    const cleanEmail = email.trim();

    try {
      if (mode === "login") {
        const { error } = await signInWithPassword(cleanEmail, password);
        if (error) {
          setErrorMessage(mapSupabaseError(error));
          setIsSubmitting(false);
          return;
        }
        const destination = getSafeRedirectUrl(nextDestination, "/");
        router.push(destination);
      } else if (mode === "signup") {
        const { error } = await signUpWithPassword(cleanEmail, password);
        // Privacy rule: To avoid revealing registered emails, show confirmation state regardless
        if (error && !error.message.toLowerCase().includes("user already registered")) {
          setErrorMessage(mapSupabaseError(error));
          setIsSubmitting(false);
          return;
        }
        setIsEmailSent(true);
        setResendCooldown(60);
      } else if (mode === "upgrade") {
        const { error } = await upgradeGuestWithEmail(cleanEmail, password);
        if (error) {
          setErrorMessage(mapSupabaseError(error));
          setIsSubmitting(false);
          return;
        }
        setIsEmailSent(true);
        setResendCooldown(60);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? mapSupabaseError(err) : "Failed to process request."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMessage("");
    setIsGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setErrorMessage(mapSupabaseError(error));
      setIsGoogleLoading(false);
    }
  };

  const handleGuest = async () => {
    setErrorMessage("");
    setIsGuestLoading(true);
    const { error } = await signInAsGuest();
    if (error) {
      setErrorMessage(mapSupabaseError(error));
      setIsGuestLoading(false);
      return;
    }
    const destination = getSafeRedirectUrl(nextDestination, "/");
    router.push(destination);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setResendMessage("");
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      setResendMessage("Confirmation email resent successfully.");
      setResendCooldown(60);
    } catch {
      setResendMessage("Unable to resend confirmation email right now.");
    } finally {
      setIsResending(false);
    }
  };

  const titles: Record<AuthMode, { heading: string; subheading: string; submit: string }> = {
    login: {
      heading: "Sign in to your account",
      subheading: "Daily personalized intelligence for modern professionals",
      submit: "Sign In",
    },
    signup: {
      heading: "Create your account",
      subheading: "Get curated daily updates and custom career briefings",
      submit: "Create Account",
    },
    upgrade: {
      heading: "Upgrade your guest session",
      subheading: "Add your email and password to preserve your reading history and preferences",
      submit: "Save Account",
    },
  };

  const footerNode = (
    <Link
      href="/about"
      className="font-mono text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-amber-300 transition-colors inline-flex items-center gap-1.5 font-bold"
    >
      <span>Learn how Becon works & read our manifesto</span>
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );

  return (
    <AuthShell
      heading={titles[mode].heading}
      subheading={titles[mode].subheading}
      footer={footerNode}
    >
      {/* Account Deleted Banner */}
      {deletedNotice && (
        <div
          role="status"
          className="bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 p-2 sm:p-2.5 rounded-r-lg shadow-sm mb-2 sm:mb-2.5"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Your account and data have been permanently deleted.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert Box (aria-live region) */}
      <div aria-live="assertive" aria-atomic="true">
        {errorMessage && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-500 p-2 sm:p-2.5 rounded-r-lg shadow-sm mb-2 sm:mb-2.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono tracking-wide">
                {errorMessage}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SUCCESS / CONFIRMATION STATE */}
      {isEmailSent ? (
        <div className="text-center py-2 sm:py-3 space-y-2.5 sm:space-y-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Check your email
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="font-semibold text-slate-900 dark:text-white">{email}</span>.
              Please click the link to confirm your account and continue.
            </p>
          </div>

          {resendMessage && (
            <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-medium">
              {resendMessage}
            </p>
          )}

          <div className="pt-1.5 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
              className="inline-flex items-center justify-center gap-2 py-1.5 sm:py-2 px-4 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
              <span>
                {resendCooldown > 0
                  ? `Resend available in ${resendCooldown}s`
                  : "Resend confirmation email"}
              </span>
            </button>
            <Link
              href="/login"
              className="text-xs text-slate-500 dark:text-slate-400 hover:underline pt-1"
            >
              Return to sign in
            </Link>
          </div>
        </div>
      ) : (
        /* REGULAR AUTH FORM */
        <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-2.5 [@media(max-height:640px)]:space-y-1.5" noValidate>
          {/* Email Input */}
          <div>
            <label
              htmlFor={emailInputId}
              className="block text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-0.5 sm:mb-1 font-semibold"
            >
              Email address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id={emailInputId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                placeholder="you@example.com"
                className={`w-full pl-9 pr-3 py-1.5 sm:py-2 rounded-xl border text-xs sm:text-sm bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                  clientErrors.email
                    ? "border-rose-500 dark:border-rose-500"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
            </div>
            {clientErrors.email && (
              <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400 font-mono">
                {clientErrors.email}
              </p>
            )}
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-0.5 sm:mb-1">
              <label
                htmlFor={passwordInputId}
                className="block text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 font-semibold"
              >
                Password
              </label>
              {mode === "login" && (
                <Link
                  href="/forgot-password"
                  className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id={passwordInputId}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="••••••••"
                className={`w-full pl-9 pr-10 py-1.5 sm:py-2 rounded-xl border text-xs sm:text-sm bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                  clientErrors.password
                    ? "border-rose-500 dark:border-rose-500"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {clientErrors.password && (
              <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400 font-mono">
                {clientErrors.password}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleLoading || isGuestLoading}
            className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-md transition-all cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            <span>{titles[mode].submit}</span>
          </button>

          {/* Divider (when social/guest are shown) */}
          {mode !== "upgrade" && (
            <div className="relative my-1.5 sm:my-2 [@media(max-height:640px)]:my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[10px] sm:text-xs uppercase font-mono">
                <span className="bg-white dark:bg-slate-900 px-2 text-slate-400">
                  or continue with
                </span>
              </div>
            </div>
          )}

          {/* Google OAuth (Hidden in upgrade mode) */}
          {mode !== "upgrade" && (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isSubmitting || isGoogleLoading || isGuestLoading}
              className="w-full flex items-center justify-center gap-2.5 py-1.5 sm:py-2 px-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750 font-semibold text-xs sm:text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60"
            >
              {isGoogleLoading ? (
                <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
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
              <span>Google</span>
            </button>
          )}

          {/* Continue as Guest Button (Hidden in upgrade mode) */}
          {mode !== "upgrade" && (
            <div className="space-y-1 pt-0.5">
              <button
                type="button"
                onClick={handleGuest}
                disabled={isSubmitting || isGoogleLoading || isGuestLoading}
                className="group w-full flex items-center justify-center gap-2 py-1.5 sm:py-2 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-600 font-mono text-xs font-semibold tracking-wide transition-all cursor-pointer disabled:opacity-60"
              >
                {isGuestLoading ? (
                  <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Compass className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors shrink-0" />
                )}
                <span>Continue as Guest</span>
              </button>
              <p className="text-[10px] sm:text-[11px] text-center text-slate-500 dark:text-slate-400 leading-tight [@media(max-height:640px)]:hidden">
                Guest data may be lost. Create an account to keep your preferences.
              </p>
            </div>
          )}

          {/* Mode Switching Links */}
          <div className="pt-1 sm:pt-1.5 text-center text-xs text-slate-600 dark:text-slate-400">
            {mode === "login" ? (
              <p>
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Sign up
                </Link>
              </p>
            ) : mode === "signup" ? (
              <p>
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            ) : (
              <p>
                Decided not to upgrade right now?{" "}
                <Link
                  href="/"
                  className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Return to home
                </Link>
              </p>
            )}
          </div>
        </form>
      )}
    </AuthShell>
  );
}
