"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthForm, type AuthMode } from "@/components/AuthForm";

function RegisterContent() {
  const searchParams = useSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "1";
  const mode: AuthMode = isUpgrade ? "upgrade" : "signup";
  return <AuthForm mode={mode} />;
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] dark:bg-[#070b12]">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
