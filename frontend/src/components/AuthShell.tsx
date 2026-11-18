"use client";

import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthShellProps {
  heading: string;
  subheading?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ heading, subheading, children, footer }: AuthShellProps) {
  return (
    <div className="h-dvh min-h-dvh w-full bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col justify-center items-center px-4 sm:px-6 overflow-y-auto py-2 [@media(max-height:560px)]:py-6 transition-colors duration-200 relative">
      {/* Theme Toggle pinned in top-right */}
      <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-50">
        <ThemeToggle size="sm" />
      </div>

      <div className="w-full max-w-md mx-auto my-auto flex flex-col items-center">
        {/* Brand Masthead */}
        <Link
          href="/"
          className="hover:opacity-85 transition-opacity mb-1 sm:mb-1.5 [@media(max-height:640px)]:mb-0.5"
        >
          <h1 className="font-serif text-2xl sm:text-3xl [@media(max-height:760px)]:text-2xl [@media(max-height:640px)]:text-xl font-black tracking-widest text-slate-950 dark:text-white uppercase drop-shadow-sm">
            B E C O N
          </h1>
        </Link>

        {/* Heading */}
        <h2 className="text-center text-xl sm:text-2xl [@media(max-height:760px)]:text-lg [@media(max-height:640px)]:text-base font-black tracking-tight text-slate-900 dark:text-slate-50 font-serif">
          {heading}
        </h2>

        {/* Subheading - hidden on compact viewports <= 760px to preserve vertical budget */}
        {subheading && (
          <p className="mt-0.5 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium max-w-sm [@media(max-height:760px)]:hidden">
            {subheading}
          </p>
        )}

        {/* Main Card */}
        <div className="w-full mt-2.5 sm:mt-4 [@media(max-height:760px)]:mt-2 [@media(max-height:640px)]:mt-1.5">
          <div className="bg-white dark:bg-slate-900 py-3.5 sm:py-5 [@media(max-height:760px)]:py-3 [@media(max-height:640px)]:py-2.5 px-4 sm:px-7 [@media(max-height:760px)]:px-5 shadow-xl dark:shadow-slate-950/80 border-2 border-slate-900 dark:border-slate-800 rounded-2xl relative overflow-hidden transition-colors">
            {/* Ambient gradients */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-200 dark:bg-rose-950/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-200 dark:bg-indigo-950/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 pointer-events-none" />

            <div className="relative z-10">{children}</div>
          </div>

          {/* Optional Footer (e.g. Manifesto link) */}
          {footer && (
            <div className="mt-2 sm:mt-3 [@media(max-height:760px)]:mt-1.5 [@media(max-height:640px)]:mt-1 text-center">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
