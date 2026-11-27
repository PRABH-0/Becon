"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Check,
  Globe,
  Clock,
  Search,
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { apiFetch } from "@/lib/api";

interface SuggestedTopic {
  id: string;
  name: string;
  slug: string;
  kind?: string | null;
}

interface ProfessionItem {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  suggested_topics: SuggestedTopic[];
}

const VERSION_SUPPORTED_KEYWORDS = [
  "net",
  "python",
  "node",
  "angular",
  "typescript",
  "java",
  "go",
  "docker",
  "kubernetes",
  "react",
  "vue",
  "rust",
  "terraform",
];

function topicSupportsVersions(topicName: string): boolean {
  const lower = topicName.toLowerCase();
  return VERSION_SUPPORTED_KEYWORDS.some((kw) => lower.includes(kw));
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, me, isAnonymous, signInAsGuest } = useAuth();

  // Wizard Step: 1 = Profession, 2 = Focus Topics, 3 = Delivery & Timezone, 4 = Review & Save
  const [step, setStep] = useState<number>(1);

  // Step 1: Profession
  const [professions, setProfessions] = useState<ProfessionItem[]>([]);
  const [loadingProfessions, setLoadingProfessions] = useState<boolean>(true);
  const [selectedProfession, setSelectedProfession] = useState<ProfessionItem | null>(null);

  // Step 2: Topics
  const [selectedTopics, setSelectedTopics] = useState<Array<{ id?: string; name: string; version?: string }>>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Step 3: Timezone & Delivery Time
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [deliveryTime, setDeliveryTime] = useState<string>("08:00");

  // Step 4: Submission State
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch professions on mount
  useEffect(() => {
    let mounted = true;
    async function loadProfessions() {
      try {
        setLoadingProfessions(true);
        const data = await apiFetch<ProfessionItem[]>("/api/professions");
        if (mounted && Array.isArray(data)) {
          setProfessions(data);
          if (data.length > 0) {
            setSelectedProfession(data[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load professions:", err);
      } finally {
        if (mounted) setLoadingProfessions(false);
      }
    }
    loadProfessions();
    return () => {
      mounted = false;
    };
  }, []);

  // Autocomplete topic search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchQuery.trim();
    if (!q) {
      searchDebounceRef.current = setTimeout(() => {
        setSearchResults([]);
        setShowDropdown(false);
        setIsSearching(false);
      }, 0);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch<{ matches?: string[] }>(
          `/api/topics/search?q=${encodeURIComponent(q)}`
        );
        if (res && Array.isArray(res.matches)) {
          setSearchResults(res.matches);
          setShowDropdown(res.matches.length > 0);
        }
      } catch (err) {
        console.warn("Topic autocomplete unavailable:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSuggestedTopic = useCallback((t: SuggestedTopic) => {
    setSelectedTopics((prev) => {
      const exists = prev.some((item) => item.name.toLowerCase() === t.name.toLowerCase());
      if (exists) {
        return prev.filter((item) => item.name.toLowerCase() !== t.name.toLowerCase());
      }
      return [...prev, { id: t.id, name: t.name }];
    });
  }, []);

  const addSearchedTopic = useCallback((topicName: string) => {
    setSelectedTopics((prev) => {
      const exists = prev.some((item) => item.name.toLowerCase() === topicName.toLowerCase());
      if (exists) return prev;
      return [...prev, { name: topicName }];
    });
    setSearchQuery("");
    setShowDropdown(false);
  }, []);

  const removeTopic = useCallback((topicName: string) => {
    setSelectedTopics((prev) => prev.filter((item) => item.name.toLowerCase() !== topicName.toLowerCase()));
  }, []);

  const updateTopicVersion = useCallback((topicName: string, version: string) => {
    setSelectedTopics((prev) =>
      prev.map((item) =>
        item.name.toLowerCase() === topicName.toLowerCase()
          ? { ...item, version: version.trim() || undefined }
          : item
      )
    );
  }, []);

  const handleSaveAndFinish = async () => {
    setIsSaving(true);
    setSaveError(null);

    const topicNames = selectedTopics.map((t) => t.name);
    const topicIds = selectedTopics.filter((t) => t.id).map((t) => t.id as string);
    const topicVersions: Record<string, string> = {};
    for (const t of selectedTopics) {
      if (t.id && t.version) {
        topicVersions[t.id] = t.version;
      }
    }

    // Always mirror to localStorage for instant client rendering
    try {
      localStorage.setItem("becon_guest_profession", selectedProfession?.name || "");
      localStorage.setItem("becon_guest_interests", topicNames.join(", "));
      localStorage.setItem("becon_guest_timezone", timezone);
      localStorage.setItem("becon_guest_delivery_time", deliveryTime);
    } catch {
      // Ignore localStorage access issues
    }

    try {
      // Ensure guest session if unauthenticated
      if (!user && !me && isAnonymous !== false) {
        await signInAsGuest();
      }

      // Persist to user profile
      await apiFetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedProfession?.name || "Professional",
          profession_id: selectedProfession?.id || null,
          timezone,
          delivery_time: deliveryTime,
          interests: topicNames.join(", "),
          focus_topic_ids: topicIds.length > 0 ? topicIds : undefined,
          topic_versions: Object.keys(topicVersions).length > 0 ? topicVersions : undefined,
        }),
      });

      router.push("/");
    } catch (err) {
      console.warn("Could not persist profile to API, using local storage:", err);
      // Fallback navigation for guests even if network fails
      router.push("/");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="bg-slate-950 text-slate-200 py-3.5 px-4 sm:px-6 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="hover:opacity-85 transition-opacity flex items-center gap-2">
            <span className="font-serif text-xl sm:text-2xl font-black tracking-widest text-white uppercase">
              B E C O N
            </span>
            <span className="font-mono text-xs text-amber-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded ml-2">
              DISPATCH WIZARD
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle size="sm" />
          </div>
        </div>
      </header>

      {/* Wizard Progress Stepper */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-3 px-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between font-mono text-xs font-bold uppercase tracking-wider">
          {[
            { num: 1, label: "Profession" },
            { num: 2, label: "Focus Topics" },
            { num: 3, label: "Delivery" },
            { num: 4, label: "Confirm" },
          ].map((st) => (
            <button
              key={st.num}
              type="button"
              onClick={() => st.num < step && setStep(st.num)}
              disabled={st.num > step}
              className={`flex items-center gap-1.5 transition-colors ${
                step === st.num
                  ? "text-rose-600 dark:text-rose-400 font-black"
                  : step > st.num
                  ? "text-emerald-700 dark:text-emerald-400 cursor-pointer"
                  : "text-slate-400 dark:text-slate-600 cursor-not-allowed"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  step === st.num
                    ? "bg-rose-600 text-white"
                    : step > st.num
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                }`}
              >
                {step > st.num ? "✓" : st.num}
              </span>
              <span className="hidden sm:inline">{st.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Step Card */}
      <main id="main-content" className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-md">
          {/* STEP 1: CHOOSE PROFESSION */}
          {step === 1 && (
            <div data-testid="onboarding-step-1" className="space-y-6">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Step 1 of 4 • Industry Domain
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-950 dark:text-slate-50 mt-1">
                  Choose Your Profession
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  We tailor editorial intelligence, severity scoring, and daily card priority around your career discipline.
                </p>
              </div>

              {loadingProfessions ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono text-slate-500">Loading industry catalogs...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {professions.map((prof) => {
                    const isSelected = selectedProfession?.id === prof.id;
                    return (
                      <div
                        key={prof.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedProfession(prof)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedProfession(prof);
                          }
                        }}
                        className={`p-5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "border-rose-600 bg-rose-50/50 dark:bg-rose-950/20 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-400 bg-white dark:bg-slate-900"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200">
                              <Briefcase className="w-4 h-4" />
                            </span>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <h3 className="font-serif font-bold text-lg text-slate-950 dark:text-slate-100">
                            {prof.name}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {prof.description || "Curated official updates and tactical breaking advisories."}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
                          {prof.suggested_topics.length} curated focus topics
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  data-testid="onboarding-next-button"
                  disabled={!selectedProfession}
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  Continue to Focus Topics <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CHOOSE FOCUS TOPICS */}
          {step === 2 && (
            <div data-testid="onboarding-step-2" className="space-y-6">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Step 2 of 4 • Topic Stack
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-950 dark:text-slate-50 mt-1">
                  Select Focus Topics
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Choose the libraries, frameworks, cloud platforms, and regulations you monitor. Optionally specify a release version.
                </p>
              </div>

              {/* Autocomplete Search Input */}
              <div ref={dropdownRef} className="relative">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 absolute left-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any technology, platform, or standard (e.g. Kubernetes, React, Python)..."
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                  />
                  {isSearching && (
                    <div className="absolute right-3.5 w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                    {searchResults.map((result) => (
                      <button
                        key={result}
                        type="button"
                        onClick={() => addSearchedTopic(result)}
                        className="w-full text-left px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span>{result}</span>
                        <span className="text-[10px] font-mono text-rose-500 font-bold">+ Add</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggested Topics Chips for chosen profession */}
              {selectedProfession && selectedProfession.suggested_topics.length > 0 && (
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400 block mb-2">
                    Suggested for {selectedProfession.name}:
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                    {selectedProfession.suggested_topics.map((t) => {
                      const isSelected = selectedTopics.some(
                        (item) => item.name.toLowerCase() === t.name.toLowerCase()
                      );
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-testid={`topic-chip-${t.name}`}
                          onClick={() => toggleSuggestedTopic(t)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? "bg-rose-600 text-white shadow-xs font-bold"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-400"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          <span>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected Topics List with Optional Version Input */}
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400 block mb-2">
                  Your Selected Stack ({selectedTopics.length}):
                </span>
                {selectedTopics.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No topics selected yet. Click any chip above or use the search box.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTopics.map((item) => {
                      const canHaveVersion = topicSupportsVersions(item.name);
                      return (
                        <div
                          key={item.name}
                          className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {item.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {canHaveVersion && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-mono text-slate-400">Ver:</span>
                                <input
                                  type="text"
                                  data-testid={`topic-version-input-${item.name}`}
                                  value={item.version || ""}
                                  onChange={(e) => updateTopicVersion(item.name, e.target.value)}
                                  placeholder="e.g. 11, 3.13"
                                  className="w-20 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 font-mono"
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeTopic(item.name)}
                              aria-label={`Remove ${item.name}`}
                              className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  data-testid="onboarding-next-button"
                  onClick={() => setStep(3)}
                  disabled={selectedTopics.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  Continue to Delivery <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: TIMEZONE & DELIVERY TIME */}
          {step === 3 && (
            <div data-testid="onboarding-step-3" className="space-y-6">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Step 3 of 4 • Delivery Preferences
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-950 dark:text-slate-50 mt-1">
                  Schedule & Timezone
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Choose when you prefer your morning intelligence gazette assembled and ready.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-500" />
                    <span>TIMEZONE</span>
                  </label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[11px] text-slate-500">Auto-detected from your browser environment.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>PREFERRED MORNING DELIVERY TIME</span>
                  </label>
                  <input
                    type="time"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[11px] text-slate-500">Your daily edition will refresh by this time every morning.</p>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  data-testid="onboarding-next-button"
                  onClick={() => setStep(4)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  Review Configuration <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & CONFIRM */}
          {step === 4 && (
            <div data-testid="onboarding-step-4" className="space-y-6">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Step 4 of 4 • Confirmation
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-black text-slate-950 dark:text-slate-50 mt-1">
                  Ready to Build Your Gazette
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Saving will generate your customized daily edition and invalidate previous cached dispatches.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-4 font-mono text-xs">
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-slate-500">PROFESSION:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{selectedProfession?.name}</span>
                </div>
                <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-slate-500 block mb-1.5">STACK & TOPICS ({selectedTopics.length}):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTopics.map((t) => (
                      <span
                        key={t.name}
                        className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold"
                      >
                        {t.name} {t.version ? `(v${t.version})` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-slate-500">TIMEZONE:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{timezone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">DELIVERY TIME:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{deliveryTime}</span>
                </div>
              </div>

              {saveError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 text-rose-700 dark:text-rose-300 text-xs font-mono">
                  {saveError}
                </div>
              )}

              <div className="pt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  data-testid="onboarding-save-button"
                  onClick={handleSaveAndFinish}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isSaving ? "Configuring Stack..." : "Save & Open Daily Briefing"}
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
