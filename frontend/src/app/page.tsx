"use client";

import { Layers, Radio, Flame, Pin, ChevronLeft, ChevronRight, ArrowUp, CheckCircle2, ArrowRight } from "lucide-react";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { getBriefingsCacheKey, syncIdentityCache } from "@/lib/cache";
import { resolveUserIdentity } from "@/lib/identity";
import { GuestBanner } from "@/components/GuestBanner";
import { HeaderActions } from "@/components/HeaderActions";
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
  is_lead?: boolean;
  reading_time_minutes?: number;
  match_reason?: string;
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
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("Professional");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const { hideLoader } = useLoader();

  const userIdentity = useMemo(
    () =>
      resolveUserIdentity({
        profile: {
          name: userName,
          role: userRole,
          email: userEmail,
          picture_url: userAvatar,
        },
        me,
        user,
        isAnonymous: isAnonymous || isGuest,
      }),
    [userName, userRole, userEmail, userAvatar, me, user, isAnonymous, isGuest]
  );

  // Dynamic Reading Time Estimate across active cards (~200 words per minute)
  const readingTimeMinutes = useMemo(() => {
    if (!briefings || briefings.length === 0) return 1;
    let totalWords = 0;
    for (const card of briefings) {
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
  }, [briefings]);

  // Smart Auto-Hide Header (Hide on scroll down, reveal on scroll up)
  const [headerVisible, setHeaderVisible] = useState<boolean>(true);
  const lastScrollYRef = useRef<number>(0);

  // Floating Back to Top Arrow Button State
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

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
          if (profile.name) setUserName(profile.name);
          if (profile.email) setUserEmail(profile.email);
          if (profile.role) setUserRole(profile.role);
          if (profile.picture_url) setUserAvatar(profile.picture_url);
          const guestFlag = profile.auth_provider === "guest" || isAnonymous;
          if (guestFlag) {
            setIsGuest(true);
          }
          const resolved = resolveUserIdentity({
            profile: {
              name: profile.name,
              role: profile.role,
              email: profile.email,
              picture_url: profile.picture_url,
            },
            me,
            user,
            isAnonymous: guestFlag,
          });
          syncIdentityCache(resolved.isGuest ? null : resolved.displayName, resolved.avatarUrl);
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

      // Clear briefings and purge stale cache when API returns empty array
      setBriefings([]);
      try {
        localStorage.removeItem(getBriefingsCacheKey(user?.id));
      } catch {}
    } catch (err) {
      console.error("Error fetching briefings:", err);
      setBriefings([]);
      try {
        localStorage.removeItem(getBriefingsCacheKey(user?.id));
      } catch {}
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
  const displayedBentoStories = bentoStories;

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

          <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono relative shrink-0">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] sm:text-xs hidden lg:inline">
              {todayDate}
            </span>
            <span className="text-amber-300 dark:text-amber-400 font-bold hidden md:inline border-l border-slate-700 pl-3 tracking-wider uppercase text-[11px]">
              {briefings.length} updates, ~{readingTimeMinutes} min read
            </span>

            <HeaderActions
              identity={userIdentity}
              email={userEmail || me?.email || user?.email}
              currentPage="home"
              onSignOut={async () => {
                await signOut();
                router.push("/login");
              }}
            />
          </div>
        </div>
      </header>

      {/* GUEST BANNER */}
      <GuestBanner />

      {/* 2. EDITION INDEX RIBBON (ALL SIGNALS IN ONE VIEW WITH RIGHT-ALIGNED PREV/NEXT CONTROLS) */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-1.5 sm:py-2 shadow-2xs transition-colors duration-200">
        <div className="max-w-[1600px] mx-auto flex items-center gap-1.5 sm:gap-3 font-mono text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {/* Label */}
          <div className="flex items-center gap-1 text-slate-900 dark:text-slate-100 font-black shrink-0 pr-1.5 sm:pr-2 border-r border-slate-200 dark:border-slate-800 select-none">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900 dark:text-amber-400" />
            <span className="hidden sm:inline">COVERAGE:</span>
          </div>

          {/* Topics Container with Hidden Scrollbar & Touch Panning */}
          <div
            ref={coverageScrollRef}
            className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5 touch-pan-x"
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

          {/* Right-aligned Prev/Next Scroll Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => scrollCoverage("left")}
              disabled={!canScrollLeft}
              aria-label="Previous topics"
              title="Scroll topics left"
              className="shrink-0 p-1 sm:p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-25 disabled:hover:bg-slate-50 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
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
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA (FINITE BRIEFING, NO PAGE LIFT) */}
      <div className="relative z-10 min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans selection:bg-slate-900 selection:text-white pb-16 transition-colors duration-200">
      {/* 3. MULTI-COLUMN HIGH-DENSITY BROADSHEET WITH TOP SHOWCASE & FULL-WIDTH BENTO GRID */}
      <main className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        {!loading && briefings.length === 0 ? (
          <section data-testid="empty-briefing-state" className="py-20 text-center max-w-xl mx-auto space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 mb-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100">
              No updates in your stack yet
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
              We monitor official release notes, engineering blogs, and security advisories continuously.
              Check back shortly or adjust your focus topics in your profile to broaden your briefing coverage.
            </p>
            <div className="pt-2">
              <Link
                href="/profile"
                className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-lg hover:border-slate-400 dark:hover:border-slate-500 transition-colors shadow-2xs"
              >
                Adjust Focus Topics <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="space-y-6 sm:space-y-8">
          
          {/* TOP BALANCED SHOWCASE: #1 CRITICAL UPDATE (LEFT) + THE QUICK WIRE (RIGHT) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 items-start pb-8 sm:pb-10 border-b-2 border-slate-900 dark:border-slate-800">
            
            {/* TOP MOST IMPORTANT UPDATE (LEFT 5 COLS) */}
            <div className="lg:col-span-5 flex flex-col">
              <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-slate-800 pb-2 mb-3 font-mono">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-black tracking-wider uppercase bg-rose-600 text-white shadow-xs">
                  <Flame className="w-3.5 h-3.5" /> #1 CRITICAL UPDATE
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-[11px] font-bold uppercase font-mono">
                  • TOP SIGNAL
                </span>
              </div>
              <div className="flex flex-col">
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

                  <div className="flex items-center gap-2 shrink-0">
                    {loadingRemaining ? (
                      <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                        <span className="hidden sm:inline">AI SYNTHESIZING REMAINING TAKES...</span>
                        <span className="sm:hidden">SYNTHESIZING...</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 font-bold hidden xl:inline">
                        Daily Briefing
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* FULL-WIDTH DYNAMIC BENTO GRID (GAPLESS GUARANTEE, SPANS ENTIRE WIDTH) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {displayedBentoStories.length > 0 ? (
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
        </>
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
