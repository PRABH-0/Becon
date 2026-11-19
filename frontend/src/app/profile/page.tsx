"use client";

import {
  User,
  Target,
  Search,
  MessageSquare,
  Shield,
  Save,
  Sparkles,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Trash2,
} from "lucide-react";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, deleteAccount, type UserMe } from "@/lib/api";
import { clearBeconCaches, syncIdentityCache } from "@/lib/cache";
import { resolveUserIdentity } from "@/lib/identity";
import { supabase } from "@/lib/supabaseClient";
import { GuestBanner } from "@/components/GuestBanner";
import { HeaderActions } from "@/components/HeaderActions";
import { RequireAuth } from "@/components/RequireAuth";

const SUGGESTED_ROLES = [
  "Accountant / Finance",
  "Shop Owner / Retail",
  "Software Engineer",
  "Business & Sales Manager",
  "E-Commerce Seller",
  "Operations & Supply Chain",
  "Healthcare Professional",
  "Legal & Corporate Advisor"
];

const POPULAR_TOPICS = [
  "Tax Regulations & GST Compliance",
  "Retail & Shop Inventory Management",
  "Small Business Growth & Finance",
  "E-Commerce & Digital Sales",
  "Corporate Accounting & Audit Standards",
  "Artificial Intelligence & Productivity Tools",
  "Customer Retention & Retail POS",
  "Financial Forecasting & Cash Flow",
  "Digital Marketing & Social Selling",
  "Software Engineering & Web Apps",
  "Python, Data & Analytics",
  "Cloud Tools & Cyber Security",
  "Supply Chain & Vendor Management",
  "Banking, Payments & Fintech",
  "Business Law & Regulatory Filings",
  "Modern Cloud & Systems Architecture"
];

const EXTENDED_TECH_CATALOG = [
  ...POPULAR_TOPICS,
  "Income Tax Returns & Auditing",
  "Bookkeeping & Tally / QuickBooks",
  "Payroll Management & Compliance",
  "Retail Pricing Strategy & Merchandising",
  "Shop Floor Management & Customer Experience",
  "Wholesale Purchasing & Distributor Networks",
  "Financial Risk Management & Reporting",
  "Startup Fundraising & Pitch Decks",
  "Import & Export Customs Documentation",
  "SEO & Local Google Maps Marketing",
  "React & Next.js Systems",
  "Rust & Systems Programming",
  "Docker & Kubernetes DevOps",
  ".NET Core & Enterprise APIs",
  "FastAPI & Python Microservices",
  "PostgreSQL & Database Optimization"
];

const TONE_OPTIONS = [
  "Clear & Actionable (Executive Summary)",
  "Practical Business & Financial Takeaways",
  "In-Depth Professional Analysis",
];

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [experience, setExperience] = useState("Mid-Level / Established (3-5 Years)");
  const [interests, setInterests] = useState<string[]>([
    "Small Business Growth & Finance",
    "Artificial Intelligence & Productivity Tools"
  ]);
  const [customPrompt, setCustomPrompt] = useState(
    "Highlight practical takeaways, commercial and financial impacts, and actionable steps tailored to my daily work."
  );
  const [aiTone, setAiTone] = useState("Practical & Actionable");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [validationError, setValidationError] = useState("");
  const router = useRouter();
  const { showLoader, hideLoader } = useLoader();
  const { isAnonymous, signOut, user, me } = useAuth();
  const authSnapshotRef = useRef({ isAnonymous, user, me });
  useEffect(() => {
    authSnapshotRef.current = { isAnonymous, user, me };
  }, [isAnonymous, user, me]);

  const headerIdentity = resolveUserIdentity({
    profile: { name, role, email },
    me,
    user,
    isAnonymous,
  });

  // Danger zone delete account state
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Autocomplete search state
  const [topicSearch, setTopicSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [isAiResult, setIsAiResult] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local filter: instant prefix/substring matching from extended catalog
  const queryLower = topicSearch.trim().toLowerCase();
  const localMatches = queryLower
    ? EXTENDED_TECH_CATALOG.filter(
        (t) =>
          (t.toLowerCase().startsWith(queryLower) || t.toLowerCase().includes(queryLower)) &&
          !interests.includes(t)
      )
        .sort((a, b) => {
          // Prioritize prefix matches first
          const aStarts = a.toLowerCase().startsWith(queryLower);
          const bStarts = b.toLowerCase().startsWith(queryLower);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.localeCompare(b);
        })
        .slice(0, 3)
    : [];

  // Display suggestions: local matches first, filled or complemented by AI completions
  const combinedSuggestions: string[] = [];
  for (const item of localMatches) {
    if (!combinedSuggestions.includes(item)) combinedSuggestions.push(item);
  }
  for (const item of aiSuggestions) {
    if (!interests.includes(item) && !combinedSuggestions.includes(item) && combinedSuggestions.length < 3) {
      combinedSuggestions.push(item);
    }
  }

  const filteredSuggestions = combinedSuggestions.slice(0, 3);

  // Dynamic AI keyword completion: call backend when typing
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const query = topicSearch.trim();

    if (!query) {
      setAiSuggestions([]);
      setIsAiResult(false);
      setIsAiSearching(false);
      return;
    }

    // Debounce backend query
    setIsAiSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ matches?: string[] }>(
          `/api/topics/search?q=${encodeURIComponent(query)}`
        );
        if (data.matches && data.matches.length > 0) {
          setAiSuggestions(data.matches);
          setIsAiResult(true);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.log("AI topic search unavailable:", err);
      } finally {
        setIsAiSearching(false);
      }
    }, 350);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [topicSearch, interests]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (topic: string) => {
    const trimmed = topic.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests((prev) => [...prev, trimmed]);
    }
    setTopicSearch("");
    setShowSuggestions(false);
    setAiSuggestions([]);
    setIsAiResult(false);
    setHighlightedIndex(-1);
  };


  useEffect(() => {
    // Check if user is in setup mode from URL
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("setup") === "true") {
        setIsSetupMode(true);
      }
    }

    // Load saved profile from backend API, then prefill empty name/email from Supabase identity (non-guests only)
    const fetchProfile = async () => {
      showLoader("Loading User Profile...", "Retrieving your profile & topic interests from database...");
      let savedName = "";
      let savedEmail = "";

      const cleanCandidateName = (val: unknown): string => {
        if (typeof val !== "string") return "";
        const trimmed = val.trim();
        if (!trimmed || trimmed === "Developer" || trimmed === "User" || trimmed === "Guest Reader") {
          return "";
        }
        return trimmed;
      };

      try {
        const parsed = await apiFetch<any>("/api/profile");
        savedName = cleanCandidateName(parsed?.name);
        savedEmail = typeof parsed?.email === "string" ? parsed.email.trim() : "";

        if (savedName) setName(savedName);
        if (savedEmail) setEmail(savedEmail);
        if (parsed?.role) setRole(parsed.role);
        if (parsed?.experience) setExperience(parsed.experience);
        if (parsed?.interests && parsed.interests.trim().length > 0) {
          setInterests(parsed.interests.split(",").map((i: string) => i.trim()).filter(Boolean));
        }
        if (parsed?.customPrompt) setCustomPrompt(parsed.customPrompt);
        if (parsed?.aiTone) setAiTone(parsed.aiTone);
      } catch (err) {
        console.error("Failed to load profile from backend", err);
      }

      // Prefill empty name/email from (a) GET /api/me then (b) AuthContext user metadata; guests get no prefill
      const { isAnonymous: isGuest, user: authUser, me: authMe } = authSnapshotRef.current;
      const isGuestAccount = Boolean(isGuest || authMe?.is_anonymous || authUser?.is_anonymous);

      if (!isGuestAccount && (!savedName || !savedEmail)) {
        let meData: UserMe | null = authMe;
        if (!meData) {
          try {
            meData = await apiFetch<UserMe>("/api/me");
          } catch {
            meData = null;
          }
        }

        if (!meData?.is_anonymous) {
          const meta = (authUser?.user_metadata || {}) as Record<string, unknown>;
          const metaName =
            cleanCandidateName(meta.full_name) || cleanCandidateName(meta.name);
          const meName = cleanCandidateName(meData?.name);
          const meEmail = typeof meData?.email === "string" ? meData.email.trim() : "";
          const authEmail = typeof authUser?.email === "string" ? authUser.email.trim() : "";

          const prefillEmail = savedEmail || meEmail || authEmail;
          const prefillName = savedName || meName || metaName;

          if (!savedName && prefillName) {
            setName((prev) => (prev.trim() ? prev : prefillName));
          }
          if (!savedEmail && prefillEmail) {
            setEmail((prev) => (prev.trim() ? prev : prefillEmail));
          }
        }
      }

      hideLoader();
    };
    fetchProfile();
  }, [hideLoader, showLoader]);

  const toggleInterest = (topic: string) => {
    setValidationError("");
    if (interests.includes(topic)) {
      setInterests(interests.filter((t) => t !== topic));
    } else {
      setInterests([...interests, topic]);
    }
  };

  const handleToneKeyDown = (e: React.KeyboardEvent, currentIdx: number) => {
    let nextIdx = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIdx = (currentIdx + 1) % TONE_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIdx = (currentIdx - 1 + TONE_OPTIONS.length) % TONE_OPTIONS.length;
    }
    if (nextIdx >= 0) {
      setAiTone(TONE_OPTIONS[nextIdx]);
      const btn = document.getElementById(`tone-radio-${nextIdx}`);
      btn?.focus();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (customPrompt.length > 500) {
      setValidationError("Custom instruction prompt cannot exceed 500 characters.");
      return;
    }

    if (interests.length === 0) {
      setValidationError("Please select at least 1 interested field so our AI can curate your Gazette feed.");
      return;
    }

    const finalRole = role.trim() || "Professional / User";
    const finalName = name.trim() || "User";

    const profileData = {
      name: finalName,
      role: finalRole,
      email,
      experience,
      interests: interests.join(", "),
      customPrompt,
      aiTone,
    };

    showLoader(
      "Personalizing Your Daily Gazette...",
      `Configuring AI news pipeline for ${finalRole} & ${interests.length} focus topics...`
    );
    try {
      await apiFetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileData),
      });
      syncIdentityCache(isAnonymous ? null : finalName, headerIdentity.avatarUrl);
      // Pre-warm and regenerate personalized briefing cards with the new focus areas
      const params = new URLSearchParams({
        role: finalRole,
        interests: interests.join(", "),
        custom_prompt: customPrompt,
        refresh: "true",
      });
      apiFetch(`/api/briefings?${params.toString()}`).catch(() => {});

      // Launch home page so AI delivers the customized content!
      setTimeout(() => {
        hideLoader();
        router.push("/");
      }, 700);
    } catch (err) {
      console.error("Failed to save profile to backend", err);
      hideLoader();
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE" || isDeleting) return;
    setDeleteError("");
    setIsDeleting(true);
    try {
      await deleteAccount();
      await supabase.auth.signOut({ scope: "local" });
      clearBeconCaches();
      router.replace("/login?deleted=1");
    } catch (err: any) {
      if (err?.status === 503) {
        setDeleteError("Account deletion is not available right now, please try again later.");
      } else {
        setDeleteError("Account could not be deleted at this time. Please check your connection and try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <RequireAuth>
      <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans selection:bg-slate-900 selection:text-white pb-20 transition-colors duration-200">
      {/* 1. HEADER BAR */}
      <header className="bg-slate-950 text-slate-200 py-2.5 sm:py-3 px-3 sm:px-6 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="hover:opacity-85 transition-opacity shrink-0">
              <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden md:inline truncate">
              AI PERSONALIZATION &amp; USER PROFILE
            </span>
          </div>

          <HeaderActions
            backLink={{
              href: "/",
              label: "Gazette",
              ariaLabel: "Return to Daily Gazette",
            }}
            identity={headerIdentity}
            email={email || me?.email || user?.email}
            currentPage="profile"
            onSignOut={async () => {
              await signOut();
              router.push("/login");
            }}
          />
        </div>
      </header>

      {/* Guest Banner */}
      <GuestBanner />

      {/* 2. SUCCESS NOTIFICATION TOAST */}
      {saveSuccess && (
        <div className="bg-emerald-600 text-white font-mono text-xs sm:text-sm font-bold py-3 px-6 text-center shadow-lg transition-all animate-in fade-in slide-in-from-top duration-300 flex items-center justify-center gap-2">
          <span className="text-base"><Sparkles className="w-5 h-5" /></span>
          <span>SUCCESS! Your User Profile & AI Personalization Preferences Have Been Synced!</span>
        </div>
      )}

      {/* 3. PROFILE & AI TUNING FORM CONTAINER */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-10">
        {/* NEW ACCOUNT SETUP ONBOARDING BANNER */}
        {isSetupMode && (
          <div className="mb-8 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-slate-950 text-amber-300 font-mono font-black text-lg flex items-center justify-center shrink-0 shadow-sm border border-slate-800">
                ★
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-amber-400 text-slate-950">
                    STEP 2 OF 2 • SETUP
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    NEW ACCOUNT CREATED
                  </span>
                </div>
                <h3 className="font-serif font-black text-lg sm:text-xl text-slate-950 dark:text-white mt-1">
                  Select Your Role, Profession & Interested Topics
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium mt-0.5 max-w-2xl">
                  Pick the topics, industries, and focus areas you care about (e.g. Accounting, Retail, Business, Tech). When you hit Save, Becon AI will personalize your morning intelligence gazette and launch your feed!
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-black uppercase px-3 py-1.5 rounded-lg bg-slate-900 text-amber-300 shrink-0 shadow-2xs">
              AI READY
            </span>
          </div>
        )}

        <div className="border-b-2 border-slate-900 dark:border-slate-800 pb-4 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-slate-950 dark:text-white tracking-tight leading-none mb-1">
              User Profile & AI Personalization
            </h2>
            <p className="text-slate-600 dark:text-slate-400 font-normal text-sm sm:text-base">
              Tailor how Becon&apos;s AI engine reads breaking industry updates, aligns with your profession & interests, and constructs your personalized action briefings.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: BASIC USER & PROFESSIONAL DETAILS (5 COLUMNS) */}
          <section className="lg:col-span-5 space-y-6 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-800 p-6 sm:p-8 rounded-2xl shadow-md h-fit">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 font-mono flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-950 dark:text-white flex items-center gap-2">
                <span><User className="w-4 h-4" /></span> USER & PROFESSIONAL DETAILS
              </span>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-2 py-0.5 rounded uppercase">
                IDENTITY
              </span>
            </div>

            <div className="space-y-4 font-sans text-sm">
              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-3.5 py-2 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-colors outline-none shadow-xs"
                  placeholder="Enter your name"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Primary Profession / Role
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-3.5 py-2 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-colors outline-none shadow-xs"
                  placeholder="e.g. Software Engineer, Tech Lead"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SUGGESTED_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                        role === r
                          ? "bg-slate-900 dark:bg-amber-400 text-amber-300 dark:text-slate-950 border-slate-900 dark:border-amber-400 shadow-2xs"
                          : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] font-mono text-slate-500 mt-1.5">
                  * Used directly by the AI engine for the &quot;Impact on Your Role&quot; section.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address (Used for your account)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-3.5 py-2 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-colors outline-none shadow-xs"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Experience Level
                </label>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-3.5 py-2 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-colors outline-none cursor-pointer shadow-xs"
                >
                  <option value="Entry / Beginner (0-2 Years)">Entry / Beginner (0-2 Years)</option>
                  <option value="Mid-Level / Established (3-5 Years)">Mid-Level / Established (3-5 Years)</option>
                  <option value="Senior / Experienced (5+ Years)">Senior / Experienced (5+ Years)</option>
                  <option value="Lead / Business Owner / Director">Lead / Business Owner / Director</option>
                </select>
              </div>
            </div>
            
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-300 dark:border-slate-800 font-mono text-xs space-y-2">
              <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span><Shield className="w-4 h-4" /></span> PRIVACY &amp; AI TRANSPARENCY
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed font-sans font-medium">
                Your profile is stored in your Becon account. Your topics and custom prompt may be sent to our AI provider (Google Gemini) to write your cards.
              </p>
            </div>
          </section>

          {/* RIGHT COLUMN: AI INTEL & TOPIC PREFERENCES (7 COLUMNS) */}
          <section className="lg:col-span-7 space-y-8 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-800 p-6 sm:p-8 rounded-2xl shadow-md flex flex-col justify-between">
            <div className="space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3 font-mono flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-950 dark:text-white flex items-center gap-2">
                  <span><Target className="w-4 h-4" /></span> WHAT ARE YOU INTERESTED IN MOST? (SELECT TOPICS)
                </span>
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/70 text-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold px-2 py-0.5 rounded uppercase">
                  AI TOPICS & FOCUS
                </span>
              </div>

              {validationError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-500 text-rose-800 text-xs font-mono font-bold flex items-center gap-2 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
                Search or click topics below to highlight what Becon&apos;s live AI engine should prioritize for your daily intelligence feed:
              </p>

              {/* ACTIVE FOCUS TOPICS / CURRENTLY SELECTED TOPICS */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Active Focus Topics ({interests.length} Selected)
                  </span>
                  {interests.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setInterests([])}
                      className="text-[11px] font-mono text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {interests.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-inner">
                    {interests.map((topic) => (
                      <span
                        key={topic}
                        className="inline-flex items-center gap-1.5 bg-slate-900 text-amber-300 border border-slate-700/90 pl-3 pr-2 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wide shadow-xs transition-all hover:border-amber-400/50"
                      >
                        <span className="text-emerald-400">✓</span>
                        <span>{topic}</span>
                        <button
                          type="button"
                          onClick={() => toggleInterest(topic)}
                          className="ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded p-0.5 transition-colors cursor-pointer leading-none text-sm"
                          aria-label={`Remove ${topic}`}
                          title="Remove topic"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500 font-mono">
                    No topics selected yet. Type in the search box below or pick from starter topics.
                  </div>
                )}
              </div>

              {/* AUTOCOMPLETE SEARCH INPUT */}
              <div ref={searchRef} className="relative pt-1 space-y-1">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    id="topic-search-input"
                    type="text"
                    value={topicSearch}
                    onChange={(e) => {
                      setTopicSearch(e.target.value);
                      setShowSuggestions(true);
                      setHighlightedIndex(-1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setShowSuggestions(true);
                        setHighlightedIndex((prev) =>
                          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        // If user explicitly navigated down to a suggestion via arrow keys, select that option
                        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
                          selectSuggestion(filteredSuggestions[highlightedIndex]);
                        } else {
                          // Otherwise, save the exact typed input from the search field
                          const typed = topicSearch.trim();
                          if (typed) {
                            selectSuggestion(typed);
                          }
                        }
                      } else if (e.key === "Escape") {
                        setShowSuggestions(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                    onFocus={() => topicSearch.trim() && setShowSuggestions(true)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-slate-950 dark:text-slate-100 font-semibold text-sm transition-all outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-2xs"
                    placeholder="Type to search or complete topics… e.g. tax, retail, finance, inventory, ai"
                    autoComplete="off"
                  />
                  {topicSearch && (
                    <button
                      type="button"
                      onClick={() => { setTopicSearch(""); setShowSuggestions(false); setHighlightedIndex(-1); }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none cursor-pointer transition-colors"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* SUGGESTIONS DROPDOWN */}
                {showSuggestions && topicSearch.trim() && (
                  <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* DROPDOWN HEADER */}
                    <div className="px-4 py-2 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isAiResult ? (
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        )}
                        <span className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-300">
                          {isAiResult ? "AI Suggested Topics" : "Keyword Autocomplete Matches"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-300">
                        for &quot;{topicSearch}&quot;
                      </span>
                    </div>

                    {/* COMPLETION ITEMS */}
                    {filteredSuggestions.map((topic, idx) => {
                      const isHighlighted = highlightedIndex === idx;
                      return (
                        <button
                          key={topic}
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => selectSuggestion(topic)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 cursor-pointer transition-all ${
                            isHighlighted
                              ? "bg-amber-100 text-slate-950 font-bold border-l-4 border-amber-500 pl-3.5"
                              : "hover:bg-amber-50 text-slate-800"
                          } ${idx < filteredSuggestions.length - 1 ? "border-b border-slate-100" : ""}`}
                        >
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black transition-colors font-mono ${
                            isHighlighted
                              ? "bg-amber-300 text-slate-950"
                              : "bg-slate-100 text-slate-600 group-hover:bg-amber-200 group-hover:text-slate-950"
                          }`}>
                            +
                          </span>
                          <span className="text-sm font-semibold transition-colors">
                            {topic}
                          </span>
                          {isAiResult && (
                            <span className="text-[9px] font-mono font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                              AI
                            </span>
                          )}
                          <span className="ml-auto text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 group-hover:text-amber-700 transition-colors">
                            Click to Select
                          </span>
                        </button>
                      );
                    })}

                    {/* ADD EXACT CUSTOM KEYWORD (ENTER SHORTCUT) */}
                    {topicSearch.trim() && !interests.includes(topicSearch.trim()) && (
                      <button
                        type="button"
                        onClick={() => selectSuggestion(topicSearch.trim())}
                        className={`w-full text-left px-4 py-2.5 border-t border-slate-200 flex items-center gap-2.5 cursor-pointer text-xs font-mono font-bold transition-colors ${
                          highlightedIndex === -1
                            ? "bg-slate-100 text-slate-900"
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <span className="w-5 h-5 rounded flex items-center justify-center bg-slate-200 text-slate-800 font-bold">
                          ↵
                        </span>
                        <span>Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-sans">Enter</kbd> to add exact &quot;{topicSearch.trim()}&quot;</span>
                        <span className="ml-auto text-[10px] text-amber-700 font-mono uppercase bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Exact Input
                        </span>
                      </button>
                    )}

                    {/* AI SEARCHING INDICATOR */}
                    {isAiSearching && filteredSuggestions.length === 0 && (
                      <div className="px-4 py-3.5 flex items-center justify-center gap-3 bg-indigo-50/50">
                        <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin"></span>
                        <span className="text-xs font-mono font-bold text-indigo-700 uppercase tracking-wider">
                          AI completing keywords for &quot;{topicSearch}&quot;…
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* POPULAR STARTER STACKS */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                  Popular Starter Stacks (Click to Toggle)
                </span>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_TOPICS.map((topic) => {
                    const isSelected = interests.includes(topic);
                    return (
                      <button
                        type="button"
                        key={topic}
                        onClick={() => toggleInterest(topic)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer border shadow-2xs flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-slate-950 dark:bg-amber-400 text-amber-300 dark:text-slate-950 border-slate-950 dark:border-amber-400 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-slate-400"
                        }`}
                      >
                        <span>{isSelected ? "✓" : "+"}</span>
                        <span>{topic}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="font-mono text-xs font-black uppercase tracking-widest text-slate-950 dark:text-white flex items-center gap-2">
                  <span><MessageSquare className="w-4 h-4" /></span> CUSTOM AI INSTRUCTION PROMPT
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
                  Tell the AI engine how you want it to format and analyze industry news items for you:
                </p>
                <textarea
                  rows={4}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs sm:text-sm p-4 rounded-xl leading-relaxed outline-none shadow-xs resize-y"
                  placeholder="e.g. Highlight practical takeaways, business and financial impacts, and actionable steps tailored to my daily work..."
                />
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Max 500 characters (validated by Becon AI).
                  </span>
                  <span
                    data-testid="prompt-char-counter"
                    className={`font-bold text-xs ${
                      customPrompt.length > 500
                        ? "text-rose-600 dark:text-rose-400"
                        : customPrompt.length >= 450
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {customPrompt.length} / 500
                  </span>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <label className="block text-xs font-bold font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Action Card Tone & Depth Density
                </label>
                <div
                  role="radiogroup"
                  aria-label="Action Card Tone & Depth Density"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                >
                  {TONE_OPTIONS.map((tone, idx) => {
                    const isSelected = aiTone === tone;
                    return (
                      <button
                        key={tone}
                        id={`tone-radio-${idx}`}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => setAiTone(tone)}
                        onKeyDown={(e) => handleToneKeyDown(e, idx)}
                        className={`p-3 rounded-xl border text-left text-xs font-mono font-bold tracking-wider cursor-pointer transition-all outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-amber-400 ${
                          isSelected
                            ? "bg-slate-950 dark:bg-amber-400 text-amber-300 dark:text-slate-950 border-2 border-slate-950 dark:border-amber-400 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase opacity-75">TONE STYLE</span>
                          <span
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? "border-amber-300 dark:border-slate-950"
                                : "border-slate-400 dark:border-slate-600"
                            }`}
                          >
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 dark:bg-slate-950" />
                            )}
                          </span>
                        </div>
                        <div className="leading-snug">{tone}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t-2 border-slate-900 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {isSetupMode ? "Ready to launch your personalized intelligence deck?" : "Ready to deploy preferences to Becon AI?"}
              </span>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 bg-slate-950 hover:bg-slate-800 text-amber-300 dark:bg-amber-400 dark:hover:bg-amber-300 dark:text-slate-950 border border-slate-800 dark:border-amber-400 font-mono font-black text-sm uppercase tracking-widest rounded-xl transition-colors shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span><Save className="w-4 h-4" /> {isSetupMode ? "Save Preferences & Launch Gazette Feed" : "Save Preferences & Enter Home Page"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>

        </form>

        {/* 4. DANGER ZONE: ACCOUNT DELETION */}
        <section className="mt-12 p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border-2 border-rose-300 dark:border-rose-950/80 shadow-md">
          <div className="flex items-start gap-3.5 mb-4">
            <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                Danger Zone: Delete Account
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1 leading-relaxed">
                Permanently delete your Becon account and all associated data, including saved cards, reading history, follows, and AI profile preferences. This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="mb-4 bg-rose-50 dark:bg-rose-950/40 border-l-4 border-rose-500 p-3 rounded-r-lg">
              <p className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300">{deleteError}</p>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <label htmlFor="confirm-delete-input" className="block text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
              To confirm deletion, type <span className="font-bold text-rose-600 select-all">DELETE</span> below:
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                id="confirm-delete-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={isDeleting}
                placeholder="DELETE"
                className="px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isDeleting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Permanently Delete Account</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
    </RequireAuth>
  );
}
