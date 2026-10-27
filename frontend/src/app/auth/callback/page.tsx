"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function AuthCallbackPage() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("Connecting your Google profile...");

  useEffect(() => {
    let isHandled = false;

    const syncUserWithBackend = async (user: any) => {
      if (isHandled) return;
      isHandled = true;

      setStatusMessage("Finalizing intelligence workspace...");
      const email = user.email;
      const metadata = user.user_metadata || {};
      const name = metadata.full_name || metadata.name || email?.split("@")[0] || "User";
      // Google avatar URL is stored in user_metadata.avatar_url or user_metadata.picture
      const picture_url = metadata.avatar_url || metadata.picture || null;

      try {
        const res = await fetch(`${API}/api/auth/supabase-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            name,
            picture_url,
            provider: "google"
          })
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("becon_token", data.access_token);
          localStorage.setItem("becon_user_name", name);
          if (picture_url) {
            localStorage.setItem("becon_user_avatar", picture_url);
          }
          localStorage.removeItem("becon_is_guest");
          router.push("/");
        } else {
          router.push("/login?error=sync_failed");
        }
      } catch (e) {
        console.error("Backend sync failed:", e);
        router.push("/login?error=server_unreachable");
      }
    };

    const handleAuthCallback = async () => {
      try {
        // 1. Check for URL error parameters from OAuth provider
        const urlParams = new URLSearchParams(window.location.search);
        const errorDesc = urlParams.get("error_description") || urlParams.get("error");
        if (errorDesc) {
          console.error("OAuth error returned from provider:", errorDesc);
          router.push(`/login?error=${encodeURIComponent(errorDesc)}`);
          return;
        }

        // 2. PKCE code exchange if ?code= is present in the URL
        const code = urlParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("Code exchange error:", error.message);
            router.push(`/login?error=${encodeURIComponent(error.message)}`);
            return;
          }
          if (data?.session?.user) {
            await syncUserWithBackend(data.session.user);
            return;
          }
        }

        // 3. Check existing or restored session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (session?.user) {
          await syncUserWithBackend(session.user);
          return;
        }

        // 4. Fallback listener for auth state changes
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          if (currentSession?.user) {
            await syncUserWithBackend(currentSession.user);
          }
        });

        return () => {
          authListener?.subscription?.unsubscribe();
        };
      } catch (err: any) {
        console.error("Auth callback error:", err);
        router.push(`/login?error=${encodeURIComponent(err?.message || "auth_failed")}`);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="h-screen w-full bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="w-12 h-12 rounded-full border-3 border-amber-400 border-t-transparent animate-spin mb-4" />
        <h2 className="font-serif text-2xl font-black tracking-tight mb-2">Authenticating with Google</h2>
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{statusMessage}</p>
      </div>
    </div>
  );
}

