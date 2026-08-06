"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const AVAILABLE_TOPICS = [
  ".NET Core & Minimal APIs",
  "C# Architecture & Microservices",
  "Angular & Web Frameworks",
  "React & Next.js Systems",
  "Python & FastAPI Setup",
  "Google Gemini & Generative AI",
  "Kubernetes & DevOps Pipelines",
  "Cloud Infrastructure & Azure",
  "SQL & Vector Databases",
  "Micro-Frontends & Module Federation",
  "Zero-Trust Cloud Security",
  "eBPF & System Observability"
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

  // Autocomplete search state
  const [topicSearch, setTopicSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [isAiResult, setIsAiResult] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local filter: instant string matching, exclude already-selected, limit to 3
  const localMatches = topicSearch.trim()
    ? AVAILABLE_TOPICS.filter(
        (t) =>
          t.toLowerCase().includes(topicSearch.toLowerCase()) &&
          !interests.includes(t)
      ).slice(0, 3)
    : [];

  // The final displayed suggestions: local matches first, fallback to AI matches
  const filteredSuggestions = localMatches.length > 0 ? localMatches : aiSuggestions.filter((t) => !interests.includes(t));

  // AI search: call backend when local matches fail, debounced
  useEffect(() => {
    // Clear previous AI results and timer on every keystroke
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setAiSuggestions([]);
    setIsAiResult(false);

    const query = topicSearch.trim();
    if (!query || localMatches.length > 0) {
      setIsAiSearching(false);
      return;
    }

    // No local match found → debounce then call Gemini
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
    }, 400);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicSearch, interests]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (topic: string) => {
    if (!interests.includes(topic)) {
      setInterests([...interests, topic]);
    }
    setTopicSearch("");
    setShowSuggestions(false);
    setAiSuggestions([]);
    setIsAiResult(false);
  };


  useEffect(() => {
    // Load saved profile from local storage if exists
    const saved = localStorage.getItem("becon_user_profile");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.name) setName(parsed.name);
        if (parsed.role) setRole(parsed.role);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.experience) setExperience(parsed.experience);
        if (parsed.interests) setInterests(parsed.interests);
        if (parsed.customPrompt) setCustomPrompt(parsed.customPrompt);
        if (parsed.aiTone) setAiTone(parsed.aiTone);
      } catch (err) {
        console.error("Failed to parse profile from local storage", err);
      }
    }
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
      interests,
      customPrompt,
      aiTone,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem("becon_user_profile", JSON.stringify(profileData));
    setSaveSuccess(true);
    
    // Attempt to notify Python backend of updated personalization parameters
    try {
      await fetch(`http://127.0.0.1:8000/api/briefings?role=${encodeURIComponent(role)}&refresh=true`, {
        method: "GET"
      });
    } catch (err) {
      console.log("Backend offline or unreachable during profile save", err);
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
              <span>← Return to Daily Gazette</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. SUCCESS NOTIFICATION TOAST */}
      {saveSuccess && (
        <div className="bg-emerald-600 text-white font-mono text-xs sm:text-sm font-bold py-3 px-6 text-center shadow-lg transition-all animate-in fade-in slide-in-from-top duration-300 flex items-center justify-center gap-2">
          <span className="text-base">✨</span>
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
                <span>👤</span> BASIC DEVELOPER DETAILS
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
                <span>🛡️</span> PRIVACY GUARANTEE
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
                  <span>🎯</span> WHERE I AM INTERESTED MOST (SELECT TOPICS)
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-950 border border-indigo-200 font-bold px-2 py-0.5 rounded uppercase">
                  AI FOCUS STACK
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Click topics below or search to highlight where Becon&apos;s live ingestion engine should prioritize signals and technical updates:
              </p>

              {/* AUTOCOMPLETE SEARCH INPUT */}
              <div ref={searchRef} className="relative pt-1">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
                  <input
                    id="topic-search-input"
                    type="text"
                    value={topicSearch}
                    onChange={(e) => {
                      setTopicSearch(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => topicSearch.trim() && setShowSuggestions(true)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-slate-950 font-semibold text-sm transition-all outline-none placeholder:text-slate-400 placeholder:font-medium"
                    placeholder="Type to search topics… e.g. React, Kubernetes, Python"
                    autoComplete="off"
                  />
                  {topicSearch && (
                    <button
                      type="button"
                      onClick={() => { setTopicSearch(""); setShowSuggestions(false); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none cursor-pointer transition-colors"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* SUGGESTIONS DROPDOWN */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border-2 border-slate-900 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* AI MATCH HEADER */}
                    {isAiResult && (
                      <div className="px-4 py-2 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span className="text-[10px] font-mono font-black uppercase tracking-widest text-indigo-700">
                          Gemini AI Matched
                        </span>
                        <span className="text-[10px] font-mono text-indigo-400">
                          — semantically related to &quot;{topicSearch}&quot;
                        </span>
                      </div>
                    )}
                    {filteredSuggestions.map((topic, idx) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => selectSuggestion(topic)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-indigo-50 group ${
                          idx < filteredSuggestions.length - 1 ? "border-b border-slate-100" : ""
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black transition-colors font-mono ${
                          isAiResult
                            ? "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 group-hover:text-indigo-800"
                            : "bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-700"
                        }`}>
                          {isAiResult ? "✦" : "+"}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 group-hover:text-indigo-900 transition-colors">
                          {topic}
                        </span>
                        {isAiResult && (
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                            AI
                          </span>
                        )}
                        <span className="ml-auto text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 group-hover:text-indigo-500 transition-colors">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* AI SEARCHING INDICATOR */}
                {showSuggestions && isAiSearching && filteredSuggestions.length === 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border-2 border-indigo-200 rounded-xl shadow-lg px-4 py-3.5 flex items-center justify-center gap-3">
                    <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-700 rounded-full animate-spin"></span>
                    <span className="text-xs font-mono font-bold text-indigo-600 uppercase tracking-wider">
                      Gemini AI is searching for related topics…
                    </span>
                  </div>
                )}

                {/* NO RESULTS MESSAGE — only when both local AND AI search are done */}
                {showSuggestions && topicSearch.trim() && filteredSuggestions.length === 0 && !isAiSearching && (
                  <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border-2 border-slate-200 rounded-xl shadow-lg px-4 py-3 text-center">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                      No matching topics found
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {AVAILABLE_TOPICS.map((topic) => {
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

              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div className="font-mono text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                  <span>💬</span> CUSTOM AI INSTRUCTION PROMPT
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
                <span>💾 Save & Apply AI Customizations</span>
                <span>→</span>
              </button>
            </div>
          </section>

        </form>
      </main>
    </div>
  );
}
