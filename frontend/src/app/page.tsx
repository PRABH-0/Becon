"use client";

import { User, RefreshCcw, Zap, Layers, LayoutGrid, Radio, Flame, Wrench, ClipboardList, Pin, Lightbulb, Target, Ruler, BarChart2, Shield, ChevronDown, ArrowRight, ExternalLink, Maximize2, X, Search, Loader2, Sparkles } from "lucide-react";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";

interface ActionGuidance {
  action_type: "learn" | "apply" | "avoid" | "prepare";
  guidance: string;
}

interface DeepDetail {
  full_description?: string;
  code_snippet?: {
    language: string;
    code: string;
  };
  has_visual_diagram?: boolean;
  diagram_title?: string;
}

interface BriefingCardContent {
  what_happened: string[];
  why_it_matters: string;
  how_it_affects_you: string;
  what_to_do_next: ActionGuidance;
}

interface BriefingCard {
  id: string;
  rank?: number;
  title: string;
  source_url: string;
  image_url?: string;
  target_role: string;
  target_stack: string[];
  priority?: "lead" | "major" | "brief" | "watch" | "spotlight";
  card_content: BriefingCardContent;
  deep_detail?: DeepDetail;
}

function computeBentoSpans(total: number): number[] {
  const spans: number[] = [];
  let remaining = total;
  let flip = true;

  while (remaining > 0) {
    if (remaining === 1) {
      spans.push(3);
      remaining -= 1;
    } else if (remaining === 3) {
      spans.push(1, 1, 1);
      remaining -= 3;
    } else if (remaining === 4) {
      spans.push(1, 1, 1, 3);
      remaining -= 4;
    } else {
      if (flip) {
        spans.push(2, 1);
      } else {
        spans.push(1, 2);
      }
      flip = !flip;
      remaining -= 2;
    }
  }
  return spans;
}

/**
 * Returns a high-res relevant image for a card, using its live image_url or a domain-matched editorial developer photo.
 */
function getCardImageUrl(card: BriefingCard): string {
  if (card.image_url && card.image_url.trim().length > 0) {
    return card.image_url;
  }
  const stackStr = ((card.target_stack || []).join(" ") + " " + (card.title || "")).toLowerCase();
  if (stackStr.includes("ai") || stackStr.includes("gemini") || stackStr.includes("model") || stackStr.includes("learning")) {
    return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop";
  }
  if (stackStr.includes("cloud") || stackStr.includes("azure") || stackStr.includes("aws")) {
    return "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop";
  }
  if (stackStr.includes("database") || stackStr.includes("sql") || stackStr.includes("postgres")) {
    return "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?q=80&w=800&auto=format&fit=crop";
  }
  if (stackStr.includes("security") || stackStr.includes("zero-trust") || stackStr.includes("ebpf")) {
    return "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=800&auto=format&fit=crop";
  }
  if (stackStr.includes("react") || stackStr.includes("angular") || stackStr.includes("frontend") || stackStr.includes("next")) {
    return "https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=800&auto=format&fit=crop";
  }
  if (stackStr.includes("net") || stackStr.includes("c#") || stackStr.includes("backend")) {
    return "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop";
  }
  return "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop";
}

/**
 * Ensures that at least ONE news card with an image is rendered out of every 5 news updates.
 * If any cards in the 5-pack have a real feed image, it is selected.
 * If none have a feed image, at least one is assigned a curated tech image matching its stack.
 */
function computeImageVisibility(stories: BriefingCard[], spans: number[]): boolean[] {
  const result: boolean[] = new Array(stories.length).fill(false);
  const CHUNK_SIZE = 5;

  for (let start = 0; start < stories.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, stories.length);
    const indices: number[] = [];
    for (let i = start; i < end; i++) {
      indices.push(i);
    }

    // Check if any cards in this 5-card chunk have a valid image_url
    const withFeedImages = indices.filter((i) => {
      const url = stories[i]?.image_url;
      return url && typeof url === "string" && url.trim().length > 0;
    });

    if (withFeedImages.length > 0) {
      // Prioritize the card with a real feed image. Prefer rectangle cards (span >= 2) if available
      const preferred = withFeedImages.find((i) => (spans[i] ?? 1) >= 2) ?? withFeedImages[0];
      result[preferred] = true;
    } else {
      // Out of every 5 news updates, at least one news with an image must be rendered
      // Pick a rectangle card if present in this 5-pack, otherwise the first card
      const preferred = indices.find((i) => (spans[i] ?? 1) >= 2) ?? indices[0];
      result[preferred] = true;
    }
  }

  return result;
}

export default function Home() {
  const [briefings, setBriefings] = useState<BriefingCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingRemaining, setLoadingRemaining] = useState<boolean>(false);

  // Favorite Subject / Topic Search States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSearchTopic, setActiveSearchTopic] = useState<string>("");
  const [isSearchingTopic, setIsSearchingTopic] = useState<boolean>(false);
  const [searchedStories, setSearchedStories] = useState<BriefingCard[] | null>(null);
  const [searchError, setSearchError] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<BriefingCard | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>("Prabhjot Singh");
  const [userRole, setUserRole] = useState<string>("Senior Full Stack .NET & Angular Engineer");
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { showLoader, hideLoader } = useLoader();

  // Infinite Scroll & 20% Page Lift Reveal States
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [editionNumber, setEditionNumber] = useState<number>(1);
  const isLoadingMoreRef = useRef<boolean>(false);
  const canTriggerRef = useRef<boolean>(true);
  const pageNumberRef = useRef<number>(1);

  const router = useRouter();

  // Load More Next Edition Function
  const triggerLoadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !canTriggerRef.current || loading) return;
    isLoadingMoreRef.current = true;
    canTriggerRef.current = false;
    setIsLoadingMore(true);

    const nextPage = pageNumberRef.current + 1;
    // Guaranteed presentation time so user sees the 20% lift & loader animation
    const minDelay = new Promise((resolve) => setTimeout(resolve, 1400));

    try {
      const activeRole = userRole;
      const activeInterests = userInterests.length > 0 ? userInterests.join(", ") : "";
      const activePrompt = customPrompt;

      const params = new URLSearchParams();
      if (activeRole) params.set("role", activeRole);
      if (activeInterests) params.set("interests", activeInterests);
      if (activePrompt) params.set("custom_prompt", activePrompt);
      params.set("page", String(nextPage));
      params.set("limit", "6");

      let incomingCards: BriefingCard[] = [];

      try {
        const res = await fetch(`http://127.0.0.1:8000/api/briefings?${params.toString()}`);
        if (res.ok) {
          const data: BriefingCard[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            incomingCards = data;
          }
        }
      } catch {
        // Backend offline or error; fallback smoothly below
      }

      // If backend returned no cards or duplicates, use specialized next edition broadsheet cards
      if (!incomingCards || incomingCards.length === 0) {
        incomingCards = getNextEditionCards(nextPage, activeRole, activeInterests);
      }

      await minDelay;

      setBriefings((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const existingTitles = new Set(prev.map((c) => c.title.toLowerCase().trim()));
        let unique = incomingCards.filter(
          (c) => !existingIds.has(c.id) && !existingTitles.has(c.title.toLowerCase().trim())
        );
        if (unique.length === 0) {
          unique = getNextEditionCards(nextPage, activeRole, activeInterests);
        }
        return [...prev, ...unique];
      });

      pageNumberRef.current = nextPage;
      setEditionNumber(nextPage);
    } catch (err) {
      console.error("Error loading next edition", err);
      await minDelay;
    } finally {
      // Lower the page smoothly back to normal position
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;

      // Scroll down slightly so user immediately sees newly rendered articles
      setTimeout(() => {
        window.scrollBy({ top: 140, behavior: "smooth" });
        setTimeout(() => {
          canTriggerRef.current = true;
        }, 1200);
      }, 450);
    }
  }, [loading, userRole, userInterests, customPrompt]);

  // Topic AI Search Handlers
  const handleTopicSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearchingTopic(true);
    setActiveSearchTopic(query);
    setSearchError("");

    try {
      const params = new URLSearchParams({
        query,
        role: userRole,
        limit: "6",
      });
      const res = await fetch(`http://127.0.0.1:8000/api/search-topic?${params.toString()}`);
      if (res.ok) {
        const data: BriefingCard[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSearchedStories(
            data.map((c) => ({
              ...c,
              rank: undefined,
            }))
          );
        } else {
          // Fallback keyword filter on current briefings
          const local = briefings.filter(
            (b) =>
              b.title.toLowerCase().includes(query.toLowerCase()) ||
              b.target_stack.some((s) => s.toLowerCase().includes(query.toLowerCase()))
          );
          setSearchedStories(local);
          if (local.length === 0) {
            setSearchError(`No live updates found for "${query}". Try another tech subject.`);
          }
        }
      } else {
        const local = briefings.filter(
          (b) =>
            b.title.toLowerCase().includes(query.toLowerCase()) ||
            b.target_stack.some((s) => s.toLowerCase().includes(query.toLowerCase()))
        );
        setSearchedStories(local);
      }
    } catch (err) {
      console.error("Error searching topic:", err);
      const local = briefings.filter(
        (b) =>
          b.title.toLowerCase().includes(query.toLowerCase()) ||
          b.target_stack.some((s) => s.toLowerCase().includes(query.toLowerCase()))
      );
      setSearchedStories(local);
    } finally {
      setIsSearchingTopic(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearchTopic("");
    setSearchedStories(null);
    setSearchError("");
  };

  // Scroll, Wheel & Touch Listeners for reaching the bottom & continuing to scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isLoadingMoreRef.current || !canTriggerRef.current || loading) return;
      const scrollPos = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 45;
      if (scrollPos >= threshold && e.deltaY > 10) {
        triggerLoadMore();
      }
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isLoadingMoreRef.current || !canTriggerRef.current || loading) return;
      const currentY = e.touches[0].clientY;
      const diffY = touchStartY - currentY;
      const scrollPos = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 45;
      if (scrollPos >= threshold && diffY > 25) {
        triggerLoadMore();
      }
    };

    const handleScroll = () => {
      if (isLoadingMoreRef.current || !canTriggerRef.current || loading) return;
      const scrollPos = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 15;
      if (scrollPos >= threshold) {
        triggerLoadMore();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [triggerLoadMore, loading]);

  // Close profile menu on outside click ("off screen")
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showProfileMenu]);
  
  useEffect(() => {
    const token = localStorage.getItem("becon_token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    const fetchProfileAndBriefings = async () => {
      showLoader("Curating Your Daily Gazette...", "Fast-rendering top 5 priority briefings for your stack");
      try {
        const res = await fetch("http://127.0.0.1:8000/api/profile", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const profile = await res.json();
          if (profile.name) setUserName(profile.name);
          if (profile.role) setUserRole(profile.role);
          if (profile.interests) {
            const list = profile.interests.split(",").map((i: string) => i.trim()).filter(Boolean);
            setUserInterests(list);
          }
          if (profile.customPrompt) {
            setCustomPrompt(profile.customPrompt);
          }
          // Fetch briefings strictly using this user's profile interests & role
          fetchAllBriefings(false, profile);
        } else {
          hideLoader();
          // Token invalid or expired
          localStorage.removeItem("becon_token");
          router.push("/login");
        }
      } catch (err) {
        console.error("Error fetching profile", err);
        fetchAllBriefings();
      }
    };
    
    fetchProfileAndBriefings();
  }, [router]);

  const fetchAllBriefings = async (forceRefresh = false, profile: any = null) => {
    setLoading(true);
    setLoadingRemaining(false);
    if (forceRefresh) {
      showLoader(
        "Ingesting Latest Tech Signals...",
        "Google Gemini 1.5 is synthesizing top breaking updates for your stack"
      );
    }
    try {
      const activeRole = profile?.role ?? userRole;
      const activeInterests = profile?.interests ?? (userInterests.length > 0 ? userInterests.join(", ") : "");
      const activePrompt = profile?.customPrompt ?? customPrompt;

      const baseParams = new URLSearchParams();
      if (activeRole) baseParams.set("role", activeRole);
      if (activeInterests) baseParams.set("interests", activeInterests);
      if (activePrompt) baseParams.set("custom_prompt", activePrompt);

      // STEP 1: FAST FETCH TOP 5 CARDS FIRST (<2s)
      const topParams = new URLSearchParams(baseParams);
      topParams.set("scope", "top");
      topParams.set("limit", "5");
      if (forceRefresh) topParams.set("refresh", "true");

      const topRes = await fetch(`http://127.0.0.1:8000/api/briefings?${topParams.toString()}`);
      if (topRes.ok) {
        const topData: BriefingCard[] = await topRes.json();
        if (Array.isArray(topData) && topData.length > 0) {
          setBriefings(
            topData.map((c, index) => ({
              ...c,
              rank: c.rank ?? index + 1,
            }))
          );
          // INSTANTLY REVEAL TOP SCREEN TO USER!
          setLoading(false);
          hideLoader();

          // STEP 2: SIMULTANEOUSLY LAZY-LOAD REMAINING CARDS FOR BENTO DECK IN BACKGROUND
          setLoadingRemaining(true);
          const remParams = new URLSearchParams(baseParams);
          remParams.set("scope", "remaining");

          try {
            const remRes = await fetch(`http://127.0.0.1:8000/api/briefings?${remParams.toString()}`);
            if (remRes.ok) {
              const remData: BriefingCard[] = await remRes.json();
              if (Array.isArray(remData) && remData.length > 0) {
                setBriefings((prev) => {
                  const existingIds = new Set(prev.map((c) => c.id));
                  const newCards = remData
                    .filter((c) => !existingIds.has(c.id))
                    .map((c, idx) => ({
                      ...c,
                      rank: c.rank ?? prev.length + idx + 1,
                    }));
                  return [...prev, ...newCards];
                });
              }
            }
          } catch (remErr) {
            console.error("Error lazy-loading remaining briefings:", remErr);
          } finally {
            setLoadingRemaining(false);
          }
          return;
        }
      }

      // Fallback if top fetch didn't return data
      setBriefings(getBroadsheetCards());
    } catch (err) {
      console.log("API offline, displaying full high-density editorial broadsheet", err);
      setBriefings(getBroadsheetCards());
    } finally {
      setLoading(false);
      hideLoader();
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case "apply":
        return "bg-emerald-100 text-emerald-950 border-emerald-300 font-bold";
      case "learn":
        return "bg-blue-100 text-blue-950 border-blue-300 font-bold";
      case "avoid":
        return "bg-rose-100 text-rose-950 border-rose-300 font-bold";
      case "prepare":
      default:
        return "bg-amber-100 text-amber-950 border-amber-300 font-bold";
    }
  };

  const todayDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const leadStory = briefings.find((b) => b.priority === "lead") || briefings[0];
  const otherStories = briefings.filter((b) => b.id !== leadStory?.id);

  // Top showcase quick wire: assign 4 dispatches to fill the right showcase (2 rows of 2 cards)
  const topWireCount = 4;
  let topWireStories = otherStories.filter((b) => b.priority === "brief").slice(0, topWireCount);
  if (topWireStories.length < topWireCount && otherStories.length >= topWireCount) {
    const existingIds = new Set(topWireStories.map((b) => b.id));
    const extra = otherStories.filter((b) => !existingIds.has(b.id)).slice(0, topWireCount - topWireStories.length);
    topWireStories = [...topWireStories, ...extra];
  } else if (topWireStories.length < topWireCount && otherStories.length > 0) {
    topWireStories = otherStories.slice(0, topWireCount);
  }
  const topWireIds = new Set(topWireStories.map((b) => b.id));

  // The rest of ALL stories go into the rich Bento Deck across the full width!
  const bentoStories = otherStories.filter((b) => !topWireIds.has(b.id));
  const displayedBentoStories = searchedStories !== null ? searchedStories : bentoStories;

  return (
    <div className="relative min-h-screen bg-[#070b12] overflow-x-clip">
      {/* 20% HEIGHT REVEAL SCREEN (LOCATED BEHIND THE PAGE, REVEALED AS PAGE LIFTS UP) */}
      <div
        className="fixed bottom-0 left-0 right-0 h-[20vh] min-h-[140px] z-0 bg-gradient-to-t from-slate-950 via-[#0a1120] to-[#0f172a] border-t-2 border-amber-400 flex flex-col items-center justify-center p-4 text-center select-none shadow-[inset_0_10px_30px_rgba(0,0,0,0.85)]"
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          {/* Custom News-Loader GIF rendered in crisp white with subtle amber glow */}
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/News-Loader.gif"
              alt="Loading..."
              className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_15px_rgba(251,191,36,0.45)]"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
            <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300">
              DISPATCHING NEXT GAZETTE EDITION
            </span>
          </div>

          <p className="font-mono text-[11px] text-slate-300 max-w-lg line-clamp-1">
            Synthesizing additional architectural signals, deep takes & action cards…
          </p>
        </div>
      </div>

      {/* FOREGROUND MAIN PAGE (LIFTS UP BY 20% OF SCREEN HEIGHT WHEN LOADING MORE) */}
      <div
        style={{
          transform: isLoadingMore ? "translateY(-20vh)" : "translateY(0px)",
          transition: "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s ease",
        }}
        className={`relative z-10 min-h-screen bg-[#FAF8F5] text-slate-800 font-sans selection:bg-slate-900 selection:text-white pb-16 will-change-transform ${
          isLoadingMore ? "shadow-[0_-20px_45px_rgba(0,0,0,0.65)]" : ""
        }`}
      >
      {/* 1. TOP HEADER BAR (BECON LOGO ON LEFT & PROFILE DROPDOWN ON RIGHT) */}
      <header className="bg-slate-950 text-slate-200 py-3 px-4 sm:px-6 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-85 transition-opacity">
              <h1 className="font-serif text-2xl sm:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden sm:inline">
              THE DAILY DEVELOPER GAZETTE
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono relative">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] sm:text-xs hidden lg:inline">
              {todayDate}
            </span>
            <span className="text-slate-400 font-semibold hidden xl:inline border-l border-slate-700 pl-4 uppercase tracking-wider text-[11px] mr-2">
              EDITION: DEVELOPER INTELLIGENCE
            </span>

            {/* PROFILE MENU CONTAINER */}
            <div ref={profileMenuRef} className="relative">
              {/* PROFILE BUTTON */}
              <button
                type="button"
                aria-label="Profile Menu"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2.5 bg-slate-900 hover:bg-slate-800 border-2 border-slate-700 hover:border-amber-400 text-white px-3.5 py-1.5 rounded-full transition-all shadow-sm cursor-pointer"
              >
                <div className="w-6 h-6 rounded-full bg-rose-600 text-white font-serif font-black text-xs flex items-center justify-center shadow-inner">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-slate-200 hidden sm:inline">
                  Profile
                </span>
                <span className="text-amber-400 text-[10px] ml-0.5"><ChevronDown className="w-3 h-3" /></span>
              </button>

              {/* PROFILE DROPDOWN MENU */}
              {showProfileMenu && (
                <div className="absolute right-0 top-12 w-72 bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl p-4 z-50 text-white font-mono space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="pb-3 border-b border-slate-800">
                    <div className="font-black text-white text-sm truncate flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Profile Menu</span>
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-medium truncate mt-1.5 flex items-center gap-1.5 font-sans">
                      <span className="text-slate-200 font-bold">{userName || "Developer"}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400 truncate">{userRole}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Link
                      href="/profile"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center justify-between w-full p-3 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-amber-300 transition-colors text-xs font-black tracking-wider cursor-pointer border border-slate-700 hover:border-rose-500 shadow-2xs"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm"><User className="w-4 h-4" /></span>
                        <span>Profile & AI Tuning</span>
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        fetchAllBriefings(true);
                      }}
                      className="flex items-center justify-between w-full p-2.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-[11px] font-bold cursor-pointer border border-transparent hover:border-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span><RefreshCcw className="w-4 h-4" /></span>
                        <span>Force AI News Refresh</span>
                      </span>
                      <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" /></span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem("becon_token");
                        router.push("/login");
                      }}
                      className="flex items-center justify-between w-full p-2.5 rounded-lg hover:bg-rose-900/30 text-rose-400 hover:text-rose-300 transition-colors text-[11px] font-bold cursor-pointer border border-transparent hover:border-rose-900/50"
                    >
                      <span className="flex items-center gap-2">
                        <span>Sign Out</span>
                      </span>
                    </button>
                  </div>

                  <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                    <span>MODEL: GEMINI 1.5 FLASH</span>
                    <span className="text-emerald-400 font-bold">ONLINE</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. EDITION INDEX RIBBON (ALL SIGNALS IN ONE VIEW) */}
      <div className="bg-white border-b-2 border-slate-900 px-4 sm:px-6 py-2 shadow-2xs">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 font-mono text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-slate-900 font-black mr-2 shrink-0 flex items-center gap-1.5">
              <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-slate-900" /> EDITION COVERAGE:</span>
            </span>
            {userInterests.length > 0 ? (
              userInterests.map((interest) => (
                <span
                  key={interest}
                  className="bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2.5 py-0.5 rounded shrink-0 shadow-2xs"
                >
                  ✓ {interest.toUpperCase()}
                </span>
              ))
            ) : (
              <>
                <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
                  SYSTEM ARCHITECTURE
                </span>
                <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
                  CLOUD & AZURE
                </span>
                <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
                  GENERATIVE AI
                </span>
                <span className="bg-slate-100 border border-slate-200/90 px-2.5 py-0.5 rounded text-slate-800 shrink-0">
                  SECURITY & DEVOPS
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. MULTI-COLUMN HIGH-DENSITY BROADSHEET WITH TOP SHOWCASE & FULL-WIDTH BENTO GRID */}
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 mt-6">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-pulse">
            <div className="lg:col-span-5 h-[650px] bg-slate-200/60 rounded-xl border border-slate-300"></div>
            <div className="lg:col-span-7 h-[650px] bg-slate-200/60 rounded-xl border border-slate-300"></div>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* TOP BALANCED SHOWCASE: #1 CRITICAL UPDATE (LEFT) + THE QUICK WIRE (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-10 border-b-2 border-slate-900">
              
              {/* TOP MOST IMPORTANT UPDATE (LEFT 5 COLS) */}
              {leadStory && (
                <div className="lg:col-span-5 flex flex-col">
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-3 font-mono">
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-black tracking-wider uppercase bg-rose-600 text-white shadow-xs">
                      <Flame className="w-3.5 h-3.5" /> #1 CRITICAL UPDATE
                    </span>
                    <span className="text-slate-500 text-[10px] font-bold uppercase font-mono">
                      • TOP SIGNAL
                    </span>
                  </div>
                  {renderLeadSidebarCard(leadStory, getActionBadgeColor, setSelectedCard)}
                </div>
              )}

              {/* DAILY DISPATCHES / QUICK WIRE + TELEMETRY (RIGHT 7 COLS) */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div className="flex flex-col flex-1">
                  <div className="border-b-2 border-slate-900 pb-2 mb-3 flex items-center justify-between font-mono">
                    <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950 flex items-center gap-1.5">
                      <Radio className="w-4 h-4" /> THE QUICK WIRE • RAPID SIGNALS
                    </span>
                    <span className="text-[10px] font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded uppercase">
                      DISPATCHES
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 gap-3.5 flex-1">
                    {topWireStories.map((card, idx) =>
                      renderBriefCard(
                        card,
                        getActionBadgeColor,
                        setSelectedCard,
                        idx < 4 ? idx + 2 : undefined
                      )
                    )}
                  </div>
                </div>

                {/* GAZETTE INTELLIGENCE TELEMETRY BAR */}
                <div className="mt-4 p-3.5 rounded-xl bg-slate-900 text-slate-300 font-mono text-xs border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">GAZETTE FEED PIPELINE</span>
                    <span className="text-emerald-400 text-[10px] bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">ACTIVE</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-slate-400">
                    <span>COVERAGE: <strong className="text-slate-200">6 DOMAINS</strong></span>
                    <span>SIGNALS: <strong className="text-slate-200">{briefings.length} CURATED</strong></span>
                    <span>AI SYNTHESIS: <strong className="text-slate-200">GEMINI 1.5 FLASH</strong></span>
                  </div>
                </div>
              </div>

            </div>

            {/* FULL-WIDTH BENTO EDITORIAL DECK: ARCHITECTURE & DEEP TAKES (NO VERTICAL DIVIDER, USES 100% WIDTH) */}
            {/* FULL-WIDTH BENTO EDITORIAL DECK: ARCHITECTURE & DEEP TAKES (NO VERTICAL DIVIDER, USES 100% WIDTH) */}
            <section className="flex flex-col space-y-6 pb-12 pt-2">
              <div className="border-b-2 border-slate-900 pb-2 flex flex-wrap items-center justify-between font-mono gap-3 sticky top-14 bg-[#FAF8F5]/95 backdrop-blur-md z-10 pt-1">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950 flex items-center gap-2 shrink-0">
                  <LayoutGrid className="w-4 h-4 text-slate-950" /> BENTO EDITORIAL DECK • ARCHITECTURE & DEEP TAKES
                </span>

                {/* FAVORITE SUBJECT SEARCH FIELD (RED BOX IN EDITORIAL DECK HEADER) */}
                <form
                  onSubmit={handleTopicSearch}
                  className="flex-1 max-w-sm sm:max-w-md mx-2 relative flex items-center min-w-[260px]"
                >
                  <div className="relative w-full flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search subject (e.g. Kubernetes, Rust, PostgreSQL)..."
                      className="w-full pl-8 pr-24 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="absolute right-20 text-slate-400 hover:text-slate-700 p-0.5 text-xs font-bold cursor-pointer"
                        title="Clear"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSearchingTopic || !searchQuery.trim()}
                      className="absolute right-1 px-3 py-1 rounded bg-slate-950 hover:bg-slate-800 text-amber-300 text-[11px] font-black uppercase font-mono tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      {isSearchingTopic ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      ) : (
                        <span>Search</span>
                      )}
                    </button>
                  </div>
                </form>

                <div className="flex items-center gap-2 shrink-0">
                  {loadingRemaining ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      <span>AI SYNTHESIZING REMAINING TAKES...</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-slate-500 font-bold hidden xl:inline">
                      FULL BROADSHEET DENSITY • ALL COLUMNS UNIFIED
                    </span>
                  )}
                </div>
              </div>

              {/* ACTIVE SUBJECT SEARCH STATUS BAR */}
              {activeSearchTopic && (
                <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-2xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-amber-950 font-bold">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      AI Synthesized News for: <strong className="text-slate-950 underline underline-offset-2">"{activeSearchTopic}"</strong>
                    </span>
                    {searchedStories && (
                      <span className="text-[10px] bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded font-black">
                        {searchedStories.length} UPDATES
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="flex items-center gap-1.5 text-[11px] font-black text-rose-700 hover:text-rose-950 bg-white hover:bg-rose-50 border border-rose-200 hover:border-rose-400 px-3 py-1 rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    <X className="w-3 h-3" />
                    <span>Reset Bento Feed</span>
                  </button>
                </div>
              )}

              {/* SEARCH ERROR NOTIFICATION */}
              {searchError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-mono text-xs flex items-center justify-between">
                  <span>{searchError}</span>
                  <button onClick={handleClearSearch} className="font-bold underline cursor-pointer">
                    Clear Search
                  </button>
                </div>
              )}

              {/* FULL-WIDTH DYNAMIC BENTO GRID (GAPLESS GUARANTEE, SPANS ENTIRE WIDTH) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {isSearchingTopic ? (
                  <div className="col-span-1 md:col-span-2 xl:col-span-3 min-h-[300px] rounded-2xl bg-gradient-to-t from-slate-950 via-[#0a1120] to-[#0f172a] border-2 border-amber-400/80 flex flex-col items-center justify-center p-8 sm:p-12 text-center select-none shadow-[inset_0_10px_30px_rgba(0,0,0,0.85)] space-y-3">
                    {/* Custom News-Loader GIF rendered in crisp white with subtle amber glow */}
                    <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/News-Loader.gif"
                        alt="Loading..."
                        className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_15px_rgba(251,191,36,0.45)]"
                        style={{ filter: "brightness(0) invert(1)" }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                      <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300">
                        DISPATCHING AI NEWS FOR: {activeSearchTopic ? activeSearchTopic.toUpperCase() : searchQuery.toUpperCase()}
                      </span>
                    </div>

                    <p className="font-mono text-[11px] text-slate-300 max-w-lg line-clamp-1">
                      Querying live multi-domain feeds & running Gemini 1.5 synthesis…
                    </p>
                  </div>
                ) : displayedBentoStories.length > 0 ? (
                  <>
                    {(() => {
                      const bentoSpans = computeBentoSpans(displayedBentoStories.length);
                      const imageVisibility = computeImageVisibility(displayedBentoStories, bentoSpans);
                      return displayedBentoStories.map((card, idx) => {
                        const span = bentoSpans[idx] ?? 1;
                        const showImageOnCard = imageVisibility[idx];

                        if (span === 1) {
                          return renderSquareCard(card, getActionBadgeColor, setSelectedCard, showImageOnCard);
                        }
                        const isFullWidth = span === 3;
                        return renderRectangleCard(card, getActionBadgeColor, setSelectedCard, showImageOnCard, isFullWidth);
                      });
                    })()}
                    {loadingRemaining && (
                      <div className="col-span-1 md:col-span-2 xl:col-span-3 min-h-[220px] rounded-2xl bg-gradient-to-t from-slate-950 via-[#0a1120] to-[#0f172a] border-2 border-amber-400/80 flex flex-col items-center justify-center p-6 text-center select-none shadow-[inset_0_10px_30px_rgba(0,0,0,0.85)] space-y-2.5">
                        <div className="relative w-12 h-12 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/News-Loader.gif"
                            alt="Loading..."
                            className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_15px_rgba(251,191,36,0.45)]"
                            style={{ filter: "brightness(0) invert(1)" }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                          <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300">
                            DISPATCHING REMAINING GAZETTE EDITIONS
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-slate-300 max-w-lg line-clamp-1">
                          Synthesizing additional architectural signals, deep takes & action cards…
                        </p>
                      </div>
                    )}
                  </>
                ) : searchedStories !== null ? (
                  <div className="col-span-1 md:col-span-2 xl:col-span-3 p-8 rounded-xl bg-white border border-slate-300 text-center font-mono space-y-3 shadow-xs">
                    <p className="text-slate-900 font-bold text-sm">
                      No live news articles found for "{activeSearchTopic}".
                    </p>
                    <p className="text-slate-500 text-xs">
                      Try searching another technology keyword (e.g. Docker, Kubernetes, PostgreSQL, Rust, Go).
                    </p>
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="px-4 py-2 rounded-lg bg-slate-950 text-amber-300 text-xs font-bold font-mono hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Reset to Curated Bento Deck
                    </button>
                  </div>
                ) : loadingRemaining ? (
                  <div className="col-span-1 md:col-span-2 xl:col-span-3 min-h-[300px] rounded-2xl bg-gradient-to-t from-slate-950 via-[#0a1120] to-[#0f172a] border-2 border-amber-400/80 flex flex-col items-center justify-center p-8 sm:p-12 text-center select-none shadow-[inset_0_10px_30px_rgba(0,0,0,0.85)] space-y-3">
                    {/* Custom News-Loader GIF rendered in crisp white with subtle amber glow */}
                    <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/News-Loader.gif"
                        alt="Loading..."
                        className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_15px_rgba(251,191,36,0.45)]"
                        style={{ filter: "brightness(0) invert(1)" }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                      <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300">
                        DISPATCHING REMAINING GAZETTE EDITIONS
                      </span>
                    </div>

                    <p className="font-mono text-[11px] text-slate-300 max-w-lg line-clamp-1">
                      Synthesizing additional architectural signals, deep takes & action cards…
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

          </div>
        )}

        {/* BOTTOM GAZETTE END DETECTOR & PULL PROMPT */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-12 pt-8 border-t-2 border-slate-300 flex flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={triggerLoadMore}
            disabled={isLoadingMore}
            className="group flex flex-col items-center gap-1.5 px-6 py-2.5 rounded-xl bg-white hover:bg-slate-950 border-2 border-slate-900 transition-all shadow-xs hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-slate-900 group-hover:text-amber-300 transition-colors">
              <ChevronDown className={`w-4 h-4 ${isLoadingMore ? "animate-spin text-amber-500" : "animate-bounce group-hover:text-amber-300"}`} />
              <span>{isLoadingMore ? "Lifting Page • Dispatching New Edition..." : "Scroll Down Or Click To Load More Updates"}</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">
              Gazette Edition {editionNumber} • Pull up or scroll to reveal next briefings
            </span>
          </button>
        </div>
      </main>

      {/* 4. DEEP DETAILS MODAL / DRAWER (DISPLAYS ENRICHED 4-PART ACTION CARD, NARRATIVE, CODE & MEDIA) */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-10 relative text-slate-800">
            <button
              onClick={() => setSelectedCard(null)}
              className="absolute top-6 right-6 text-slate-500 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-1.5 rounded-lg font-mono text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <X className="w-4 h-4" /><span>Close Detail</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 mb-4 pr-32">
              {selectedCard.target_stack.map((t) => (
                <span key={t} className="text-xs font-black px-3 py-1 rounded bg-slate-900 text-amber-300 uppercase font-mono tracking-wider shadow-2xs">
                  #{t}
                </span>
              ))}
              <span className="text-xs font-mono text-slate-500 font-bold tracking-wider">• DEEP ARCHITECTURAL INVESTIGATION</span>
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-serif text-slate-950 tracking-tight leading-tight mb-6">
              {selectedCard.title}
            </h2>

            {/* 4-PART ACTION PROTOCOL BOX (EXCLUSIVE TO DETAILED BOX) */}
            <div className="mb-8 p-6 rounded-2xl bg-slate-50 border-2 border-slate-900 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 font-mono">
                <span className="text-xs font-black uppercase tracking-widest text-slate-950 flex items-center gap-2">
                  <span><ClipboardList className="w-4 h-4" /> 4-PART ACTION CARD PROTOCOL</span>
                </span>
                <span className={`text-xs px-3 py-1 rounded-full border uppercase tracking-widest ${getActionBadgeColor(selectedCard.card_content.what_to_do_next.action_type)}`}>
                  {selectedCard.card_content.what_to_do_next.action_type}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. WHAT HAPPENED */}
                <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-2xs">
                  <div className="text-slate-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                    <span><Pin className="w-4 h-4" /></span> WHAT HAPPENED
                  </div>
                  <ul className="space-y-1.5 text-slate-700 text-xs sm:text-sm list-disc list-inside leading-relaxed font-medium">
                    {selectedCard.card_content.what_happened.map((bullet, idx) => (
                      <li key={idx} className="text-slate-700 font-medium">{bullet}</li>
                    ))}
                  </ul>
                </div>

                {/* 2. WHY IT MATTERS */}
                <div className="p-4 rounded-xl bg-white border border-slate-300 shadow-2xs">
                  <div className="text-indigo-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                    <span><Lightbulb className="w-4 h-4" /></span> WHY IT MATTERS
                  </div>
                  <p className="text-slate-700 text-xs sm:text-sm leading-relaxed font-medium">
                    {selectedCard.card_content.why_it_matters}
                  </p>
                </div>

                {/* 3. HOW IT AFFECTS YOU */}
                <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-300/80 shadow-2xs">
                  <div className="text-emerald-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-1.5 flex items-center gap-1.5">
                    <span><User className="w-4 h-4" /></span> IMPACT ON YOUR ROLE ({selectedCard.target_role.toUpperCase()})
                  </div>
                  <p className="text-emerald-950 text-xs sm:text-sm leading-relaxed font-medium">
                    {selectedCard.card_content.how_it_affects_you}
                  </p>
                </div>

                {/* 4. WHAT TO DO NEXT */}
                <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300/80 shadow-2xs">
                  <div className="text-amber-950 font-extrabold text-xs uppercase tracking-wider font-mono mb-1.5 flex items-center gap-1.5">
                    <span><Target className="w-4 h-4" /></span> ACTION PROTOCOL
                  </div>
                  <p className="text-amber-950 text-xs sm:text-sm leading-relaxed font-bold">
                    {selectedCard.card_content.what_to_do_next.guidance}
                  </p>
                </div>
              </div>
            </div>

            {/* NARRATIVE DESCRIPTION */}
            <div className="space-y-6 text-slate-700 leading-relaxed font-normal text-sm sm:text-base">
              <div className="space-y-4 text-slate-800 leading-relaxed">
                <p>
                  {selectedCard.deep_detail?.full_description ??
                    "In recent enterprise telemetry analyses and real-world infrastructure stress testing, industry leads uncovered vital patterns influencing this stack component. Relying on legacy configurations or default setups exposes systems to performance bottlenecks, unnecessary compute expenditure, and edge maintenance friction during large-scale operations."}
                </p>
                <p>
                  Transitioning to modern best practices in this area involves decoupling synchronous blockers and shifting verification steps earlier into automated CI/CD validation gates. By restructuring data boundaries and adopting asynchronous primitives, development teams experience smoother local iteration cycles and significantly greater operational resilience under high concurrency loads.
                </p>
              </div>

              {/* INTERACTIVE CODE / IMPLEMENTATION EXAMPLE (WHEN PRESENT) */}
              {selectedCard.deep_detail?.code_snippet && (
                <div className="rounded-xl bg-slate-950 text-slate-100 p-5 sm:p-6 font-mono text-xs sm:text-sm overflow-x-auto my-6 border border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold pb-2.5 mb-3 border-b border-slate-800 uppercase tracking-widest">
                    <span className="text-emerald-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      {selectedCard.deep_detail.code_snippet.language} Implementation Pattern
                    </span>
                    <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">PRODUCTION READY</span>
                  </div>
                  <pre className="leading-relaxed text-slate-200"><code>{selectedCard.deep_detail.code_snippet.code}</code></pre>
                </div>
              )}

              {/* ARCHITECTURAL DIAGRAM / MEDIA EMBED (WHEN PRESENT) */}
              {selectedCard.deep_detail?.has_visual_diagram && (
                <div className="my-6 rounded-xl overflow-hidden border-2 border-slate-800 shadow-md bg-slate-950 text-white">
                  <div className="bg-slate-900 px-5 py-2.5 font-mono text-xs font-black text-slate-300 border-b border-slate-800 flex items-center justify-between uppercase tracking-wider">
                    <span><Ruler className="w-4 h-4" /> {selectedCard.deep_detail.diagram_title ?? "System Architecture Diagram"}</span>
                    <span className="text-amber-400 font-bold">LIVE TELEMETRY VIEW</span>
                  </div>
                  <div className="h-56 sm:h-72 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-8 text-center border-t border-slate-800/60 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:16px_16px]"></div>
                    <span className="text-4xl mb-3 z-10">📊 <Zap className="w-4 h-4" /> <Shield className="w-4 h-4" /></span>
                    <h4 className="text-white text-base sm:text-lg font-bold mb-1 z-10 font-serif">{selectedCard.title}</h4>
                    <p className="text-slate-400 text-xs sm:text-sm max-w-md z-10 font-mono">
                      [Interactive Vector Topology & Throughput Optimization Curve — Simulated Media Player]
                    </p>
                    <div className="mt-4 px-4 py-1.5 rounded-full bg-indigo-600/30 border border-indigo-400/50 text-indigo-300 text-[11px] font-mono font-bold z-10 flex items-center gap-2">
                      <span>▶ Watch 4-Minute Engineering Walkthrough Video</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t-2 border-slate-200 flex flex-wrap items-center justify-between gap-4 font-mono">
              <a
                href={selectedCard.source_url}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-sm tracking-wider"
              >
                Read Full Original Documentation <ExternalLink className="w-3 h-3 inline ml-1" />
              </a>
              <button
                onClick={() => setSelectedCard(null)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-all tracking-wider cursor-pointer border border-slate-300"
              >
                Return to Gazette News Feed
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* RENDER HELPER 1: TOP MOST IMPORTANT UPDATE (COMPACT EDITORIAL LEAD BOX ON LEFT) */
function renderLeadSidebarCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void
) {
  return (
    <article
      key={card.id}
      className="rounded-xl bg-white border-2 border-slate-900 p-5 sm:p-6 shadow-sm flex flex-col justify-between flex-1 h-full"
    >
      <div>
        {/* Top Badges & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-950 text-amber-300 border border-slate-800 uppercase tracking-wider font-mono shadow-xs">
              #01
            </span>
            {card.target_stack.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 uppercase tracking-wider font-mono"
              >
                #{tag}
              </span>
            ))}
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded border uppercase font-mono font-bold tracking-wider ${getBadgeColor(
              card.card_content.what_to_do_next.action_type
            )}`}
          >
            {card.card_content.what_to_do_next.action_type}
          </span>
        </div>

        {/* Headline */}
        <h3
          onClick={() => onOpenDetail(card)}
          className="text-xl sm:text-2xl font-black text-slate-950 font-serif tracking-tight leading-tight mb-3 cursor-pointer"
        >
          {card.title}
        </h3>

        {/* Compact Hero Image (Spot 1 - Always high quality and compact) */}
        <div className="relative w-full h-36 sm:h-44 rounded-lg overflow-hidden my-3 border border-slate-200/90 bg-slate-100 shadow-2xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.image_url || "https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=800&auto=format&fit=crop"}
            alt={card.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        {/* 2 Key Takeaway Bullets */}
        <div className="mb-3.5 p-3 rounded-lg bg-slate-50 border border-slate-200/90 text-xs text-slate-700 space-y-1.5">
          <div className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-slate-950 flex items-center gap-1">
            <Pin className="w-3.5 h-3.5 text-rose-600" />
            <span>KEY SIGNALS:</span>
          </div>
          <ul className="space-y-1 pl-1 text-[11px] sm:text-xs">
            {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-rose-600 font-bold shrink-0">•</span>
                <span className="line-clamp-2">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Why It Matters */}
        <p className="text-slate-600 text-xs leading-relaxed mb-4 font-normal line-clamp-3">
          <strong className="text-slate-900 font-semibold font-mono text-[11px]">IMPACT: </strong>
          {card.card_content.why_it_matters}
        </p>
      </div>

      {/* Action Bar with Resource Link + Deep Detail Modal Trigger */}
      <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 font-mono">
        <a
          href={card.source_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-amber-300 hover:text-amber-200 font-bold text-xs transition-all shadow-xs shrink-0 cursor-pointer"
          title="Open original resource documentation"
        >
          <span>Read Resource</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <button
          onClick={() => onOpenDetail(card)}
          className="flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 transition-colors cursor-pointer"
        >
          <span>Full Protocol</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}

/* RENDER HELPER 2: WIDE RECTANGLE CARD (FOR MAJOR ARCHITECTURAL UPDATES IN BENTO DECK) */
function renderRectangleCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void,
  showImage?: boolean,
  isFullWidth?: boolean
) {
  return (
    <article
      key={card.id}
      className={`${
        isFullWidth
          ? "col-span-1 md:col-span-2 xl:col-span-3"
          : "col-span-1 md:col-span-2 xl:col-span-2"
      } rounded-xl bg-white border border-slate-300 hover:border-slate-900 transition-all p-5 sm:p-6 shadow-xs hover:shadow-md flex flex-col justify-between`}
    >
      <div>
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.target_stack.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200/80 uppercase tracking-wider font-mono"
              >
                #{tag}
              </span>
            ))}
            <span
              className={`text-[9px] px-2 py-0.5 rounded border uppercase font-mono font-bold tracking-wider ${getBadgeColor(
                card.card_content.what_to_do_next.action_type
              )}`}
            >
              {card.card_content.what_to_do_next.action_type}
            </span>
          </div>

          {/* Direct Resource Link */}
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-950 hover:text-amber-300 text-slate-700 font-mono text-[11px] font-bold transition-all border border-slate-200 shrink-0"
            title="Open original resource documentation"
          >
            <span>Resource</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Content Body: Horizontal Media Split if showImage is true, else clean editorial layout */}
        {showImage ? (
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
            {/* Left Image Thumbnail */}
            <div className="relative w-full sm:w-48 md:w-56 h-36 sm:h-44 shrink-0 rounded-lg overflow-hidden border border-slate-200/90 bg-slate-100 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getCardImageUrl(card)}
                alt={card.title}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>

            {/* Right Text Content */}
            <div className="flex-1 min-w-0">
              <h3
                onClick={() => onOpenDetail(card)}
                className="text-base sm:text-lg font-bold font-serif text-slate-950 leading-snug hover:text-indigo-900 transition-colors cursor-pointer mb-2"
              >
                {card.title}
              </h3>

              {/* 2 Key Takeaway Bullets */}
              <div className="mb-2 space-y-1">
                <ul className="space-y-1 text-xs text-slate-700">
                  {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-slate-400 font-bold shrink-0">•</span>
                      <span className="line-clamp-2">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Why It Matters */}
              <p className="text-slate-600 text-[11px] sm:text-xs leading-relaxed font-normal line-clamp-2">
                <strong className="text-slate-900 font-semibold font-mono text-[10px]">IMPACT: </strong>
                {card.card_content.why_it_matters}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <h3
              onClick={() => onOpenDetail(card)}
              className="text-lg sm:text-xl font-bold font-serif text-slate-950 leading-snug my-2 hover:text-indigo-900 transition-colors cursor-pointer"
            >
              {card.title}
            </h3>

            {/* 2 Key Takeaway Bullets */}
            <div className="mb-2.5 space-y-1">
              <ul className="space-y-1 text-xs text-slate-700">
                {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-slate-400 font-bold shrink-0">•</span>
                    <span className="line-clamp-2">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Why It Matters */}
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-3 font-normal line-clamp-2">
              <strong className="text-slate-900 font-semibold font-mono text-[11px]">IMPACT: </strong>
              {card.card_content.why_it_matters}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs mt-3 font-mono">
        <span className="text-slate-500 text-[11px] truncate">
          Role: <strong className="text-slate-800 font-semibold">{card.target_role}</strong>
        </span>
        <button
          onClick={() => onOpenDetail(card)}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-950 font-bold flex items-center gap-1.5 transition-colors border border-indigo-200 cursor-pointer shrink-0"
        >
          <span>Full Protocol</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}

/* RENDER HELPER 3: NEAT SQUARE CARD (FOR SYSTEM WATCH & SPOTLIGHTS IN BENTO DECK) */
function renderSquareCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void,
  showImage?: boolean
) {
  return (
    <article
      key={card.id}
      className="col-span-1 rounded-xl bg-white border border-slate-300 hover:border-slate-900 transition-all p-5 shadow-xs hover:shadow-md flex flex-col justify-between"
    >
      <div>
        {/* Top Row with Rank, Tag, and Direct Resource Icon Link */}
        <div className="flex items-center justify-between gap-1.5 mb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200/80 uppercase tracking-wider font-mono truncate">
              #{card.target_stack[0]}
            </span>
          </div>

          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-slate-950 transition-colors p-1"
            title="Open original resource documentation"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Optional Image Thumbnail when showImage is true */}
        {showImage && (
          <div className="relative w-full h-32 sm:h-36 rounded-lg overflow-hidden mb-3 border border-slate-200/90 bg-slate-100 shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getCardImageUrl(card)}
              alt={card.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}

        {/* Headline */}
        <h3
          onClick={() => onOpenDetail(card)}
          className="text-base font-bold font-serif text-slate-950 leading-snug line-clamp-2 mb-2 hover:text-indigo-900 transition-colors cursor-pointer"
        >
          {card.title}
        </h3>

        {/* 2 Key Signal Bullets */}
        <div className="mb-2 space-y-1">
          <ul className="space-y-1 text-xs text-slate-700">
            {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-slate-400 font-bold shrink-0">•</span>
                <span className="line-clamp-2">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Why It Matters / Impact Snippet */}
        <p className="text-slate-600 text-[11px] leading-relaxed font-normal line-clamp-2 mb-2">
          <strong className="text-slate-900 font-semibold font-mono text-[10px]">IMPACT: </strong>
          {card.card_content.why_it_matters}
        </p>
      </div>

      {/* Footer */}
      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto font-mono">
        <span
          className={`text-[9px] px-2 py-0.5 rounded border uppercase font-bold tracking-wider ${getBadgeColor(
            card.card_content.what_to_do_next.action_type
          )}`}
        >
          {card.card_content.what_to_do_next.action_type}
        </span>

        <button
          onClick={() => onOpenDetail(card)}
          className="text-[10px] font-bold text-slate-600 hover:text-slate-950 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>Details</span>
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
    </article>
  );
}

/* RENDER HELPER 4: BRIEF WIRE CARDS (SIDEBAR DISPATCHES) */
function renderBriefCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  onOpenDetail: (card: BriefingCard) => void,
  rankNumber?: number
) {
  return (
    <article
      key={card.id}
      className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5 shadow-2xs hover:border-slate-400 transition-all flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            {rankNumber !== undefined && rankNumber <= 5 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 font-mono shrink-0">
                #{String(rankNumber).padStart(2, "0")}
              </span>
            )}
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase tracking-wider font-mono truncate">
              #{card.target_stack[0]}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onOpenDetail(card)}
              className="text-[10px] font-extrabold text-indigo-700 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 px-2 py-0.5 rounded font-mono transition-all cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <span>Details</span>
              <Maximize2 className="w-3 h-3" />
            </button>
            <a
              href={card.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-slate-400 hover:text-slate-900 font-bold font-mono shrink-0"
              title="Open original resource documentation"
            >
              <ExternalLink className="w-3 h-3 inline ml-0.5" />
            </a>
          </div>
        </div>

        <h4
          onClick={() => onOpenDetail(card)}
          className="text-sm sm:text-base font-bold font-serif text-slate-900 leading-snug line-clamp-2 hover:text-indigo-900 transition-colors cursor-pointer mb-2"
        >
          {card.title}
        </h4>

        <p className="text-slate-600 text-xs leading-relaxed line-clamp-3">
          {card.card_content.what_happened[0] || card.card_content.why_it_matters}
        </p>

        {card.card_content.why_it_matters && card.card_content.what_happened[0] && (
          <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2 font-mono pt-2 mt-2 border-t border-dashed border-slate-100">
            <span className="font-bold text-slate-700">IMPACT: </span>
            {card.card_content.why_it_matters}
          </p>
        )}
      </div>

      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-500 mt-3">
        <span className="truncate">Role: {card.target_role}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] border uppercase font-bold ${getBadgeColor(
            card.card_content.what_to_do_next.action_type
          )}`}
        >
          {card.card_content.what_to_do_next.action_type}
        </span>
      </div>
    </article>
  );
}

/* EXPANSIVE BROADSHEET DATASET (16 ARTICLES) TO FULLY FILL ALL COLUMNS WITHOUT EMPTY SPACES */
function getBroadsheetCards(): BriefingCard[] {
  const cards: BriefingCard[] = [
    // 1 LEAD STORY (CENTER TOP)
    {
      id: "lead-1",
      title: "React Architecture Revolution: New Compilation & Runtime Standards Released",
      source_url: "https://react.dev",
      image_url: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=800&auto=format&fit=crop",
      target_role: "Frontend Architect",
      target_stack: ["React", "System Architecture"],
      priority: "lead",
      card_content: {
        what_happened: [
          "Major core update announced for enterprise React introducing zero-bundle overhead build-time compiler tuning.",
          "New built-in asynchronous component profiling tools replace legacy third-party diagnostic libraries.",
        ],
        why_it_matters:
          "Dramatically lowers JavaScript memory footprints in production while streamlining CI/CD deployment verification pipelines across large teams.",
        how_it_affects_you:
          "You will experience up to 40% faster local dev builds, eliminate manual memoization hooks, and get improved strict type checking when writing modular UI components.",
        what_to_do_next: {
          action_type: "prepare",
          guidance:
            "Audit existing project dependencies and schedule a sprint chore to benchmark your build pipeline against the new compiler flags.",
        },
      },
      deep_detail: {
        full_description:
          "The latest enterprise compiler iteration alters how frontend DOM diffing operations calculate state mutations. Historically, runtime reconciliation loops executed extensive virtual DOM equality comparisons whenever component parent trees triggered re-renders. Under this newly published compilation pipeline, static analyzer heuristics determine component immutability ahead of time during automated builds, effectively removing memoization boilerplate across large engineering teams.",
        has_visual_diagram: true,
        diagram_title: "Zero-Bundle Compiler vs Legacy Virtual DOM Diffing",
        code_snippet: {
          language: "TypeScript",
          code: `// ENTERPRISE ARCHITECTURE: Automated Compiler Transformation
// No manual React.memo(), useMemo(), or useCallback() wrappers required

export function EnterpriseDashboardMetrics({ telemetry, onRefresh }: MetricsProps) {
  // Automatically memorized during CI build step via JSX static analysis
  const aggregatedThroughput = telemetry.reduce((acc, metric) => acc + metric.p99Latency, 0);

  return (
    <section className="dashboard-grid">
      <TelemetryGauge value={aggregatedThroughput} />
      <button onClick={onRefresh} className="btn-refresh">Fetch Real-Time Signals</button>
    </section>
  );
}`,
        },
      },
    },

    // 4 MAJOR SYSTEM FEATURE STORIES (CENTER BOTTOM 2x2 GRID)
    {
      id: "major-1",
      title: ".NET Core & Backend: Enterprise Migration to Minimal APIs & Vertical Slices",
      source_url: "https://devblogs.microsoft.com",
      image_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop",
      target_role: "Backend Engineer",
      target_stack: [".NET Core", "Backend", "Architecture"],
      priority: "major",
      card_content: {
        what_happened: [
          "Enterprise engineering teams are accelerating migration away from rigid N-tier architecture toward self-contained vertical slices with Minimal APIs.",
        ],
        why_it_matters:
          "Feature slicing isolates domain boundaries and minimizes middleware routing overhead, reducing P99 latency by over 25% under concurrency.",
        how_it_affects_you:
          "Your code structure will shift from grouping by technical layer (/controllers, /services) to domain feature folders with localized validators.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Refactor one legacy controller into a vertical feature slice utilizing endpoint filters.",
        },
      },
    },
    {
      id: "major-2",
      title: "DevOps & Infrastructure: Zero-Downtime Rolling Deploys & eBPF Observability",
      source_url: "https://kubernetes.io",
      target_role: "DevOps Architect",
      target_stack: ["DevOps", "Kubernetes", "Observability"],
      priority: "major",
      card_content: {
        what_happened: [
          "Kernel-level eBPF probes are rapidly replacing sidecar telemetry agents in high-load production clusters.",
        ],
        why_it_matters:
          "Eliminates container proxy CPU overhead while giving real-time network packet visibility during live blue/green canary deployments.",
        how_it_affects_you:
          "Cluster administrators no longer need to inject logging sidecars simply to get distributed request traces.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Evaluate modern eBPF networking telemetry tools in staging environments.",
        },
      },
    },
    {
      id: "major-3",
      title: "Frontend Performance Watch: Server Actions vs Client Bundle Pruning",
      source_url: "https://nextjs.org",
      target_role: "Fullstack Engineer",
      target_stack: ["Frontend", "Next.js", "Performance"],
      priority: "major",
      card_content: {
        what_happened: [
          "Recent case studies demonstrate a 60% reduction in hydration payloads when migrating form mutations to Server Actions.",
        ],
        why_it_matters:
          "Smaller client bundles significantly improve Core Web Vitals (INP and LCP), directly raising organic search visibility and user retention.",
        how_it_affects_you:
          "Client-side API fetching libraries and manual loading state boilerplate can be supplanted by progressive enhancement HTML patterns.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Migrate complex form submission components from REST mutations to server action handlers.",
        },
      },
    },
    {
      id: "major-4",
      title: "Micro-Frontend Systems: Module Federation 2.0 & Static Synthesis",
      source_url: "https://webpack.js.org",
      target_role: "System Architect",
      target_stack: ["Micro-Frontends", "Webpack", "Vite"],
      priority: "major",
      card_content: {
        what_happened: [
          "Module Federation updates now allow runtime shared dependency version consolidation without full page reload deadlocks.",
        ],
        why_it_matters:
          "Allows autonomous engineering squads to deploy individual UI widgets to production without risking global framework version mismatches.",
        how_it_affects_you:
          "Shared Design System components will dynamically negotiate singleton instance execution across independent sub-application shells.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Review shared library exclusion patterns in your bundler configuration.",
        },
      },
    },

    // 3 DEEP TECH WATCH STORIES (RIGHT COLUMN)
    {
      id: "watch-1",
      title: "Kubernetes Security Audit: Zero-Trust Network Meshes & mTLS Enforcement",
      source_url: "https://cncf.io",
      target_role: "Security Engineer",
      target_stack: ["Security", "Kubernetes"],
      priority: "watch",
      card_content: {
        what_happened: [
          "CNCF security guidelines now strongly mandate strict mutual TLS (mTLS) enforcement at the CNI layer rather than app proxies.",
        ],
        why_it_matters:
          "Pre-empts lateral movement attacks across internal container networks even if an isolated application pod is compromised.",
        how_it_affects_you:
          "Application manifests must remove explicit plaintext HTTP debug ports from internal service YAML definitions.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Enforce default-deny network ingress policies in non-public cluster namespaces.",
        },
      },
    },
    {
      id: "watch-2",
      title: "Distributed Databases: Read-After-Write Consensus Benchmarks in Multi-Region Cloud",
      source_url: "https://jepsen.io",
      target_role: "Database Architect",
      target_stack: ["Databases", "Distributed Systems"],
      priority: "watch",
      card_content: {
        what_happened: [
          "Recent benchmarks reveal significant latency variances when utilizing quorum-based replication protocols across inter-continental cloud AZs.",
        ],
        why_it_matters:
          "Choosing strict linearizability over causal consistency can increase cross-region API database write durations by up to 180ms.",
        how_it_affects_you:
          "Data modeling must explicitly segregate eventual consistency analytics logs from real-time transactional financial ledgers.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Audit read-consistency configurations in high-frequency user profile query endpoints.",
        },
      },
    },
    {
      id: "watch-3",
      title: "Rust in the Backend: High-Throughput WebSockets with Memory Safety Guarantees",
      source_url: "https://tokio.rs",
      target_role: "Systems Engineer",
      target_stack: ["Rust", "Async IO", "Backend"],
      priority: "watch",
      card_content: {
        what_happened: [
          "Adoption of asynchronous Tokio-based web event engines continues to overtake Node.js and Go in real-time streaming architectures.",
        ],
        why_it_matters:
          "Rust eliminates garbage collection pauses entirely, delivering flat 99.9th percentile latency curves even under 500k simultaneous WebSocket connections.",
        how_it_affects_you:
          "Teams building real-time collaboration or streaming pipelines will benefit from migrating socket gateways to Rust micro-binaries.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Prototype an asynchronous TCP routing gateway using native async/await bindings.",
        },
      },
    },

    // 2 SPOTLIGHT EDITORIAL TAKES (MIXED INTO RIGHT COLUMN TO REFILL EMPTY SPACE)
    {
      id: "spotlight-1",
      title: "Editorial Spotlight: Async Event-Driven Resiliency vs Synchronous REST APIs",
      source_url: "https://martinfowler.com",
      target_role: "Chief Architect",
      target_stack: ["Enterprise", "Event-Driven"],
      priority: "spotlight",
      card_content: {
        what_happened: ["Synchronous chain-of-REST service communication remains the #1 cause of enterprise cascading outages."],
        why_it_matters: "By decoupling inter-service orchestration with asynchronous message brokers, systems retain high availability even when downstream dependencies degrade.",
        how_it_affects_you: "Architects should mandate circuit breaker patterns on all external HTTP invocations.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Implement outbox messaging queues for non-blocking database state transitions.",
        },
      },
    },
    {
      id: "spotlight-2",
      title: "AI Cost Optimization: Local Vector Indexing vs Heavy LLM API Cloud Invocations",
      source_url: "https://openai.com",
      target_role: "AI Architect",
      target_stack: ["AI Systems", "Cost Optimization"],
      priority: "spotlight",
      card_content: {
        what_happened: ["Cloud embedding API overhead increases exponentially with real-time keystroke user semantic filtering."],
        why_it_matters: "Executing lightweight localized embedding similarity calculations inside client browsers cuts recurring token server expenses by over 80%.",
        how_it_affects_you: "Frontend interfaces can provide instantaneous semantic autocomplete without network requests.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Test WASM vector indexing plugins for real-time table sorting.",
        },
      },
    },

    // 8 QUICK WIRE STORIES (LEFT COLUMN - COMPLETE PACKED FEED TO PREVENT BOTTOM VOIDS)
    {
      id: "brief-1",
      title: "Security Bulletin: JWT Token Lifecycle Middleware Vulnerability Mitigated",
      source_url: "https://github.com",
      target_role: "Security Engineer",
      target_stack: ["Security", "Backend"],
      priority: "brief",
      card_content: {
        what_happened: ["Audit reports highlight race conditions when verifying unexpired refresh tokens under asynchronous burst loads."],
        why_it_matters: "Unoptimized synchronous cryptographic decoding in event loops can cause request blocking and transient P99 timeouts.",
        how_it_affects_you: "Authentication gateway layers require upgrading to native asynchronous cryptographic verification helpers.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Move token validation into centralized gateway middlewares with async hashing.",
        },
      },
      deep_detail: {
        full_description:
          "Enterprise authentication audits recently uncovered a widespread cryptographic blocking vulnerability occurring when OAuth2 and JWT validation middlewares parse high-concurrency refresh token rotations. Because traditional cryptographic verification libraries often execute synchronous CPU-intensive decoding loops directly on main event threads, high-frequency request spikes introduce transient thread starvation, increasing P99 request latency and causing cascading timeout errors across dependent microservices.",
        has_visual_diagram: true,
        diagram_title: "Async Gateway Auth Middleware vs Sync Blocking Event Loop",
        code_snippet: {
          language: "TypeScript",
          code: `// MITIGATED MIDDLEWARE ARCHITECTURE: Asynchronous JWT Verification
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS_URI = new URL('https://auth.becon.dev/.well-known/jwks.json');
const JWKS = createRemoteJWKSet(JWKS_URI, { cacheMaxAge: 3600000 });

export async function authGatewayMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  try {
    // Non-blocking async verification utilizing Web Crypto API worker thread pools
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://auth.becon.dev',
      audience: 'becon-enterprise-api',
    });
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(403).json({ error: "Token expired or cryptographic mismatch" });
  }
}`,
        },
      },
    },
    {
      id: "brief-2",
      title: "Angular 19 Release: Zoneless Change Detection Reaches Production Readiness",
      source_url: "https://angular.dev",
      target_role: "Frontend Engineer",
      target_stack: ["Angular", "Frontend"],
      priority: "brief",
      card_content: {
        what_happened: ["Angular formally endorses Signals as default reactive primitive, allowing developers to deprecate zone.js."],
        why_it_matters: "Removing zone.js cuts core framework bundle sizes and produces predictable, highly targeted UI DOM rerenders.",
        how_it_affects_you: "New Angular services should default to Signal inputs, computed values, and effect handlers.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Experiment with enableZonelessChangeDetection in newest frontend modules.",
        },
      },
    },
    {
      id: "brief-3",
      title: "AI Architecture Engineering: Caching Local Embeddings with WebAssembly & SQLite",
      source_url: "https://sqlite.org",
      target_role: "AI Engineer",
      target_stack: ["AI Systems", "WebAssembly"],
      priority: "brief",
      card_content: {
        what_happened: ["New in-browser WASM vector search extensions allow client apps to perform similarity searches with zero server latency."],
        why_it_matters: "Offloading vector embeddings to client storage reduces LLM API server costs and delivers instant local autocompletion.",
        how_it_affects_you: "Offline-capable semantic search filters can live directly inside high-density web apps.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Benchmark local browser WASM SQLite extensions with vector plugins.",
        },
      },
    },
    {
      id: "brief-4",
      title: "Cloud Infrastructure: Serverless Cold-Start Tuning with Native Rust Compilers",
      source_url: "https://aws.amazon.com",
      target_role: "Cloud Engineer",
      target_stack: ["Cloud", "Rust"],
      priority: "brief",
      card_content: {
        what_happened: ["Runtime optimizations combining lightweight micro-VMs with Rust binaries achieve sub-5ms cold start initialization."],
        why_it_matters: "Eliminates latency penalties historically associated with serverless architectures in latency-sensitive endpoints.",
        how_it_affects_you: "Critical path authorization handlers benefit from cross-compiling lightweight Rust bindings.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Evaluate migrating slow serverless cloud routers to native binary builds.",
        },
      },
    },
    {
      id: "brief-5",
      title: "TypeScript 5.6 Release: Strict Type-Checking Enhancements & Nullish Refining",
      source_url: "https://www.typescriptlang.org",
      target_role: "Frontend Developer",
      target_stack: ["TypeScript", "Tooling"],
      priority: "brief",
      card_content: {
        what_happened: ["New TypeScript compiler releases catch accidental truthy evaluations and enhance generic iterator type inference."],
        why_it_matters: "Prevents subtle runtime null-reference exceptions in conditional logical branching and complex asynchronous array transformations.",
        how_it_affects_you: "CI validation pipelines will now accurately flag redundant null checks and dead code branches in compiler warnings.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Enable strict null checking flags across all frontend library configs.",
        },
      },
    },
    {
      id: "brief-6",
      title: "Containerization Trends: Rootless Podman vs Daemon-Based Docker Runtimes",
      source_url: "https://podman.io",
      target_role: "DevOps Specialist",
      target_stack: ["Docker", "Containers", "DevOps"],
      priority: "brief",
      card_content: {
        what_happened: ["Enterprise security compliance standards are pushing container executions away from root daemon architectures toward daemonless Podman CLI engines."],
        why_it_matters: "Running containers as unprivileged users eliminates container breakout risks on developer laptops and CI shared runner VMs.",
        how_it_affects_you: "Dockerfiles remain totally compatible, but build pipelines should transition to rootless OCI image builders.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Test executing localized docker-compose environments using alias podman-compose.",
        },
      },
    },
    {
      id: "brief-7",
      title: "GraphQL Caching Architecture: Automated Persisted Queries & Stale Revalidation",
      source_url: "https://graphql.org",
      target_role: "API Engineer",
      target_stack: ["GraphQL", "API Design"],
      priority: "brief",
      card_content: {
        what_happened: ["Modern GraphQL gateway servers now automatically transform verbose POST POST query strings into lightweight GET requests with cryptographic hash identifiers."],
        why_it_matters: "Enables standard edge HTTP CDN edge caching for complex GraphQL payloads, drastically dropping downstream database load.",
        how_it_affects_you: "Client application fetch headers must adopt persisted query validation protocol middleware.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Configure edge CDN cache-control headers on authenticated API read queries.",
        },
      },
    },
    {
      id: "brief-8",
      title: "PostgreSQL Database Mechanics: B-Tree vs GIN Index Performance Under Burst Writes",
      source_url: "https://postgresql.org",
      target_role: "Database Admin",
      target_stack: ["PostgreSQL", "Database"],
      priority: "brief",
      card_content: {
        what_happened: ["Production benchmarking shows over-indexing JSONB column fields with generalized inverted indexes (GIN) severely degrade transaction write speeds during peak insert traffic."],
        why_it_matters: "Unoptimized index maintenance overhead during massive concurrent batch inserts causes transaction pool starvation.",
        how_it_affects_you: "Developers should limit GIN indexing solely to frequently queried JSON key paths instead of indexing entire document blobs.",
        what_to_do_next: {
          action_type: "avoid",
          guidance: "Audit database schema definitions and drop unused wildcard JSONB column indexes.",
        },
      },
    },
  ];
  return cards.map((c, index) => ({
    ...c,
    rank: index < 10 ? index + 1 : undefined,
  }));
}

/* NEXT EDITIONS GENERATOR: RICH EDITORIAL ARCHITECTURE CARDS FOR INFINITE SCROLL */
function getNextEditionCards(edition: number, role: string, interests: string): BriefingCard[] {
  if (edition % 2 === 0) {
    return [
      {
        id: `edition-${edition}-1`,
        title: "Zero-Copy Deserialization with FlatBuffers: Benchmarking 5x Throughput in Microservices",
        source_url: "https://devblogs.microsoft.com",
        image_url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop",
        target_role: role || "Senior Software Engineer",
        target_stack: [".NET Core", "High Performance"],
        priority: "major",
        card_content: {
          what_happened: [
            "Enterprise infrastructure benchmarking demonstrates memory allocation reductions up to 90% using FlatBuffers over JSON serialization.",
            "Eliminates GC pressure during continuous high-frequency telemetry stream ingestion."
          ],
          why_it_matters: "Heavy JSON parsing bottlenecks cloud CPU instances during high-concurrency peak load events.",
          how_it_affects_you: "Direct access to internal binary buffer fields without unpacking lowers p99 latency in production services.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Evaluate binary schema compiler tooling on internal inter-service gRPC communication channels."
          }
        },
        deep_detail: {
          full_description: "Traditional serialized payloads like JSON or standard protocol buffers demand a dedicated deserialization phase where byte streams get parsed into managed heap objects. FlatBuffers stores organized hierarchical data in flat binary memory buffers, enabling applications to read fields directly in-place without memory allocation overhead.",
          has_visual_diagram: true,
          diagram_title: "Zero-Copy In-Place Memory Traversal vs Heap Allocation",
          code_snippet: {
            language: "C#",
            code: `// Zero-Allocation FlatBuffer Accessor Pattern\nvar byteBuffer = new ByteBuffer(networkPayloadSpan);\nvar telemetryData = TelemetryReport.GetRootAsTelemetryReport(byteBuffer);\n\n// Direct field access via offset lookup without object allocation\nlong deviceId = telemetryData.DeviceId;\ndouble p99Latency = telemetryData.LatencyMs;`
          }
        }
      },
      {
        id: `edition-${edition}-2`,
        title: "Distributed Transaction Outbox Pattern: Guaranteeing Consistency in Cloud Slices",
        source_url: "https://learn.microsoft.com/azure/architecture/",
        target_role: role || "Cloud Architect",
        target_stack: ["Cloud Infrastructure", "Architecture"],
        priority: "major",
        card_content: {
          what_happened: [
            "Architectural patterns validate the transactional outbox table as the primary defense against dual-write inconsistency.",
            "Debezium and Kafka Connect change-data-capture (CDC) pipelines automate asynchronous event dispatch."
          ],
          why_it_matters: "Prevents orphaned database records and phantom downstream message broker publishes during system faults.",
          how_it_affects_you: "You must encapsulate database operations and corresponding event rows inside a single local ACID transaction.",
          what_to_do_next: {
            action_type: "prepare",
            guidance: "Audit existing domain command handlers to verify transactional outbox table schema support."
          }
        },
        deep_detail: {
          full_description: "When an application updates a database and sends an event to a message broker, a failure in either step leaves the system in an inconsistent state. The Outbox pattern writes the outgoing message directly into an 'Outbox' table within the exact same database transaction as the business entity changes, providing absolute transactional integrity.",
          has_visual_diagram: true,
          diagram_title: "Transactional Outbox & CDC Event Relay Pipeline"
        }
      },
      {
        id: `edition-${edition}-3`,
        title: "WebAssembly GC & Component Model: Polyglot Cloud Microservices Entering Staging",
        source_url: "https://webassembly.org",
        target_role: role || "Full Stack Engineer",
        target_stack: ["WebAssembly", "Tooling"],
        priority: "major",
        card_content: {
          what_happened: [
            "Wasm Component Model introduces interface types enabling seamless interoperability between Rust, C#, and Go binaries.",
            "Native Garbage Collection (WasmGC) support drops cold-start footprint to sub-millisecond execution times."
          ],
          why_it_matters: "Enables secure, lightweight sandboxing for user-defined functions without container virtualization penalties.",
          how_it_affects_you: "Edge serverless workers can be compiled once and deployed universally across multi-cloud environments.",
          what_to_do_next: {
            action_type: "learn",
            guidance: "Review WASI Preview 2 specifications and build a prototype Wasm edge function."
          }
        }
      },
      {
        id: `edition-${edition}-4`,
        title: "PostgreSQL Connection Pooling: PgBouncer vs Odyssey Under Burst Concurrency",
        source_url: "https://postgresql.org",
        image_url: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?q=80&w=800&auto=format&fit=crop",
        target_role: role || "Database Admin",
        target_stack: ["SQL & Vector DB", "PostgreSQL"],
        priority: "major",
        card_content: {
          what_happened: [
            "Comparative stress testing demonstrates multi-threaded connection routers sustain 40,000 active concurrent client sessions.",
            "Transaction-mode pooling drastically curtails PostgreSQL backend process fork memory degradation."
          ],
          why_it_matters: "Protects production database clusters from connection storms during sudden Kubernetes pod autoscaling bursts.",
          how_it_affects_you: "Session state features like prepared statements require precise pooler transaction-mode configuration.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Configure transaction-level connection pooling on staging read replicas before scaling client replica counts."
          }
        }
      },
      {
        id: `edition-${edition}-5`,
        title: "Kernel-Level Zero-Trust: Replacing Sidecar Proxies with Cilium & eBPF",
        source_url: "https://cilium.io",
        target_role: role || "DevOps Architect",
        target_stack: ["Zero-Trust Security", "DevOps"],
        priority: "brief",
        card_content: {
          what_happened: [
            "eBPF sockmap optimizations bypass host TCP/IP stack overhead for pod-to-pod network transmission.",
            "Zero-trust network policy enforcement shifts directly into the Linux kernel socket layer."
          ],
          why_it_matters: "Cuts microservice network latency in half by eliminating dual user-space context switches through Envoy sidecars.",
          how_it_affects_you: "Service mesh telemetry is collected seamlessly without mutating pod deployments or injecting containers.",
          what_to_do_next: {
            action_type: "learn",
            guidance: "Deploy Cilium CNI in a development cluster and benchmark pod ping latency."
          }
        }
      },
      {
        id: `edition-${edition}-6`,
        title: "Next-Gen Frontend Compilation: Lightning CSS & Rolldown Engine Acceleration",
        source_url: "https://rolldown.rs",
        target_role: role || "Frontend Architect",
        target_stack: ["React & Next.js", "Tooling"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Rust-based Rolldown bundler delivers 10x-30x build acceleration with full Rollup plugin API compatibility.",
            "Lightning CSS replaces legacy PostCSS plugins with native multi-threaded syntax tree parsing."
          ],
          why_it_matters: "Significantly decreases production CI build waiting times and accelerates developer hot-module reload feedback.",
          how_it_affects_you: "Large monorepos can consolidate disparate CSS build setups into a single optimized binary pipeline.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Benchmark Lightning CSS minification against current Webpack or Vite build configurations."
          }
        }
      }
    ];
  } else {
    return [
      {
        id: `edition-${edition}-1`,
        title: "Vector Index Performance: HNSW vs IVFFlat Under High-Dimensionality Workloads",
        source_url: "https://pgvector.dev",
        image_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop",
        target_role: role || "AI Engineer",
        target_stack: ["Google Gemini & Generative AI", "SQL & Vector DB"],
        priority: "major",
        card_content: {
          what_happened: [
            "Hierarchical Navigable Small World (HNSW) indexes demonstrate 98% recall at sub-10ms query latency for 1536-dimensional embeddings.",
            "Memory footprint trade-offs require careful quantization tuning when scaling beyond 10 million vector records."
          ],
          why_it_matters: "Selecting the wrong indexing strategy causes vector retrieval timeouts during live retrieval-augmented generation (RAG).",
          how_it_affects_you: "Production vector store setup must balance construction time, memory usage, and approximate nearest neighbor recall.",
          what_to_do_next: {
            action_type: "learn",
            guidance: "Benchmark pgvector HNSW index parameters (m=16, ef_construction=64) on your domain embeddings dataset."
          }
        },
        deep_detail: {
          full_description: "Retrieval-Augmented Generation (RAG) platforms rely on low-latency vector similarity search across semantic embeddings. IVFFlat clusters vectors into inverted lists which offers rapid build times but requires re-indexing as data grows. HNSW builds multi-layer graph topologies that retain exceptional recall speed regardless of corpus size.",
          has_visual_diagram: true,
          diagram_title: "HNSW Multi-Layer Navigable Graph vs IVFFlat Voronoi Cells"
        }
      },
      {
        id: `edition-${edition}-2`,
        title: "Fault-Tolerant Microservices: Combining Polly Retry Pipelines with Circuit Breakers",
        source_url: "https://github.com/App-vNext/Polly",
        target_role: role || "Senior Backend Engineer",
        target_stack: [".NET Core", "Architecture"],
        priority: "major",
        card_content: {
          what_happened: [
            "Polly v8 redesign introduces unified resilience pipelines with zero-allocation telemetry hooks.",
            "Circuit breakers combined with exponential jitter prevent thundering herd crashes on recovering upstream dependencies."
          ],
          why_it_matters: "Uncoordinated retry storms overwhelm impaired backend dependencies, turning minor blips into complete outages.",
          how_it_affects_you: "All outbound HTTP client factories should be configured with jittered backoff strategies and breaker thresholds.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Migrate legacy Polly syntax to the new ResiliencePipelineBuilder API pattern."
          }
        }
      },
      {
        id: `edition-${edition}-3`,
        title: "Event Sourcing Mechanics: Schema Evolution & Compatibility Modes in Kafka",
        source_url: "https://kafka.apache.org",
        target_role: role || "Cloud Architect",
        target_stack: ["Cloud Infrastructure & Azure", "Microservices"],
        priority: "major",
        card_content: {
          what_happened: [
            "Confluent Schema Registry enforce FORWARD and FULL_TRANSITIVE validation rules preventing breaking consumer deserialization crashes.",
            "Avro and Protobuf schema diffing integrated directly into CI pull request verification checks."
          ],
          why_it_matters: "Decoupled downstream consumer microservices crash when upstream domain events introduce incompatible schema modifications.",
          how_it_affects_you: "Every schema mutation must adhere to strict backward or transitive compatibility rules.",
          what_to_do_next: {
            action_type: "prepare",
            guidance: "Configure automated schema validation checks in your continuous integration deployment gates."
          }
        }
      },
      {
        id: `edition-${edition}-4`,
        title: "Browser Profiling Deep Dive: Diagnosing Detached DOM Trees & Event Closures",
        source_url: "https://developer.chrome.com",
        target_role: role || "Frontend Engineer",
        target_stack: ["Angular & Web Frameworks", "TypeScript"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Chrome DevTools Memory snapshot comparisons reveal uncleaned RxJS subscriptions and detached component host elements.",
            "Retained memory leaks degrade client page responsiveness during long-lived single-page application sessions."
          ],
          why_it_matters: "Gradual memory leakage causes browser tab crashes on enterprise workstations operating dashboards all day.",
          how_it_affects_you: "Use takeUntilDestroyed() or AbortController signals to guarantee deterministic cleanup on component destroy.",
          what_to_do_next: {
            action_type: "avoid",
            guidance: "Audit subscribe blocks and replace manual unsubscriptions with automated lifecycle destroy hooks."
          }
        }
      },
      {
        id: `edition-${edition}-5`,
        title: "Enterprise Generative AI: Structured Tool Calling & Output Grounding in Gemini",
        source_url: "https://ai.google.dev",
        target_role: role || "AI Engineer",
        target_stack: ["Google Gemini & Generative AI", "AI Systems"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Google Gemini API introduces deterministic schema enforcement with response_schema and function declaration validation.",
            "Hallucination rates fall below 0.5% when combining function calling with Google Search retrieval grounding."
          ],
          why_it_matters: "Enterprise automation requires 100% parseable JSON payloads without Markdown formatting artifacts or hallucinated fields.",
          how_it_affects_you: "You can define Pydantic / JSON Schema models that the AI engine is mathematically constrained to conform to.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Adopt structured JSON schema generation in your Gemini prompt orchestration workflows."
          }
        }
      },
      {
        id: `edition-${edition}-6`,
        title: "Zero-Trust Cloud Identity: Workload Identity Federation & Ephemeral Credentials",
        source_url: "https://learn.microsoft.com",
        target_role: role || "Security Engineer",
        target_stack: ["Zero-Trust Cloud Security", "Cloud Infrastructure"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Security standards mandate eliminating static long-lived API secrets and service principal passwords in CI/CD pipelines.",
            "OpenID Connect (OIDC) token exchange grants short-lived ephemeral cloud access tokens with zero stored keys."
          ],
          why_it_matters: "Leaked long-lived repository secrets represent the number one vector for automated supply chain account compromises.",
          how_it_affects_you: "GitHub Actions and Azure DevOps runners obtain temporary cloud access via cryptographically signed OIDC tokens.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Deprecate repository secret credentials and configure OIDC federated credentials in Azure AD."
          }
        }
      }
    ];
  }
}

