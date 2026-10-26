"use client";

import { User, RefreshCcw, Zap, Target, Search, MessageSquare, Shield, Save, Sparkles, ArrowLeft, ArrowRight, AlertCircle } from "lucide-react";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

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
        const res = await fetch(
          `${API}/api/topic-search?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.matches && data.matches.length > 0) {
            setAiSuggestions(data.matches);
            setIsAiResult(true);
            setShowSuggestions(true);
          }
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

    // Load saved profile from backend API
    const fetchProfile = async () => {
      const token = localStorage.getItem("becon_token");
      if (!token) {
        router.push("/login");
        return;
      }
      showLoader("Loading User Profile...", "Retrieving your profile & topic interests from database...");
      try {
        const res = await fetch(`${API}/api/profile`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const parsed = await res.json();
          if (parsed.name && parsed.name !== "Developer" && parsed.name !== "User") {
            setName(parsed.name);
          } else if (parsed.email) {
            const prefix = parsed.email.split("@")[0];
            setName(prefix.charAt(0).toUpperCase() + prefix.slice(1));
          }
          if (parsed.role) setRole(parsed.role);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.experience) setExperience(parsed.experience);
          if (parsed.interests && parsed.interests.trim().length > 0) {
            setInterests(parsed.interests.split(",").map((i: string) => i.trim()).filter(Boolean));
          }
          if (parsed.customPrompt) setCustomPrompt(parsed.customPrompt);
          if (parsed.aiTone) setAiTone(parsed.aiTone);
        }
      } catch (err) {
        console.error("Failed to load profile from backend", err);
      } finally {
        hideLoader();
      }
    };
    fetchProfile();
  }, [router]);

  const toggleInterest = (topic: string) => {
    setValidationError("");
    if (interests.includes(topic)) {
      setInterests(interests.filter((t) => t !== topic));
    } else {
      setInterests([...interests, topic]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

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
      aiTone
    };
    
    const token = localStorage.getItem("becon_token");
    if (finalName && finalName !== "User") {
      localStorage.setItem("becon_user_name", finalName);
    }
    showLoader(
      "Personalizing Your Daily Gazette...",
      `Configuring AI news pipeline for ${finalRole} & ${interests.length} focus topics...`
    );
    try {
      await fetch(`${API}/api/profile`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      // Pre-warm and regenerate personalized briefing cards with the new focus areas
      const params = new URLSearchParams({
        role: finalRole,
        interests: interests.join(", "),
        custom_prompt: customPrompt,
        refresh: "true"
      });
      fetch(`${API}/api/briefings?${params.toString()}`, {
        method: "GET"
      }).catch(() => {});

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

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans selection:bg-slate-900 selection:text-white pb-20">
      {/* 1. HEADER BAR */}
      <header className="bg-slate-950 text-slate-200 py-3.5 px-4 sm:px-6 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-85 transition-opacity">
              <h1 className="font-serif text-2xl sm:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden sm:inline">
              AI PERSONALIZATION & USER PROFILE
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <Link
              href="/"
              className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 font-bold px-4 py-1.5 rounded-lg text-xs tracking-wider transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /><span>Return to Daily Gazette</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("becon_token");
                localStorage.removeItem("becon_user_name");
                router.push("/login");
              }}
              className="bg-rose-900/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-300 border border-transparent hover:border-rose-900/50 font-bold px-4 py-1.5 rounded-lg text-xs tracking-wider transition-all cursor-pointer shadow-xs"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

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
          <div className="mb-8 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-slate-900 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                <h3 className="font-serif font-black text-lg sm:text-xl text-slate-950 mt-1">
                  Select Your Role, Profession & Interested Topics
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 font-medium mt-0.5 max-w-2xl">
                  Pick the topics, industries, and focus areas you care about (e.g. Accounting, Retail, Business, Tech). When you hit Save, Becon AI will personalize your morning intelligence gazette and launch your feed!
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-black uppercase px-3 py-1.5 rounded-lg bg-slate-900 text-amber-300 shrink-0 shadow-2xs">
              AI READY
            </span>
          </div>
        )}

        <div className="border-b-2 border-slate-900 pb-4 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-slate-950 tracking-tight leading-none mb-1">
              User Profile & AI Personalization
            </h2>
            <p className="text-slate-600 font-normal text-sm sm:text-base">
              Tailor how Becon&apos;s AI engine reads breaking industry updates, aligns with your profession & interests, and constructs your personalized action briefings.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: BASIC USER & PROFESSIONAL DETAILS (5 COLUMNS) */}
          <section className="lg:col-span-5 space-y-6 bg-white border-2 border-slate-900 p-6 sm:p-8 rounded-2xl shadow-md h-fit">
            <div className="border-b border-slate-200 pb-3 font-mono flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                <span><User className="w-4 h-4" /></span> USER & PROFESSIONAL DETAILS
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded uppercase">
                IDENTITY
              </span>
            </div>

            <div className="space-y-4 font-sans text-sm">
              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg px-3.5 py-2 text-slate-950 font-semibold text-sm transition-colors outline-none"
                  placeholder="Enter your name"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-1.5">
                  Primary Profession / Role
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg px-3.5 py-2 text-slate-950 font-semibold text-sm transition-colors outline-none"
                  placeholder="e.g. Accountant, Shop Owner, Software Engineer, Manager"
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
                          ? "bg-slate-900 text-amber-300 border-slate-900 shadow-2xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
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
                <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address (For Daily Gazette Digest)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg px-3.5 py-2 text-slate-950 font-semibold text-sm transition-colors outline-none"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-1.5">
                  Experience Level
                </label>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg px-3.5 py-2 text-slate-950 font-semibold text-sm transition-colors outline-none cursor-pointer"
                >
                  <option value="Entry / Beginner (0-2 Years)">Entry / Beginner (0-2 Years)</option>
                  <option value="Mid-Level / Established (3-5 Years)">Mid-Level / Established (3-5 Years)</option>
                  <option value="Senior / Experienced (5+ Years)">Senior / Experienced (5+ Years)</option>
                  <option value="Lead / Business Owner / Director">Lead / Business Owner / Director</option>
                </select>
              </div>
            </div>
            
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 font-mono text-xs space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <span><Shield className="w-4 h-4" /></span> PRIVACY GUARANTEE
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed font-sans font-medium">
                Your profile settings are kept locally in your browser storage and transmitted directly to your private AI processing endpoint. Zero third-party telemetry.
              </p>
            </div>
          </section>

          {/* RIGHT COLUMN: AI INTEL & TOPIC PREFERENCES (7 COLUMNS) */}
          <section className="lg:col-span-7 space-y-8 bg-white border-2 border-slate-900 p-6 sm:p-8 rounded-2xl shadow-md flex flex-col justify-between">
            <div className="space-y-6">
              <div className="border-b border-slate-200 pb-3 font-mono flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                  <span><Target className="w-4 h-4" /></span> WHAT ARE YOU INTERESTED IN MOST? (SELECT TOPICS)
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-950 border border-indigo-200 font-bold px-2 py-0.5 rounded uppercase">
                  AI TOPICS & FOCUS
                </span>
              </div>

              {validationError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-500 text-rose-800 text-xs font-mono font-bold flex items-center gap-2 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Search or click topics below to highlight what Becon&apos;s live AI engine should prioritize for your daily intelligence feed:
              </p>

              {/* ACTIVE FOCUS TOPICS / CURRENTLY SELECTED TOPICS */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
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
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-xl pl-10 pr-10 py-2.5 text-slate-950 font-semibold text-sm transition-all outline-none placeholder:text-slate-400 placeholder:font-medium shadow-2xs"
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
                  <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border-2 border-slate-900 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
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
                            ? "bg-slate-950 text-amber-300 border-slate-950 shadow-sm"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300 hover:border-slate-400"
                        }`}
                      >
                        <span>{isSelected ? "✓" : "+"}</span>
                        <span>{topic}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div className="font-mono text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                  <span><MessageSquare className="w-4 h-4" /></span> CUSTOM AI INSTRUCTION PROMPT
                </div>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  Tell the AI engine how you want it to format and analyze industry news items for you:
                </p>
                <textarea
                  rows={4}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-slate-950 text-emerald-300 font-mono text-xs sm:text-sm p-4 rounded-xl border border-slate-800 leading-relaxed outline-none shadow-inner resize-y"
                  placeholder="e.g. Highlight practical takeaways, business and financial impacts, and actionable steps tailored to my daily work..."
                />
              </div>

              <div className="pt-4 space-y-3">
                <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider">
                  Action Card Tone & Depth Density
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    "Clear & Actionable (Executive Summary)",
                    "Practical Business & Financial Takeaways",
                    "In-Depth Professional Analysis"
                  ].map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setAiTone(tone)}
                      className={`p-3 rounded-xl border text-left text-xs font-mono font-bold tracking-wider cursor-pointer transition-all ${
                        aiTone === tone
                          ? "bg-indigo-50 border-2 border-indigo-700 text-indigo-950 font-black shadow-xs"
                          : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase opacity-75">TONE STYLE</span>
                        <span className="text-base">{aiTone === tone ? "◉" : "◯"}</span>
                      </div>
                      <div className="leading-snug">{tone}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t-2 border-slate-900 flex flex-wrap items-center justify-between gap-4 font-mono">
              <span className="text-xs font-bold text-slate-500">
                {isSetupMode ? "Ready to launch your personalized intelligence deck?" : "Ready to deploy preferences to Becon AI?"}
              </span>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-mono font-black text-sm uppercase tracking-widest rounded-xl transition-colors shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <span><Save className="w-4 h-4" /> {isSetupMode ? "Save Preferences & Launch Gazette Feed" : "Save Preferences & Enter Home Page"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>

        </form>
      </main>
    </div>
  );
}
