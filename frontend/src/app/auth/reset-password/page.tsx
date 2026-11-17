"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";

function ResetPasswordContent() {
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isLinkValid, setIsLinkValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [clientErrors, setClientErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    // Check if user is in an active recovery session
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsLinkValid(true);
        } else {
          // Listen to state change in case hash is being processed
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
            if (event === "PASSWORD_RECOVERY" || s) {
              setIsLinkValid(true);
            }
          });
          // Wait briefly
          await new Promise((resolve) => setTimeout(resolve, 800));
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession) {
            setIsLinkValid(true);
          }
          subscription.unsubscribe();
        }
      } catch {
        setIsLinkValid(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkSession();
  }, []);

  const validate = (): boolean => {
    const errors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      errors.password = "New password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#070b12]">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-200 relative">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50">
        <ThemeToggle size="sm" />
      </div>

      <div className="w-full max-w-md mx-auto my-auto flex flex-col items-center">
        <Link href="/" className="hover:opacity-85 transition-opacity mb-2 sm:mb-3">
          <h1 className="font-serif text-3xl sm:text-4xl font-black tracking-widest text-slate-950 dark:text-white uppercase drop-shadow-sm">
            B E C O N
          </h1>
        </Link>
        <h2 className="mt-1 text-center text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 font-serif">
          Set new password
        </h2>
        <p className="mt-1 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium max-w-sm">
          Create a secure password with at least 8 characters
        </p>

        <div className="w-full mt-6">
          <div className="bg-white dark:bg-slate-900 py-7 px-5 sm:px-8 shadow-xl dark:shadow-slate-950/80 border-2 border-slate-900 dark:border-slate-800 rounded-2xl relative overflow-hidden transition-colors">
            <div className="relative z-10 space-y-4">
              {!isLinkValid ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                      Link Expired or Invalid
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                      This password reset link is invalid or has expired. Please request a new link to proceed.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      href="/forgot-password"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                    >
                      <span>Request new link</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ) : isSuccess ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                      Password Updated
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-mono">
                      Your password has been changed successfully. Redirecting you to home...
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      href="/"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-950 dark:bg-emerald-600 text-white font-semibold text-xs"
                    >
                      <span>Continue to Home</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {errorMessage && (
                    <div className="bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-500 p-3 rounded-r-lg shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                        <p className="text-xs font-bold text-rose-700 dark:text-rose-300 font-mono tracking-wide">
                          {errorMessage}
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1 font-semibold"
                    >
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        placeholder="••••••••"
                        className={`w-full pl-9 pr-10 py-2.5 rounded-xl border text-sm bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
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
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-mono">
                        {clientErrors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1 font-semibold"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isSubmitting}
                        placeholder="••••••••"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                          clientErrors.confirmPassword
                            ? "border-rose-500 dark:border-rose-500"
                            : "border-slate-300 dark:border-slate-700"
                        }`}
                      />
                    </div>
                    {clientErrors.confirmPassword && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-mono">
                        {clientErrors.confirmPassword}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : null}
                    <span>Update Password</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#070b12]">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
