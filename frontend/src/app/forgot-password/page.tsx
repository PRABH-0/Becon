"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setEmailError("");

    const cleanEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail) {
      setEmailError("Email address is required.");
      return;
    }
    if (!emailRegex.test(cleanEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Always show neutral confirmation to prevent account enumeration
      await sendPasswordReset(cleanEmail);
      setIsSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to send reset link.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          Reset password
        </h2>
        <p className="mt-1 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium max-w-sm">
          Enter your email to receive recovery instructions
        </p>

        <div className="w-full mt-6">
          <div className="bg-white dark:bg-slate-900 py-7 px-5 sm:px-8 shadow-xl dark:shadow-slate-950/80 border-2 border-slate-900 dark:border-slate-800 rounded-2xl relative overflow-hidden transition-colors">
            <div className="relative z-10 space-y-4">
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

              {isSubmitted ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                      Check your email
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      If an account exists for{" "}
                      <span className="font-semibold text-slate-900 dark:text-white">{email}</span>,
                      you will receive password reset instructions shortly. Please check your inbox and spam folder.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to sign in</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="reset-email"
                      className="block text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1 font-semibold"
                    >
                      Email address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isSubmitting}
                        placeholder="you@example.com"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                          emailError
                            ? "border-rose-500 dark:border-rose-500"
                            : "border-slate-300 dark:border-slate-700"
                        }`}
                      />
                    </div>
                    {emailError && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-mono">
                        {emailError}
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
                    <span>Send Reset Instructions</span>
                  </button>

                  <div className="pt-2 text-center">
                    <Link
                      href="/login"
                      className="font-mono text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to sign in</span>
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
