"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowRight, Lock, Mail, User, AlertCircle } from "lucide-react";
import { useLoader } from "@/context/LoadingContext";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { showLoader } = useLoader();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("becon_token", data.access_token);
        showLoader(
          "Creating Developer Profile...",
          "Setting up your AI career briefing engine..."
        );
        router.push("/onboarding");
      } else {
        const data = await res.json();
        setError(data.detail || "Failed to register");
      }
    } catch (err) {
      setError("Unable to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-slate-900 selection:text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <Link href="/" className="hover:opacity-85 transition-opacity mb-4">
          <h1 className="font-serif text-4xl sm:text-5xl font-black tracking-widest text-slate-950 uppercase drop-shadow-sm flex items-center gap-3">
            B E C O N
          </h1>
        </Link>
        <h2 className="mt-2 text-center text-3xl font-black tracking-tight text-slate-900 font-serif">
          Create Developer Profile
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 font-medium">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-rose-600 hover:text-rose-500 transition-colors">
            Sign in here
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border-2 border-slate-900 sm:rounded-2xl sm:px-10 relative overflow-hidden">
          {/* Glassmorphism gradient orb */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>

          <form className="space-y-6 relative z-10" onSubmit={handleRegister} autoComplete="off">
            {error && (
              <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg shadow-sm">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-rose-500" />
                  <p className="text-sm font-bold text-rose-700 font-mono uppercase tracking-wider">{error}</p>
                </div>
              </div>
            )}



            <div>
              <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg pl-10 pr-3 py-2.5 text-slate-950 font-semibold text-sm transition-colors outline-none shadow-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg pl-10 pr-3 py-2.5 text-slate-950 font-semibold text-sm transition-colors outline-none shadow-xs"
                  required
                  minLength={6}
                />
              </div>
              <p className="text-[10px] font-mono text-slate-500 mt-1.5">
                Must be at least 6 characters long.
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-black font-mono tracking-widest uppercase text-white bg-rose-600 hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-600 transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
              >
                {isLoading ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Create Account <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
