"use client";

import { User, Layers, Radio, Flame, Pin, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, BookOpen, Sun, Moon, X, Search, Loader2, Sparkles, LogOut, LogIn, CheckCircle2, ArrowRight } from "lucide-react";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { getBriefingsCacheKey } from "@/lib/cache";
import { GuestBanner } from "@/components/GuestBanner";
import { RequireAuth } from "@/components/RequireAuth";
import { LeadCard, RectangleCard, SquareCard, BriefCard } from "@/components/cards";
import { CardDrawer } from "@/components/CardDrawer";

export const BRIEFING_MAX_CARDS = 10;

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
  is_real_image?: boolean;
  published_at?: string;
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
 * Resolves an image for a card ONLY if it genuinely came from the article's source blog/resource.
 * Never returns a random, stock, or fallback image. If no genuine image exists, returns null so a clean text card is rendered.
 */
function resolveUniqueCardImage(card: BriefingCard | null | undefined): string | null {
  if (!card) return null;
  if (card.is_real_image && card.image_url && card.image_url.trim().length > 0) {
    const url = card.image_url.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
  }
  return null;
}

// Curated Rotating Daily Themes for Becon Intelligence (automatically updates every single day)
const DAILY_BECON_THEMES = [
  "Strategic Business Intelligence & Industry Signals",
  "Accounting, Tax Compliance & Financial Analytics",
  "Retail Store Operations, POS & Inventory Systems",
  "Generative AI & Autonomous Workflow Automation",
  "Small Business Growth, Cash Flow & Marketing",
  "E-Commerce Trends, Logistics & Supply Chain",
  "Cloud Resilience & Digital Infrastructure",
  "Cybersecurity, Privacy & Regulatory Compliance",
  "Corporate Strategy, Banking & Fintech Trends",
  "Modern Software Systems & Tech Innovation"
];

function getDailyBeconHeading(interests?: string[], role?: string): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (interests && interests.length > 0) {
    const valid = interests.map((i) => i.trim()).filter(Boolean);
    if (valid.length > 0) {
      const topicStr = valid.slice(0, 2).join(" & ").toUpperCase();
      const ANGLES = [
        "Strategic Industry Signals & Market Dynamics",
        "Innovation, Consumer Trends & Revenue Drivers",
        "Emerging Standards, Operations & Growth",
        "Global Industry Dispatches & Tactical Intelligence",
        "Tactical Briefings & Competitive Landscape",
        "Market Intelligence & Executive Signals"
      ];
      return `${topicStr} // ${ANGLES[dayOfYear % ANGLES.length]}`;
    }
  }
  
  if (role && role.trim() && role.toLowerCase() !== "professional" && role.toLowerCase() !== "user") {
    return `${role.toUpperCase()} EXECUTIVE DISPATCH // ${DAILY_BECON_THEMES[dayOfYear % DAILY_BECON_THEMES.length]}`;
  }
  
  return DAILY_BECON_THEMES[dayOfYear % DAILY_BECON_THEMES.length];
}

export default function Home() {
  const { user, me, isAnonymous, signOut } = useAuth();
  const [dailyHeading, setDailyHeading] = useState<string>("Personalized Intelligence Gazette");
  const [briefings, setBriefings] = useState<BriefingCard[]>([]);
  const [drawerCard, setDrawerCard] = useState<BriefingCard | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingRemaining, setLoadingRemaining] = useState<boolean>(false);

  // Favorite Subject / Topic Search States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSearchTopic, setActiveSearchTopic] = useState<string>("");
  const [isSearchingTopic, setIsSearchingTopic] = useState<boolean>(false);
  const [searchedStories, setSearchedStories] = useState<BriefingCard[] | null>(null);
  const [searchError, setSearchError] = useState<string>("");
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("Professional");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { hideLoader } = useLoader();

  // First name extraction for top-bar profile button
  const userFirstName = userName && userName.trim() && userName.trim() !== "User"
    ? userName.trim().split(/\s+/)[0]
    : (userName && userName.trim() ? userName.trim() : "Profile");

  // Finite Search Pagination States (10 items, explicit button)
  const [searchOffset, setSearchOffset] = useState<number>(0);
  const [hasMoreSearch, setHasMoreSearch] = useState<boolean>(false);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState<boolean>(false);

  // Dynamic Reading Time Estimate across active cards (~200 words per minute)
  const readingTimeMinutes = useMemo(() => {
    const cardsToCount = searchedStories !== null ? searchedStories : briefings;
    if (!cardsToCount || cardsToCount.length === 0) return 1;
    let totalWords = 0;
    for (const card of cardsToCount) {
      totalWords += (card.title || "").split(/\s+/).filter(Boolean).length;
      if (card.card_content) {
        if (Array.isArray(card.card_content.what_happened)) {
          totalWords += card.card_content.what_happened.join(" ").split(/\s+/).filter(Boolean).length;
        }
        if (card.card_content.why_it_matters) {
          totalWords += card.card_content.why_it_matters.split(/\s+/).filter(Boolean).length;
        }
        if (card.card_content.how_it_affects_you) {
          totalWords += card.card_content.how_it_affects_you.split(/\s+/).filter(Boolean).length;
        }
        if (card.card_content.what_to_do_next?.guidance) {
          totalWords += card.card_content.what_to_do_next.guidance.split(/\s+/).filter(Boolean).length;
        }
      }
    }
    return Math.max(1, Math.ceil(totalWords / 200));
  }, [searchedStories, briefings]);

  // Smart Auto-Hide Header (Hide on scroll down, reveal on scroll up)
  const [headerVisible, setHeaderVisible] = useState<boolean>(true);
  const lastScrollYRef = useRef<number>(0);

  // Floating Back to Top Arrow Button State
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  // Dark / Light Mode Theme State from Global Context
  const { isDarkMode, toggleTheme } = useTheme();

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Edition Coverage Topics Scroll Controls
  const coverageScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);

  const checkCoverageScroll = useCallback(() => {
    const el = coverageScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  const scrollCoverage = (direction: "left" | "right") => {
    const el = coverageScrollRef.current;
    if (!el) return;
    const distance = 260;
    el.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = coverageScrollRef.current;
    if (!el) return;
    checkCoverageScroll();
    el.addEventListener("scroll", checkCoverageScroll, { passive: true });
    window.addEventListener("resize", checkCoverageScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", checkCoverageScroll);
      window.removeEventListener("resize", checkCoverageScroll);
    };
  }, [userInterests, checkCoverageScroll]);

  useEffect(() => {
    hideLoader();
    setDailyHeading(getDailyBeconHeading());
    const cachedName = localStorage.getItem("becon_user_name");
    if (cachedName) setUserName(cachedName);
    const cachedCards = localStorage.getItem(getBriefingsCacheKey(user?.id));
    if (cachedCards) {
      try {
        const parsed = JSON.parse(cachedCards);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBriefings(parsed);
          setLoading(false);
        }
      } catch {}
    }
  }, [hideLoader, user?.id]);

  const router = useRouter();

  // Topic AI Search Handlers (Finite: 10 items, explicit user-initiated "Show 10 more")
  const handleTopicSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearchingTopic(true);
    setActiveSearchTopic(query);
    setSearchError("");
    setSearchOffset(10);

    try {
      const params = new URLSearchParams({
        q: query,
        role: userRole,
        limit: "10",
        offset: "0",
      });
      const res = await apiFetch<{ query: string; matches: string[]; cards: BriefingCard[] }>(
        `/api/briefings/search?${params.toString()}`
      );
      const data = Array.isArray(res?.cards) ? res.cards : [];
      if (data.length > 0) {
        setSearchedStories(
          data.map((c) => ({
            ...c,
            rank: undefined,
          }))
        );
        setHasMoreSearch(data.length >= 10);
      } else {
        // Fallback keyword filter on current briefings
        const local = briefings.filter(
          (b) =>
            b.title.toLowerCase().includes(query.toLowerCase()) ||
            b.target_stack.some((s) => s.toLowerCase().includes(query.toLowerCase()))
        );
        setSearchedStories(local);
        setHasMoreSearch(false);
        if (local.length === 0) {
          setSearchError(`No live updates found for "${query}". Try another tech subject.`);
        }
      }
    } catch (err) {
      console.error("Error searching topic:", err);
      const local = briefings.filter(
        (b) =>
          b.title.toLowerCase().includes(query.toLowerCase()) ||
          b.target_stack.some((s) => s.toLowerCase().includes(query.toLowerCase()))
      );
      setSearchedStories(local);
      setHasMoreSearch(false);
    } finally {
      setIsSearchingTopic(false);
    }
  };

  const handleLoadMoreSearch = async () => {
    if (isLoadingMoreSearch || !activeSearchTopic) return;
    setIsLoadingMoreSearch(true);
    try {
      const params = new URLSearchParams({
        q: activeSearchTopic,
        role: userRole,
        limit: "10",
        offset: String(searchOffset),
      });
      const res = await apiFetch<{ query: string; matches: string[]; cards: BriefingCard[] }>(
        `/api/briefings/search?${params.toString()}`
      );
      const data = Array.isArray(res?.cards) ? res.cards : [];
      if (data.length > 0) {
        setSearchedStories((prev) => {
          const base = prev || [];
          const existingIds = new Set(base.map((c) => c.id));
          const newItems = data.filter((c) => !existingIds.has(c.id));
          return [...base, ...newItems];
        });
        setSearchOffset((prev) => prev + data.length);
        if (data.length < 10) {
          setHasMoreSearch(false);
        }
      } else {
        setHasMoreSearch(false);
      }
    } catch (err) {
      console.error("Error loading more search items:", err);
      setHasMoreSearch(false);
    } finally {
      setIsLoadingMoreSearch(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearchTopic("");
    setSearchedStories(null);
    setSearchError("");
    setSearchOffset(0);
    setHasMoreSearch(false);
  };

  // Scroll Listener for header auto-hide and back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollYRef.current;

      // Smart auto-hide header
      if (currentScrollY < 60) {
        setHeaderVisible(true);
      } else if (diff > 8) {
        // Scrolling down -> hide header
        setHeaderVisible(false);
        setShowProfileMenu(false);
      } else if (diff < -6) {
        // Scrolling up a little bit -> show header immediately
        setHeaderVisible(true);
      }
      lastScrollYRef.current = currentScrollY;

      // Reveal back to top arrow button when scrolled down
      setShowScrollTop(currentScrollY > 250);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

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
    if (!user) return;

    if (me && !me.has_completed_setup) {
      hideLoader();
      router.push("/profile?setup=true");
      return;
    }

    const fetchProfileAndBriefings = async () => {
      hideLoader();
      try {
        const profile = await apiFetch<any>("/api/profile");
        if (profile) {
          if (profile.name) {
            setUserName(profile.name);
            localStorage.setItem("becon_user_name", profile.name);
          } else if (profile.email) {
            const prefix = profile.email.split("@")[0];
            const clean = prefix.charAt(0).toUpperCase() + prefix.slice(1);
            setUserName(clean);
            localStorage.setItem("becon_user_name", clean);
          }
          if (profile.role) setUserRole(profile.role);
          if (profile.picture_url) {
            setUserAvatar(profile.picture_url);
            localStorage.setItem("becon_user_avatar", profile.picture_url);
          } else {
            const cached = localStorage.getItem("becon_user_avatar");
            if (cached) setUserAvatar(cached);
          }
          if (profile.auth_provider === "guest" || isAnonymous) {
            setIsGuest(true);
          }
          if (profile.interests) {
            const list = profile.interests.split(",").map((i: string) => i.trim()).filter(Boolean);
            setUserInterests(list);
            setDailyHeading(getDailyBeconHeading(list, profile.role));
          } else if (profile.role) {
            setDailyHeading(getDailyBeconHeading([], profile.role));
          }
          if (profile.customPrompt) {
            setCustomPrompt(profile.customPrompt);
          }

          // If a user has not configured their role or interests yet, redirect them to setup
          if ((!profile.interests || profile.interests.trim().length === 0) && (!profile.role || profile.role.trim().length === 0)) {
            hideLoader();
            router.push("/profile?setup=true");
            return;
          }

          // Fetch briefings strictly using this user's profile interests & role
          fetchAllBriefings(false, profile);
        }
      } catch (err) {
        console.error("Error fetching profile", err);
        fetchAllBriefings();
      }
    };
    
    fetchProfileAndBriefings();
  }, [user, me, isAnonymous, router]);

  const fetchAllBriefings = async (forceRefresh = false, profile: any = null) => {
    setLoading(true);
    setLoadingRemaining(false);
    hideLoader();
    const activeRole = profile?.role ?? userRole;
    const activeInterests = profile?.interests ?? (userInterests.length > 0 ? userInterests.join(", ") : "");
    const activePrompt = profile?.customPrompt ?? customPrompt;

    try {
      const baseParams = new URLSearchParams();
      if (activeRole) baseParams.set("role", activeRole);
      if (activeInterests) baseParams.set("interests", activeInterests);
      if (activePrompt) baseParams.set("custom_prompt", activePrompt);

      // STEP 1: FAST FETCH TOP 5 CARDS FIRST (<2s)
      const topParams = new URLSearchParams(baseParams);
      topParams.set("scope", "top");
      topParams.set("limit", "5");
      if (forceRefresh) topParams.set("refresh", "true");

      const topData = await apiFetch<BriefingCard[]>(`/api/briefings?${topParams.toString()}`);
      if (Array.isArray(topData) && topData.length > 0) {
        const mappedTop = topData.slice(0, 5).map((c, index) => ({
          ...c,
          rank: c.rank ?? index + 1,
        }));
        setBriefings(mappedTop);
        try {
          localStorage.setItem(getBriefingsCacheKey(user?.id), JSON.stringify(mappedTop));
        } catch {}
        // INSTANTLY REVEAL TOP SCREEN TO USER!
        setLoading(false);
        hideLoader();

        // STEP 2: SIMULTANEOUSLY LAZY-LOAD REMAINING CARDS FOR BENTO DECK (UP TO 5 MORE)
        setLoadingRemaining(true);
        const remParams = new URLSearchParams(baseParams);
        remParams.set("scope", "remaining");
        remParams.set("limit", "5");

        try {
          const remData = await apiFetch<BriefingCard[]>(`/api/briefings?${remParams.toString()}`);
          if (Array.isArray(remData) && remData.length > 0) {
            setBriefings((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const newCards = remData
                .filter((c) => !existingIds.has(c.id))
                .slice(0, BRIEFING_MAX_CARDS - prev.length)
                .map((c, idx) => ({
                  ...c,
                  rank: c.rank ?? prev.length + idx + 1,
                }));
              const full = [...prev, ...newCards].slice(0, BRIEFING_MAX_CARDS);
              try {
                localStorage.setItem(getBriefingsCacheKey(user?.id), JSON.stringify(full));
              } catch {}
              return full;
            });
          }
        } catch (remErr) {
          console.error("Error lazy-loading remaining briefings:", remErr);
        } finally {
          setLoadingRemaining(false);
        }
        return;
      }

      // Fallback if top fetch didn't return data (finite 10 cards)
      setBriefings(getBroadsheetCards(activeRole, activeInterests).slice(0, BRIEFING_MAX_CARDS));
    } catch (err) {
      console.log("API offline, displaying full high-density editorial broadsheet", err);
      setBriefings(getBroadsheetCards(activeRole, activeInterests).slice(0, BRIEFING_MAX_CARDS));
    } finally {
      setLoading(false);
      hideLoader();
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

  // Real image mapping for the Lead story: ONLY rendered if the article genuinely has an image
  const leadImageUrl = useMemo(() => {
    return resolveUniqueCardImage(leadStory);
  }, [leadStory]);

  // Real image mapping for all Bento deck stories:
  // ONLY render the genuine article image if it exists from the blog/resource, otherwise null
  const bentoCardImages = useMemo(() => {
    return displayedBentoStories.map((card) => resolveUniqueCardImage(card));
  }, [displayedBentoStories]);

  return (
    <RequireAuth>
      <div className="relative min-h-screen bg-[#FAF8F5] overflow-x-clip">
      {/* 1. TOP HEADER BAR (SMART AUTO-HIDE ON SCROLL DOWN, SLIDE DOWN ON SCROLL UP) */}
      <header
        className={`bg-slate-950 text-slate-200 py-2.5 sm:py-3 px-3 sm:px-6 border-b border-slate-800 shadow-md sticky top-0 z-50 transition-transform duration-300 ease-in-out ${
          headerVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/" className="hover:opacity-85 transition-opacity">
              <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                B E C O N
              </h1>
            </Link>
            <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden md:inline">
              THE DAILY INTELLIGENCE GAZETTE
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono relative">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] sm:text-xs hidden lg:inline">
              {todayDate}
            </span>
            <span className="text-amber-300 dark:text-amber-400 font-bold hidden sm:inline border-l border-slate-700 pl-3 tracking-wider uppercase text-[11px]">
              {briefings.length} updates, ~{readingTimeMinutes} min read
            </span>

            {/* PROFILE MENU CONTAINER */}
            <div ref={profileMenuRef} className="relative">
              {/* PROFILE BUTTON */}
              <button
                type="button"
                aria-label="Profile Menu"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="group flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-500 text-white pl-1.5 pr-3 py-1 sm:pl-2 sm:pr-3.5 sm:py-1.5 rounded-full transition-all shadow-xs hover:shadow-md cursor-pointer select-none"
              >
                <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-xs ring-1 ring-white/10 shrink-0 overflow-hidden">
                  {userAvatar ? (
                    <img src={userAvatar} alt={userFirstName} className="w-full h-full object-cover rounded-full" onError={() => setUserAvatar("")} />
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                </div>
                <span className="font-semibold text-xs sm:text-[13px] text-slate-200 tracking-tight hidden sm:inline font-sans">
                  {userFirstName}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ease-in-out shrink-0 ${
                    showProfileMenu ? "rotate-180 text-amber-400 group-hover:text-amber-400" : ""
                  }`}
                />
              </button>

              {/* PROFILE DROPDOWN MENU (CLASSIC & MINIMALIST) */}
              {showProfileMenu && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/50 rounded-xl p-1.5 z-50 text-slate-800 dark:text-slate-200 font-sans animate-in fade-in zoom-in-95 duration-100 select-none">
                  {/* USER INFO HEADER */}
                  <div className="px-3 py-2.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 border border-slate-700/50 font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} alt={userName} className="w-full h-full object-cover rounded-full" onError={() => setUserAvatar("")} />
                      ) : (
                        <span>{userFirstName && userFirstName[0] ? userFirstName[0].toUpperCase() : "U"}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs truncate flex items-center gap-1.5">
                        <span className="truncate">{userName || "Reader"}</span>
                        {isGuest && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-400/15 text-amber-600 dark:text-amber-400 border border-amber-400/30 uppercase font-bold tracking-wide">
                            Guest
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {userRole || "Member"}
                      </div>
                    </div>
                  </div>

                  {/* DIVIDER */}
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                  {/* MENU ITEMS */}
                  <div className="space-y-0.5">
                    {isGuest && (
                      <Link
                        href="/login"
                        onClick={() => setShowProfileMenu(false)}
                        className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                      >
                        <LogIn className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Sign In / Create Account</span>
                      </Link>
                    )}

                    <Link
                      href="/profile"
                      onClick={() => setShowProfileMenu(false)}
                      className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <User className="w-4 h-4 text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
                      <span>Profile & Settings</span>
                    </Link>

                    <Link
                      href="/about"
                      onClick={() => setShowProfileMenu(false)}
                      className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
                      <span>About Becon</span>
                    </Link>
                  </div>

                  {/* DIVIDER */}
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                  {/* LOGOUT */}
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut();
                      router.push("/login");
                    }}
                    className="group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                    <span>{isGuest || isAnonymous ? "Exit Guest Mode" : "Logout"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* GUEST BANNER */}
      <GuestBanner />

      {/* 2. EDITION INDEX RIBBON (ALL SIGNALS IN ONE VIEW WITH PREV/NEXT CONTROLS & THEME SWITCHER) */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-1.5 sm:py-2 shadow-2xs transition-colors duration-200">
        <div className="max-w-[1600px] mx-auto flex items-center gap-1.5 sm:gap-3 font-mono text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {/* Label */}
          <div className="flex items-center gap-1 text-slate-900 dark:text-slate-100 font-black shrink-0 pr-1.5 sm:pr-2 border-r border-slate-200 dark:border-slate-800 select-none">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900 dark:text-amber-400" />
            <span className="hidden sm:inline">COVERAGE:</span>
          </div>

          {/* Previous Button */}
          <button
            type="button"
            onClick={() => scrollCoverage("left")}
            disabled={!canScrollLeft}
            aria-label="Previous topics"
            title="Scroll topics left"
            className="shrink-0 p-1 sm:p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-slate-50 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Topics Container with Hidden Scrollbar & Touch Panning */}
          <div
            ref={coverageScrollRef}
            className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5 touch-pan-x"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {userInterests.length > 0 ? (
              userInterests.map((interest) => (
                <span
                  key={interest}
                  className="bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 font-bold px-2.5 py-0.5 rounded shrink-0 shadow-2xs select-none"
                >
                  ✓ {interest.toUpperCase()}
                </span>
              ))
            ) : (
              <>
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                  SYSTEM ARCHITECTURE
                </span>
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                  CLOUD & AZURE
                </span>
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                  GENERATIVE AI
                </span>
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 px-2.5 py-0.5 rounded text-slate-800 dark:text-slate-200 shrink-0 select-none">
                  SECURITY & DEVOPS
                </span>
              </>
            )}
          </div>

          {/* Next Button */}
          <button
            type="button"
            onClick={() => scrollCoverage("right")}
            disabled={!canScrollRight}
            aria-label="Next topics"
            title="Scroll topics right"
            className="shrink-0 p-1 sm:p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-slate-50 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Subtle Vertical Divider */}
          <div className="h-4 sm:h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0 mx-0.5 sm:mx-1"></div>

          {/* Theme Switch Toggle (On Sub-header Rightmost Position) */}
          <button
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            onClick={toggleTheme}
            aria-label={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="relative inline-flex items-center h-6 w-11 sm:h-7 sm:w-14 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-300 ease-in-out focus:outline-none select-none bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-inner group"
          >
            {/* Left Track Icon (Sun) */}
            <span className="absolute left-1 sm:left-1.5 flex items-center justify-center pointer-events-none text-amber-500/70 dark:text-slate-600">
              <Sun className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </span>

            {/* Right Track Icon (Moon) */}
            <span className="absolute right-1 sm:right-1.5 flex items-center justify-center pointer-events-none text-slate-400 dark:text-amber-300/70">
              <Moon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </span>

            {/* Sliding Knob */}
            <span
              className={`relative z-10 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full shadow-md transition-transform duration-300 ease-in-out ${
                isDarkMode
                  ? "translate-x-5 sm:translate-x-7 bg-slate-800 border border-slate-600 text-amber-300"
                  : "translate-x-0 bg-white border border-slate-200 text-amber-500"
              }`}
            >
              {isDarkMode ? (
                <Moon className="w-3.5 h-3.5 fill-amber-300 text-amber-300 transition-transform duration-200 group-hover:rotate-12" />
              ) : (
                <Sun className="w-3.5 h-3.5 fill-amber-500 text-amber-500 transition-transform duration-200 group-hover:rotate-45" />
              )}
            </span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA (FINITE BRIEFING, NO PAGE LIFT) */}
      <div className="relative z-10 min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans selection:bg-slate-900 selection:text-white pb-16 transition-colors duration-200">
      {/* 3. MULTI-COLUMN HIGH-DENSITY BROADSHEET WITH TOP SHOWCASE & FULL-WIDTH BENTO GRID */}
      <main className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        <div className="space-y-6 sm:space-y-8">
          
          {/* TOP BALANCED SHOWCASE: #1 CRITICAL UPDATE (LEFT) + THE QUICK WIRE (RIGHT) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 items-stretch pb-8 sm:pb-10 border-b-2 border-slate-900 dark:border-slate-800">
            
            {/* TOP MOST IMPORTANT UPDATE (LEFT 5 COLS) */}
            <div className="lg:col-span-5 flex flex-col h-full">
              <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-slate-800 pb-2 mb-3 font-mono">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-black tracking-wider uppercase bg-rose-600 text-white shadow-xs">
                  <Flame className="w-3.5 h-3.5" /> #1 CRITICAL UPDATE
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase font-mono">
                  • TOP SIGNAL
                </span>
              </div>
              <div className="flex-1 flex flex-col">
                {loading || !leadStory ? (
                  renderLeadSkeleton()
                ) : (
                  <LeadCard
                    card={leadStory}
                    leadImageUrl={leadImageUrl}
                    onOpenDrawer={setDrawerCard}
                    renderStackTag={renderStackTag}
                  />
                )}
              </div>
            </div>

            {/* DAILY DISPATCHES / QUICK WIRE (RIGHT 7 COLS) */}
            <div className="lg:col-span-7 flex flex-col h-full">
              <div className="flex flex-col h-full flex-1">
                <div className="border-b-2 border-slate-900 dark:border-slate-800 pb-2 mb-3 flex items-center justify-between font-mono">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-slate-950 dark:text-slate-100 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-rose-500" /> THE QUICK WIRE • RAPID SIGNALS
                  </span>
                  <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded uppercase">
                    DISPATCHES
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 gap-3.5 flex-1">
                  {loading || topWireStories.length === 0
                    ? [2, 3, 4, 5].map((rank) => renderBriefSkeleton(rank))
                    : topWireStories.map((card, idx) => (
                        <BriefCard
                          key={card.id}
                          card={card}
                          rankNumber={idx < 4 ? idx + 2 : undefined}
                          onOpenDrawer={setDrawerCard}
                          renderStackTag={renderStackTag}
                        />
                      ))}
                </div>
              </div>
            </div>

          </div>

            {/* FULL-WIDTH BENTO EDITORIAL DECK: ARCHITECTURE & DEEP TAKES */}
            <section className="flex flex-col space-y-5 sm:space-y-6 pb-12 pt-2">
              <div
                className={`sticky z-30 bg-[#FAF8F5] dark:bg-[#070b12] border-b-2 border-slate-900 dark:border-slate-800 transition-all duration-300 ease-in-out -mx-3 sm:-mx-6 px-3 sm:px-6 ${
                  headerVisible ? "top-[50px] sm:top-[57px] shadow-xs" : "top-0 shadow-md"
                }`}
              >
                <div className="max-w-[1600px] mx-auto py-2 sm:py-3 flex flex-wrap items-center justify-between font-mono gap-2 sm:gap-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 truncate max-w-[200px] sm:max-w-none">
                    <span className="font-serif font-black tracking-widest text-sm sm:text-base text-slate-950 dark:text-white">
                      BECON
                    </span>
                    <span className="text-slate-400 font-mono font-bold">{"//"}</span>
                    <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs sm:text-[13px] tracking-wide truncate">
                      {dailyHeading}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 shrink-0 hidden md:inline">
                      {briefings.length} updates • ~{readingTimeMinutes} min read
                    </span>
                  </div>

                  {/* FAVORITE SUBJECT SEARCH FIELD (RESPONSIVE FULL-WIDTH ON MOBILE, FLEXIBLE ON DESKTOP) */}
                  <form
                    onSubmit={handleTopicSearch}
                    className="w-full sm:flex-1 sm:max-w-sm md:max-w-md relative flex items-center min-w-0 order-3 sm:order-none mt-1 sm:mt-0"
                  >
                    <div className="relative w-full flex items-center">
                      <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-3 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search topic (e.g. AI, Retail, Tax, Cloud)..."
                        className="w-full pl-8 pr-20 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-amber-400 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-amber-400 transition-all shadow-2xs"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={handleClearSearch}
                          className="absolute right-[66px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 text-xs font-bold cursor-pointer top-1/2 -translate-y-1/2"
                          title="Clear"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSearchingTopic || !searchQuery.trim()}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-[22px] px-2 rounded bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 text-[10px] font-black uppercase font-mono tracking-wider transition-all disabled:bg-slate-800 disabled:text-amber-300/80 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1 shadow-2xs border border-slate-700"
                      >
                        {isSearchingTopic ? (
                          <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                        ) : (
                          <span>Search</span>
                        )}
                      </button>
                    </div>
                  </form>

                  <div className="flex items-center gap-2 shrink-0">
                    {loadingRemaining ? (
                      <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                        <span className="hidden sm:inline">AI SYNTHESIZING REMAINING TAKES...</span>
                        <span className="sm:hidden">SYNTHESIZING...</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-bold hidden xl:inline">
                        FULL BROADSHEET DENSITY • ALL COLUMNS UNIFIED
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTIVE SUBJECT SEARCH STATUS BAR */}
              {activeSearchTopic && (
                <div className="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-2xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-bold">
                    <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      AI Synthesized News for: <strong className="text-slate-950 dark:text-amber-100 underline underline-offset-2">&quot;{activeSearchTopic}&quot;</strong>
                    </span>
                    {searchedStories && (
                      <span className="text-[10px] bg-amber-200/90 dark:bg-amber-900 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded font-black">
                        {searchedStories.length} UPDATES
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="flex items-center gap-1.5 text-[11px] font-black text-rose-700 dark:text-rose-300 hover:text-rose-950 dark:hover:text-rose-100 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-3 py-1 rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    <X className="w-3 h-3" />
                    <span>Reset Bento Feed</span>
                  </button>
                </div>
              )}

              {/* SEARCH ERROR NOTIFICATION */}
              {searchError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 font-mono text-xs flex items-center justify-between">
                  <span>{searchError}</span>
                  <button onClick={handleClearSearch} className="font-bold underline cursor-pointer">
                    Clear Search
                  </button>
                </div>
              )}

              {/* FULL-WIDTH DYNAMIC BENTO GRID (GAPLESS GUARANTEE, SPANS ENTIRE WIDTH) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {isSearchingTopic ? (
                  <>
                    <div className="col-span-1 md:col-span-2 xl:col-span-3 min-h-[160px] rounded-2xl bg-gradient-to-t from-slate-950 via-[#0a1120] to-[#0f172a] border-2 border-amber-400/80 flex flex-col items-center justify-center p-6 text-center select-none shadow-[inset_0_10px_30px_rgba(0,0,0,0.85)] space-y-2">
                      <div className="relative w-10 h-10 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/News-Loader.gif"
                          alt="Loading..."
                          className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_15px_rgba(251,191,36,0.45)]"
                          style={{ filter: "brightness(0) invert(1)" }}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                        <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-300">
                          DISPATCHING AI NEWS FOR: {activeSearchTopic ? activeSearchTopic.toUpperCase() : searchQuery.toUpperCase()}
                        </span>
                      </div>

                      <p className="font-mono text-[11px] text-slate-300 max-w-lg line-clamp-1">
                        Querying live multi-domain feeds & running AI synthesis…
                      </p>
                    </div>
                    {[2, 1, 1, 2, 3].map((span, idx) =>
                      renderBentoSkeletonCard(span, idx)
                    )}
                  </>
                ) : displayedBentoStories.length > 0 ? (
                  <>
                    {(() => {
                      const bentoSpans = computeBentoSpans(displayedBentoStories.length);
                      return displayedBentoStories.map((card, idx) => {
                        const span = bentoSpans[idx] ?? 1;
                        const resolvedImg = bentoCardImages[idx] ?? null;
                        const showImageOnCard = Boolean(resolvedImg);

                        if (span === 1) {
                          return (
                            <SquareCard
                              key={card.id}
                              card={card}
                              showImage={showImageOnCard}
                              resolvedImageUrl={resolvedImg}
                              onOpenDrawer={setDrawerCard}
                              renderStackTag={renderStackTag}
                            />
                          );
                        }
                        const isFullWidth = span === 3;
                        return (
                          <RectangleCard
                            key={card.id}
                            card={card}
                            showImage={showImageOnCard}
                            isFullWidth={isFullWidth}
                            resolvedImageUrl={resolvedImg}
                            onOpenDrawer={setDrawerCard}
                            renderStackTag={renderStackTag}
                          />
                        );
                      });
                    })()}
                    {loadingRemaining && (
                      <>
                        {[2, 1, 1].map((span, idx) =>
                          renderBentoSkeletonCard(span, idx + 10)
                        )}
                      </>
                    )}
                  </>
                ) : loading ? (
                  <>
                    {[2, 1, 1, 2, 3].map((span, idx) =>
                      renderBentoSkeletonCard(span, idx)
                    )}
                  </>
                ) : searchedStories !== null ? (
                  <div className="col-span-1 md:col-span-2 xl:col-span-3 p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-center font-mono space-y-3 shadow-xs">
                    <p className="text-slate-900 dark:text-slate-100 font-bold text-sm">
                      No live news articles found for &quot;{activeSearchTopic}&quot;.
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs">
                      Try searching another technology keyword (e.g. Docker, Kubernetes, PostgreSQL, Rust, Go).
                    </p>
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="px-4 py-2 rounded-lg bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 text-xs font-bold font-mono transition-colors cursor-pointer border border-slate-700"
                    >
                      Reset to Curated Bento Deck
                    </button>
                  </div>
                ) : loadingRemaining ? (
                  <>
                    {[2, 1, 1, 2, 3].map((span, idx) =>
                      renderBentoSkeletonCard(span, idx)
                    )}
                  </>
                ) : null}
              </div>
            </section>

          </div>

        {/* 4. FINITE BRIEFING END STATE: ALL CAUGHT UP PANEL */}
        {searchedStories === null ? (
          <section
            data-testid="all-caught-up-panel"
            className="max-w-[1600px] mx-auto px-3 sm:px-6 mt-12 pt-8 border-t-2 border-slate-300 dark:border-slate-800"
          >
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 sm:p-8 md:p-10 shadow-xs flex flex-col items-center text-center max-w-2xl mx-auto">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <h3 className="text-xl sm:text-2xl font-black font-serif text-slate-950 dark:text-slate-50 tracking-tight mb-2">
                You&apos;re all caught up for today
              </h3>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-sans leading-relaxed mb-6 max-w-md">
                You&apos;ve completed all intelligence updates for today. Next daily edition arrives tomorrow.
              </p>

              {/* Briefing Stats Pill */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 mb-6">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {briefings.length} of {briefings.length} updates completed
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>~{readingTimeMinutes} min read</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>{todayDate}</span>
              </div>

              {/* Link to adjust preferences */}
              <Link
                href="/profile"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 underline underline-offset-4 transition-colors"
              >
                <span>Adjust your topics &amp; preferences</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        ) : (
          /* FINITE TOPIC SEARCH RESULTS PAGINATION */
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 mt-8 flex flex-col items-center">
            {hasMoreSearch ? (
              <button
                type="button"
                onClick={handleLoadMoreSearch}
                disabled={isLoadingMoreSearch}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 font-mono text-xs font-bold transition-all shadow-xs cursor-pointer border border-slate-700"
              >
                {isLoadingMoreSearch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading 10 more results...</span>
                  </>
                ) : (
                  <span>Show 10 more results</span>
                )}
              </button>
            ) : (
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 py-4 text-center">
                End of search results for &ldquo;{activeSearchTopic}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* EDITORIAL FOOTER */}
        <footer className="max-w-[1600px] mx-auto px-3 sm:px-6 mt-16 pt-8 pb-12 border-t border-slate-300 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 dark:text-slate-400 font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-serif font-black tracking-wider uppercase text-sm">
            <span>BECON INTELLIGENCE GAZETTE</span>
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] font-normal hidden sm:inline">• Not News. Updates You Can Act On.</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-bold">
            <Link href="/about" className="hover:text-slate-900 dark:hover:text-amber-300 transition-colors">
              About & Manifesto
            </Link>
            <Link href="/onboarding" className="hover:text-slate-900 dark:hover:text-amber-300 transition-colors">
              AI Onboarding
            </Link>
            <Link href="/profile" className="hover:text-slate-900 dark:hover:text-amber-300 transition-colors">
              Stack Settings
            </Link>
          </div>
        </footer>
      </main>
      </div>

      {/* FLOATING BACK TO TOP ARROW BUTTON */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          title="Back to top"
          className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 w-10 h-10 rounded-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-2 border-slate-900 dark:border-slate-600 shadow-lg dark:shadow-2xl dark:shadow-black/70 flex items-center justify-center group cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:hover:border-amber-400 dark:hover:shadow-[0_0_20px_rgba(251,191,36,0.3)] active:translate-y-0 active:scale-95 animate-in fade-in zoom-in-90 select-none"
        >
          <ArrowUp className="w-4 h-4 text-slate-900 dark:text-amber-300 group-hover:text-amber-500 dark:group-hover:text-amber-200 transition-all duration-200 group-hover:-translate-y-0.5" />
          <span className="sr-only">Back to top</span>
        </button>
      )}

      {/* CARD DETAIL DRAWER */}
      <CardDrawer
        card={drawerCard}
        isOpen={Boolean(drawerCard)}
        onClose={() => setDrawerCard(null)}
      />
      </div>
    </RequireAuth>
  );
}


/* CLASSIC EDITORIAL STACK / TOPIC TAG RENDERER */
function renderStackTag(tag: string) {
  const cleanTag = tag.replace(/^#/, "").trim();
  return (
    <span
      key={tag}
      className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs select-none hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
    >
      <span className="text-slate-400 dark:text-slate-500 font-mono text-[9px] font-bold">/</span>
      <span className="truncate">{cleanTag}</span>
    </span>
  );
}

/* SKELETON RENDERER 1: #1 CRITICAL LEAD STORY SKELETON CARD */
function renderLeadSkeleton() {
  return (
    <article className="rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-800 p-4 sm:p-5 md:p-6 shadow-sm dark:shadow-slate-950/50 flex flex-col justify-between h-full select-none">
      <div>
        {/* Top Badges & Inner Loader Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-rose-600 text-white uppercase tracking-wider shadow-xs">
              LEAD // 01
            </span>
            <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse"></div>
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse"></div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>AI SYNTHESIZING...</span>
          </div>
        </div>

        {/* Headline Skeleton */}
        <div className="space-y-2 mb-3.5">
          <div className="h-6 sm:h-7 bg-slate-200 dark:bg-slate-800 rounded-md w-11/12 animate-pulse"></div>
          <div className="h-6 sm:h-7 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4 animate-pulse"></div>
        </div>

        {/* Hero Image Skeleton Box */}
        <div className="relative w-full h-36 sm:h-44 rounded-lg my-3 border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 flex flex-col items-center justify-center overflow-hidden gap-2">
          <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/News-Loader.gif"
              alt="Loading..."
              className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[10px] sm:text-[11px] font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
            <span>Synthesizing Lead Intelligence</span>
          </div>
        </div>

        {/* Key Article Highlights Skeleton */}
        <div className="mb-4 p-3.5 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-extrabold text-slate-500 dark:text-slate-400">
            <Pin className="w-3.5 h-3.5 text-rose-500" />
            <span>ARTICLE HIGHLIGHTS:</span>
          </div>
          <div className="space-y-2 pl-1">
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div>
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-11/12 animate-pulse"></div>
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Footer Skeleton */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 mt-auto">
        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
        <div className="h-7 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
      </div>
    </article>
  );
}

/* SKELETON RENDERER 2: QUICK WIRE SKELETON CARD (RIGHT 7 COLS) */
function renderBriefSkeleton(rankNumber: number) {
  return (
    <article
      key={`brief-skel-${rankNumber}`}
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between h-full select-none"
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-amber-300 border border-slate-800 dark:border-slate-700">
              #{String(rankNumber).padStart(2, "0")}
            </span>
            <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <div className="w-3 h-3 relative flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/News-Loader.gif"
                alt="Loading..."
                className="w-full h-full object-contain brightness-0 invert"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <span>PARSING</span>
          </div>
        </div>

        {/* Headline Skeleton */}
        <div className="space-y-1.5 mb-2.5">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse"></div>
        </div>

        {/* Center Loader Box with News-Loader.gif */}
        <div className="relative w-full h-20 sm:h-24 md:h-28 rounded-lg my-2.5 border border-slate-200/90 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/60 flex flex-col items-center justify-center overflow-hidden gap-1.5 shadow-2xs">
          <div className="relative w-8 h-8 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/News-Loader.gif"
              alt="Loading..."
              className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[9.5px] font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
            <span>Dispatch #{String(rankNumber).padStart(2, "0")}</span>
          </div>
        </div>

        {/* Impact Snippet Skeleton */}
        <div className="pt-2 border-t border-dashed border-slate-100 dark:border-slate-800 space-y-1">
          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse"></div>
        </div>
      </div>

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-auto">
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
      </div>
    </article>
  );
}

/* SKELETON RENDERER 3: BENTO DECK SKELETON CARD (FULL WIDTH BENTO GRID) */
function renderBentoSkeletonCard(span: number, keyIndex: number) {
  const isWide = span >= 2;
  return (
    <article
      key={`bento-skel-${keyIndex}`}
      className={`${
        span === 3
          ? "col-span-1 md:col-span-2 xl:col-span-3"
          : isWide
          ? "col-span-1 md:col-span-2 xl:col-span-2"
          : "col-span-1"
      } rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 md:p-6 shadow-xs flex flex-col justify-between select-none min-h-[190px] sm:min-h-[220px]`}
    >
      <div>
        {/* Top Tag & Action */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
            <div className="h-4 w-14 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <div className="w-3 h-3 relative flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/News-Loader.gif"
                alt="Loading..."
                className="w-full h-full object-contain brightness-0 invert"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
            <span>AI SYNTHESIZING</span>
          </div>
        </div>

        {/* Content Body */}
        {isWide ? (
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
            <div className="w-full sm:w-48 h-32 sm:h-36 rounded-lg bg-slate-100 dark:bg-slate-800/80 shrink-0 flex flex-col items-center justify-center border border-slate-200 dark:border-slate-800 gap-1.5">
              <div className="relative w-8 h-8 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/News-Loader.gif"
                  alt="Loading..."
                  className="w-full h-full object-contain brightness-0 invert drop-shadow-sm"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </div>
              <span className="text-[9.5px] font-mono font-bold text-amber-500 uppercase tracking-wider">AI Thinking</span>
            </div>
            <div className="flex-1 w-full space-y-2">
              <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-11/12 animate-pulse"></div>
              <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4 animate-pulse"></div>
              <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-full mt-2 animate-pulse"></div>
              <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-5/6 animate-pulse"></div>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="h-4 sm:h-5 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div>
            <div className="h-4 sm:h-5 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse"></div>

            {/* Center Loader Box for square bento card */}
            <div className="relative w-full h-24 sm:h-28 rounded-lg my-2 border border-slate-200/90 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/60 flex flex-col items-center justify-center overflow-hidden gap-1.5 shadow-2xs">
              <div className="relative w-8 h-8 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/News-Loader.gif"
                  alt="Loading..."
                  className="w-full h-full object-contain brightness-0 invert drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </div>
              <span className="text-[9.5px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Synthesizing Story</span>
            </div>

            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6 animate-pulse"></div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end mt-4">
        <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
      </div>
    </article>
  );
}





/* TOPIC CLASSIFIER FOR EDITORIAL CARDS */
function detectTopicCategory(interests: string, role: string): "beauty_fashion" | "accounting_tax" | "retail_store" | "business_growth" | "tech_software" | "general" {
  const combined = (interests + " " + role).toLowerCase();
  if (
    combined.includes("beauty") ||
    combined.includes("fashion") ||
    combined.includes("cosmetic") ||
    combined.includes("style") ||
    combined.includes("skincare") ||
    combined.includes("hair") ||
    combined.includes("apparel") ||
    combined.includes("makeup")
  ) {
    return "beauty_fashion";
  }
  if (
    combined.includes("tax") ||
    combined.includes("account") ||
    combined.includes("audit") ||
    combined.includes("gst") ||
    combined.includes("bookkeep") ||
    combined.includes("ledger") ||
    combined.includes("finance")
  ) {
    return "accounting_tax";
  }
  if (
    combined.includes("retail") ||
    combined.includes("shop") ||
    combined.includes("pos") ||
    combined.includes("inventory") ||
    combined.includes("store")
  ) {
    return "retail_store";
  }
  if (
    combined.includes("small business") ||
    combined.includes("e-commerce") ||
    combined.includes("ecommerce") ||
    combined.includes("marketing") ||
    combined.includes("sales")
  ) {
    return "business_growth";
  }
  if (
    combined.includes("software") ||
    combined.includes("developer") ||
    combined.includes("react") ||
    combined.includes("angular") ||
    combined.includes(".net") ||
    combined.includes("python") ||
    combined.includes("rust") ||
    combined.includes("cloud") ||
    combined.includes("kubernetes") ||
    combined.includes("devops") ||
    combined.includes("database")
  ) {
    return "tech_software";
  }
  return "general";
}

function getBeautyFashionBroadsheetCards(role: string): BriefingCard[] {
  const cards: BriefingCard[] = [
    {
      id: "bf-lead-1",
      title: "Clean Formulations & Global Regulatory Shifts: EU & FDA Cosmetics Compliance Standards",
      source_url: "https://wwd.com",
      image_url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Beauty Executive",
      target_stack: ["Beauty & Cosmetics", "Regulations"],
      priority: "lead",
      card_content: {
        what_happened: [
          "New regulatory directives mandating total trace-ingredient transparency and microplastic bans take full effect across premium cosmetic lines.",
          "Independent safety review boards now require third-party clinical backing for anti-aging and barrier-repair marketing claims."
        ],
        why_it_matters: "Formulation cycles and packaging supply chains must be audited immediately to prevent retail distribution delays and costly product recalls.",
        how_it_affects_you: "Product merchandising, vendor ingredient certifications, and packaging compliance must be validated before signing upcoming wholesale purchase orders.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Audit supplier ingredient safety sheets (MSDS) and ensure upcoming product runs comply with clean beauty retail standards."
        }
      }
    },
    {
      id: "bf-major-1",
      title: "Fall/Winter Capsule Runway Signals: Tailored Minimalist Silhouettes & Sustainable Wool",
      source_url: "https://vogue.com",
      image_url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Fashion Buyer",
      target_stack: ["Fashion & Style", "Apparel Trends"],
      priority: "major",
      card_content: {
        what_happened: [
          "Milan and Paris runway reports confirm a strategic shift away from ephemeral fast-fashion toward durable, high-ticket heritage wardrobe essentials.",
          "Double-faced wools, structured trench cuts, and earthen neutral palettes dominate commercial buyer orders."
        ],
        why_it_matters: "Signals strong consumer willingness to invest in durable premium garments over high-turnover synthetic apparel.",
        how_it_affects_you: "Retail inventory planning should prioritize versatile outerwear and structured tailoring with proven season-over-season sell-through.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Shift autumn open-to-buy budget allocations toward timeless structured silhouettes and verified natural fibers."
        }
      }
    },
    {
      id: "bf-major-2",
      title: "Omnichannel DTC Retailing: Augmented Reality Virtual Try-On Reduces Returns by 35%",
      source_url: "https://cosmeticsbusiness.com",
      image_url: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Retail Director",
      target_stack: ["Beauty Tech", "Retail POS"],
      priority: "major",
      card_content: {
        what_happened: [
          "Mobile camera shade-matching algorithms achieve 94% color match accuracy in live foundation and lip cosmetic trials.",
          "Beauty brands deploying real-time virtual try-ons record a 35% reduction in return shipping costs and higher average order values."
        ],
        why_it_matters: "Excessive product return rates represent the largest profit margin drain in direct-to-consumer cosmetic e-commerce.",
        how_it_affects_you: "Integrating interactive shade-matching widgets on your storefront directly improves customer conversion and customer satisfaction.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Evaluate browser-based AR virtual try-on software plugins to integrate onto your digital product catalog."
        }
      }
    },
    {
      id: "bf-major-3",
      title: "Supply Chain Resiliency in Luxury Perfumery: Synthetic Bio-Botanicals Replace Rare Crops",
      source_url: "https://perfumerflavorist.com",
      image_url: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Product Developer",
      target_stack: ["Cosmetics & Fragrance", "Supply Chain"],
      priority: "major",
      card_content: {
        what_happened: [
          "Biotechnology labs scale fermentation-derived sandalwood, ambergris, and jasmine scents with 100% batch consistency.",
          "Luxury fragrance houses report zero variance in scent longevity while removing exposure to climate-induced harvest failures."
        ],
        why_it_matters: "Protects high-margin perfume product lines from sudden raw ingredient shortages and volatile international agricultural tariffs.",
        how_it_affects_you: "Formulation teams can stabilize manufacturing cost-of-goods-sold (COGS) without sacrificing premium aromatic notes.",
        what_to_do_next: {
          action_type: "learn",
          guidance: "Review bio-identical fragrance compounds to protect seasonal fragrance releases from crop volatility."
        }
      }
    },
    {
      id: "bf-major-4",
      title: "Micro-Creator Social Commerce: TikTok Shop & Instagram Live Outperform Traditional Search",
      source_url: "https://businessoffashion.com",
      image_url: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Brand Marketer",
      target_stack: ["Fashion Marketing", "Social Selling"],
      priority: "major",
      card_content: {
        what_happened: [
          "Boutique apparel and beauty labels generate 4x higher checkout conversion through niche creator livestream hauls than standard paid search ads.",
          "Integrated social checkout carts drastically shorten the path from initial product discovery to completed transaction."
        ],
        why_it_matters: "Rising customer acquisition costs (CAC) on legacy ad platforms make direct social creator affiliate pipelines essential for brand discovery.",
        how_it_affects_you: "Brands must establish automated creator sample seeding and affiliate revenue-sharing agreements to maintain customer acquisition momentum.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Launch an affiliate seeding campaign targeting 20-50 niche beauty and style creators with dedicated discount codes."
        }
      }
    },
    {
      id: "bf-brief-1",
      title: "Sustainable Waterless Dyeing Scales in Commercial Textile Mills",
      source_url: "https://textileworld.com",
      target_role: role || "Production Manager",
      target_stack: ["Sustainable Fashion", "Manufacturing"],
      priority: "brief",
      card_content: {
        what_happened: ["Supercritical CO2 and ozone dyeing technologies scale across major apparel manufacturing hubs, reducing wastewater discharge by 90%."],
        why_it_matters: "Helps fashion retailers satisfy strict environmental compliance standards and appeal to ESG-conscious retail consumers.",
        how_it_affects_you: "Retailers can market eco-certified fabric collections with defensible sustainability claims.",
        what_to_do_next: { action_type: "apply", guidance: "Request certified waterless dye documentation from tier-1 textile suppliers." }
      }
    },
    {
      id: "bf-brief-2",
      title: "Dermatological Skincare: Multi-Molecular Peptide Delivery Systems",
      source_url: "https://instyle.com",
      target_role: role || "Beauty Specialist",
      target_stack: ["Skincare & Wellness", "Beauty Trends"],
      priority: "brief",
      card_content: {
        what_happened: ["Clinical formulations combine low-molecular copper peptides with lipid carrier spheres to optimize dermal absorption."],
        why_it_matters: "Consumer demand continues to shift from surface moisturizers toward clinically backed cellular restoration serums.",
        how_it_affects_you: "Highlighting specific active percentages on product packaging drives higher conversion among educated skincare shoppers.",
        what_to_do_next: { action_type: "learn", guidance: "Stock peptide-focused skincare treatments in prime merchandising zones." }
      }
    },
    {
      id: "bf-brief-3",
      title: "Seasonal Color Palette Direction: Terracotta, Butter Yellow & Olive",
      source_url: "https://wwd.com",
      target_role: role || "Merchandiser",
      target_stack: ["Fashion & Style", "Trend Forecasting"],
      priority: "brief",
      card_content: {
        what_happened: ["Global trend forecasting agencies confirm warm earthy tones and soft butter yellow as dominant color accents for the upcoming season."],
        why_it_matters: "Aligning merchandising buys with forecasted colorways ensures visual cohesion across storefront window displays.",
        how_it_affects_you: "Product assortments featuring these core palettes experience higher impulse add-to-cart rates.",
        what_to_do_next: { action_type: "apply", guidance: "Update seasonal visual merchandising displays and email campaign imagery with these shades." }
      }
    },
    {
      id: "bf-brief-4",
      title: "Circular Luxury Consignment & Authentication Protocols",
      source_url: "https://forbes.com",
      target_role: role || "Retail Executive",
      target_stack: ["Luxury Fashion", "E-Commerce"],
      priority: "brief",
      card_content: {
        what_happened: ["Pre-owned luxury fashion resale platforms report 28% year-over-year transaction growth driven by verified consignment."],
        why_it_matters: "Consumers actively trade in previous season pieces to fund high-end luxury purchases.",
        how_it_affects_you: "Introducing trade-in credit programs allows retailers to capture customer loyalty and repeat foot traffic.",
        what_to_do_next: { action_type: "prepare", guidance: "Evaluate consignment or trade-in store credit programs for your retail business." }
      }
    }
  ];
  return cards.map((c, index) => ({
    ...c,
    rank: index < 10 ? index + 1 : undefined,
  }));
}

function getAccountingBroadsheetCards(role: string): BriefingCard[] {
  const cards: BriefingCard[] = [
    {
      id: "ac-lead-1",
      title: "Real-Time E-Invoicing & Automated GST Compliance Mandates",
      source_url: "https://taxnotes.com",
      image_url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Chartered Accountant",
      target_stack: ["Tax & Compliance", "Accounting"],
      priority: "lead",
      card_content: {
        what_happened: [
          "Statutory tax authorities expand mandatory real-time electronic invoice registration to all commercial B2B transactions.",
          "Manual end-of-month reconciliations are superseded by instantaneous cryptographic invoice verification."
        ],
        why_it_matters: "Input tax credit (ITC) claims require verified real-time invoice matching; reporting discrepancies trigger automated compliance audits.",
        how_it_affects_you: "Your enterprise billing software and ERP ledger modules must integrate direct API handshakes with the national tax portal.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Audit your current accounting software to verify live electronic invoice API integration before the enforcement deadline."
        }
      }
    },
    {
      id: "ac-major-1",
      title: "Corporate Tax Planning: Accelerating Depreciation on Digital Capital Investments",
      source_url: "https://cpa.org",
      image_url: "https://images.unsplash.com/photo-1450133064473-71024230f91b?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Tax Consultant",
      target_stack: ["Corporate Tax", "Financial Planning"],
      priority: "major",
      card_content: {
        what_happened: [
          "Updated tax regulations authorize 100% first-year bonus depreciation for productivity technology and computerized hardware.",
          "Allows commercial enterprises to immediately deduct capital software investments against taxable operating earnings."
        ],
        why_it_matters: "Dramatically reduces net corporate income tax liabilities while modernizing internal operational equipment.",
        how_it_affects_you: "Review planned capital expenditure budgets for the upcoming fiscal quarter to maximize eligible depreciation deductions.",
        what_to_do_next: {
          action_type: "prepare",
          guidance: "Categorize all recent hardware and cloud infrastructure investments under eligible immediate-expensing tax schedules."
        }
      }
    },
    {
      id: "ac-major-2",
      title: "13-Week Cash Flow Sensitivity Forecasting During Tight Credit Cycles",
      source_url: "https://bloomberg.com",
      image_url: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Financial Controller",
      target_stack: ["Cash Flow", "Financial Analysis"],
      priority: "major",
      card_content: {
        what_happened: [
          "Elevated benchmark interest rates maintain high borrowing costs, making reliance on short-term revolving credit lines costly.",
          "Financial institutions enforce stricter debt-service coverage ratios (DSCR) on mid-market corporate borrowers."
        ],
        why_it_matters: "Unplanned working capital shortfalls risk severe liquidity crunches and punitive default penalties.",
        how_it_affects_you: "Finance teams must maintain rolling 13-week cash projections and accelerate accounts receivable collections.",
        what_to_do_next: {
          action_type: "apply",
          guidance: "Institute automated accounts receivable aging reminders to shorten days sales outstanding (DSO) by 7-10 days."
        }
      }
    },
    {
      id: "ac-brief-1",
      title: "Automated Fraud Detection in Accounts Payable: AI Optical Ledger Matching",
      source_url: "https://accountingtoday.com",
      target_role: role || "Auditor",
      target_stack: ["Audit & Controls", "Fintech"],
      priority: "brief",
      card_content: {
        what_happened: ["Neural pattern matching algorithms detect duplicate vendor billings and altered bank routing details prior to disbursement."],
        why_it_matters: "Prevents wire fraud and phishing vulnerabilities across accounts payable workflows.",
        how_it_affects_you: "Dual-authorization protocols on payment disbursement batches eliminate unauthorized capital outflows.",
        what_to_do_next: { action_type: "apply", guidance: "Enforce multi-signature approvals on all outbound vendor disbursements exceeding standard thresholds." }
      }
    }
  ];
  return cards.map((c, index) => ({
    ...c,
    rank: index < 10 ? index + 1 : undefined,
  }));
}

/* EXPANSIVE BROADSHEET DATASET (16 ARTICLES) TO FULLY FILL ALL COLUMNS WITHOUT EMPTY SPACES */
function getBroadsheetCards(role: string = "Professional", interests: string = ""): BriefingCard[] {
  const cat = detectTopicCategory(interests, role);
  if (cat === "beauty_fashion") {
    return getBeautyFashionBroadsheetCards(role);
  }
  if (cat === "accounting_tax") {
    return getAccountingBroadsheetCards(role);
  }
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

