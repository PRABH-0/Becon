"use client";

import { User, RefreshCcw, Zap, Target, Search, MessageSquare, Shield, Save, Sparkles, ArrowLeft, ArrowRight } from "lucide-react";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";

const POPULAR_TOPICS = [
  ".NET Core & Minimal APIs",
  "C# Architecture & Microservices",
  "Angular & Web Frameworks",
  "React & Next.js Systems",
  "Python & FastAPI Setup",
  "Rust Programming Language",
  "Go & High-Performance Services",
  "Docker & Containerization",
  "Google Gemini & Generative AI",
  "Kubernetes & DevOps Pipelines",
  "Cloud Infrastructure & Azure",
  "TypeScript & Modern Tooling",
  "SQL & Vector Databases",
  "Micro-Frontends & Module Federation",
  "Zero-Trust Cloud Security",
  "eBPF & System Observability"
];

const EXTENDED_TECH_CATALOG = [
  ...POPULAR_TOPICS,
  "Rust Web Development (Axum/Actix)",
  "Rustlings & Systems Practice",
  "Rust Memory Safety & Concurrency",
  "Rust Systems & WebAssembly",
  "Docker Compose & Multi-Container",
  "Docker Security & Image Optimization",
  "Kubernetes Helm & GitOps",
  "Kubernetes Ingress & Networking",
  "PyTorch & Deep Learning",
  "Python AsyncIO & Concurrency",
  "Angular Signals & State Management",
  "Next.js App Router & Server Actions",
  "Vue.js & Nuxt 3 Ecosystem",
  "AWS Cloud & Serverless Lambda",
  "PostgreSQL Performance & Indexing",
  "Redis & In-Memory Caching",
  "Kafka & Event-Driven Architecture",
  "GraphQL & Modern Apollo APIs",
  "Linux Kernel & System Internals",
  "WebAssembly & WASI Runtimes",
  "Terraform & Infrastructure as Code",
  "Swift & iOS Architecture",
  "Kotlin & Android Multiplatform"
];

export default function ProfilePage() {
  const [name, setName] = useState("Prabhjot Singh");
  const [role, setRole] = useState("Senior Full Stack .NET & Angular Engineer");
  const [email, setEmail] = useState("prabhjot@example.com");
  const [experience, setExperience] = useState("Senior (5+ Years)");
  const [interests, setInterests] = useState<string[]>([
    ".NET Core & Minimal APIs",
    "C# Architecture & Microservices",
    "Angular & Web Frameworks",
    "Python & FastAPI Setup",
    "Google Gemini & Generative AI"
  ]);
  const [customPrompt, setCustomPrompt] = useState(
    "When summarizing news, compare new concepts (like FastAPI, Next.js, or Python) directly against .NET Core and Angular patterns so I can learn faster. Focus on enterprise clean architecture, performance optimization, and real-world production gotchas."
  );
  const [aiTone, setAiTone] = useState("Architectural Analysis (Deep Tech)");
  const [saveSuccess, setSaveSuccess] = useState(false);
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
          `http://127.0.0.1:8000/api/topic-search?q=${encodeURIComponent(query)}`
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
    // Load saved profile from SQL Server via backend API
    const fetchProfile = async () => {
      const token = localStorage.getItem("becon_token");
      if (!token) {
        router.push("/login");
        return;
      }
      showLoader("Loading Developer Profile...", "Retrieving your saved architecture interests from database...");
      try {
        const res = await fetch("http://127.0.0.1:8000/api/profile", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const parsed = await res.json();
          if (parsed.name) setName(parsed.name);
          if (parsed.role) setRole(parsed.role);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.experience) setExperience(parsed.experience);
          if (parsed.interests) setInterests(parsed.interests.split(",").map((i: string) => i.trim()).filter(Boolean));
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
  }, []);

  const toggleInterest = (topic: string) => {
    if (interests.includes(topic)) {
      setInterests(interests.filter((t) => t !== topic));
    } else {
      setInterests([...interests, topic]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const profileData = {
      name,
      role,
      email,
      experience,
      interests: interests.join(", "),
      customPrompt,
      aiTone
    };
    
    const token = localStorage.getItem("becon_token");
    showLoader(
      "Synchronizing AI Preferences...",
      "Updating your tech stack focus & re-tuning Gemini briefing prompts..."
    );
    try {
      await fetch("http://127.0.0.1:8000/api/profile", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      // Pre-warm and regenerate personalized briefing cards with the new focus areas
      const params = new URLSearchParams({
        role: role,
        interests: interests.join(", "),
        custom_prompt: customPrompt,
        refresh: "true"
      });
      await fetch(`http://127.0.0.1:8000/api/briefings?${params.toString()}`, {
        method: "GET"
      });
    } catch (err) {
      console.error("Failed to save profile to backend", err);
    } finally {
      setTimeout(() => {
        hideLoader();
        setSaveSuccess(true);
      }, 600);
    }

    setTimeout(() => {
      setSaveSuccess(false);
    }, 4000);
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
              AI PERSONALIZATION & DEVELOPER PROFILE
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
          <span>SUCCESS! Your Developer Identity & AI Model Personalization Preferences Have Been Synced!</span>
        </div>
      )}

      {/* 3. PROFILE & AI TUNING FORM CONTAINER */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-10">
        <div className="border-b-2 border-slate-900 pb-4 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black font-serif text-slate-950 tracking-tight leading-none mb-1">
              Developer Identity & AI Model Calibration
            </h2>
            <p className="text-slate-600 font-normal text-sm sm:text-base">
              Tailor how Becon&apos;s Google Gemini engine reads breaking developer news, matches your technology stack, and constructs your 4-part action protocol.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs font-black bg-amber-100 text-amber-950 border-2 border-amber-300 px-3.5 py-1.5 rounded-lg shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping mr-1"></span>
            <span>AI ENGINE: GEMINI 1.5 ACTIVE</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: BASIC DEVELOPER DETAILS (5 COLUMNS) */}
          <section className="lg:col-span-5 space-y-6 bg-white border-2 border-slate-900 p-6 sm:p-8 rounded-2xl shadow-md h-fit">
            <div className="border-b border-slate-200 pb-3 font-mono flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                <span><User className="w-4 h-4" /></span> BASIC DEVELOPER DETAILS
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
                  Primary Role / Engineering Title
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg px-3.5 py-2 text-slate-950 font-semibold text-sm transition-colors outline-none"
                  placeholder="e.g. Senior Full Stack .NET Engineer"
                  required
                />
                <p className="text-[11px] font-mono text-slate-500 mt-1">
                  * Used directly by Gemini for the &quot;Impact on Your Role&quot; section.
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
                  <option value="Junior (1-2 Years)">Junior Engineer (1-2 Years)</option>
                  <option value="Mid-Level (3-4 Years)">Mid-Level Engineer (3-4 Years)</option>
                  <option value="Senior (5+ Years)">Senior Engineer (5+ Years)</option>
                  <option value="Lead / Architect">Principal / Tech Lead / Architect</option>
                </select>
              </div>
            </div>
            
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 font-mono text-xs space-y-2">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <span><Shield className="w-4 h-4" /></span> PRIVACY GUARANTEE
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed font-sans font-medium">
                Your profile settings are kept locally in your browser storage and transmitted directly to your private Google Gemini AI Studio endpoint. Zero third-party telemetry.
              </p>
            </div>
          </section>

          {/* RIGHT COLUMN: AI INTEL & STACK PREFERENCES (7 COLUMNS) */}
          <section className="lg:col-span-7 space-y-8 bg-white border-2 border-slate-900 p-6 sm:p-8 rounded-2xl shadow-md flex flex-col justify-between">
            <div className="space-y-6">
              <div className="border-b border-slate-200 pb-3 font-mono flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                  <span><Target className="w-4 h-4" /></span> WHERE I AM INTERESTED MOST (SELECT TOPICS)
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-950 border border-indigo-200 font-bold px-2 py-0.5 rounded uppercase">
                  AI FOCUS STACK
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Search or click topics below to highlight where Becon&apos;s live ingestion engine should prioritize signals and technical updates:
              </p>

              {/* ACTIVE FOCUS STACK / CURRENTLY SELECTED TOPICS */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Active Focus Stack ({interests.length} Selected)
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
                    No topics selected yet. Type in the search box below or pick from starter stacks.
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
                    placeholder="Type to search or complete topics… e.g. rus, dock, python, k8s"
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
                          {isAiResult ? "Gemini AI Suggested Topics" : "Keyword Autocomplete Matches"}
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
                          Gemini AI completing keywords for &quot;{topicSearch}&quot;…
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
                  Tell the Google Gemini model how you want it to format and analyze technical news items for you:
                </p>
                <textarea
                  rows={4}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-slate-950 text-emerald-300 font-mono text-xs sm:text-sm p-4 rounded-xl border border-slate-800 leading-relaxed outline-none shadow-inner resize-y"
                  placeholder="e.g. Compare all concepts to C# and Angular..."
                />
              </div>

              <div className="pt-4 space-y-3">
                <label className="block text-xs font-bold font-mono text-slate-700 uppercase tracking-wider">
                  Action Card Tone & Depth Density
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    "Concise & Direct (2-Min Read)",
                    "Architectural Analysis (Deep Tech)",
                    "Beginner Python Step-by-Step"
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
                Ready to deploy preferences to Gemini?
              </span>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-mono font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
              >
                <span><Save className="w-4 h-4" /> Save & Apply AI Customizations</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>

        </form>
      </main>
    </div>
  );
}
