"use client";

import { User, Layers, LayoutGrid, Radio, Flame, Wrench, ClipboardList, Pin, Lightbulb, Target, Ruler, BarChart2, Shield, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, BookOpen, Sun, Moon, ExternalLink, Maximize2, X, Search, Loader2, Sparkles, Calendar, LogOut } from "lucide-react";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLoader } from "@/context/LoadingContext";
import { useTheme } from "@/context/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

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
 * Curated High-Resolution Editorial Image Pools (100% Unique Photos per Domain)
 * Guaranteed no duplicate photos across cards unless an image genuinely comes from the real resource.
 */
const DOMAIN_IMAGE_POOLS: Record<string, string[]> = {
  beauty: [
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1608248597359-2b027d729c78?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1503236823255-94609f598e71?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526947425960-945c6e72858f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=800&auto=format&fit=crop",
  ],
  fashion: [
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1469334031218-e382a71b716b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?q=80&w=800&auto=format&fit=crop",
  ],
  finance: [
    "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1450133064473-71024230f91b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1554224154-26032ffc0d07?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1551836022-d5d88e9218df?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=800&auto=format&fit=crop",
  ],
  retail: [
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1556742049-0a67e557224f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1578916171728-46686eac8d58?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1555529771-835f59fc5efe?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?q=80&w=800&auto=format&fit=crop",
  ],
  food: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=800&auto=format&fit=crop",
  ],
  health: [
    "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?q=80&w=800&auto=format&fit=crop",
  ],
  tech: [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1504639725590-34d0984388bd?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?q=80&w=800&auto=format&fit=crop",
  ],
  general: [
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop",
  ],
};

function getCardDomainKey(card: BriefingCard): string {
  const text = ((card.target_stack || []).join(" ") + " " + (card.title || "")).toLowerCase();
  if (text.includes("beauty") || text.includes("hair") || text.includes("nail") || text.includes("skin") || text.includes("cosmetic") || text.includes("curler") || text.includes("manicure") || text.includes("salon") || text.includes("spa")) {
    return "beauty";
  }
  if (text.includes("fashion") || text.includes("hoodie") || text.includes("dress") || text.includes("apparel") || text.includes("clothing") || text.includes("style") || text.includes("shoes") || text.includes("wear") || text.includes("runway")) {
    return "fashion";
  }
  if (text.includes("tax") || text.includes("accounting") || text.includes("audit") || text.includes("gst") || text.includes("bookkeeping") || text.includes("ledger") || text.includes("invoice") || text.includes("finance") || text.includes("banking") || text.includes("fintech") || text.includes("stock") || text.includes("invest") || text.includes("cash")) {
    return "finance";
  }
  if (text.includes("retail") || text.includes("shop") || text.includes("store") || text.includes("pos") || text.includes("inventory") || text.includes("merchandising") || text.includes("ecommerce") || text.includes("e-commerce")) {
    return "retail";
  }
  if (text.includes("food") || text.includes("restaurant") || text.includes("dining") || text.includes("cafe") || text.includes("culinary") || text.includes("coffee") || text.includes("bakery")) {
    return "food";
  }
  if (text.includes("health") || text.includes("medical") || text.includes("doctor") || text.includes("wellness") || text.includes("clinic") || text.includes("fitness")) {
    return "health";
  }
  if (text.includes("ai") || text.includes("gemini") || text.includes("model") || text.includes("learning") || text.includes("cloud") || text.includes("azure") || text.includes("aws") || text.includes("security") || text.includes("cyber") || text.includes("code") || text.includes("software") || text.includes("programming") || text.includes("react") || text.includes("angular") || text.includes("python") || text.includes("rust") || text.includes(".net") || text.includes("c#")) {
    return "tech";
  }
  return "general";
}

/**
 * Resolves a completely unique image for a card.
 * Rule: We cannot use the same image twice UNLESS that exact image came from its real resource.
 */
function resolveUniqueCardImage(card: BriefingCard, usedFallbackImages: Set<string>): string | null {
  // 1. Real Resource Image: ALWAYS allowed (even if shared by related source articles)
  if (card.is_real_image && card.image_url && card.image_url.trim().length > 0) {
    return card.image_url.trim();
  }

  // 2. If card has an existing fallback image_url that has NOT been used anywhere on the page yet:
  if (card.image_url && card.image_url.trim().length > 0) {
    const trimmed = card.image_url.trim();
    if (!usedFallbackImages.has(trimmed)) {
      usedFallbackImages.add(trimmed);
      return trimmed;
    }
  }

  // 3. Find next unused image from the matching domain pool
  const domainKey = getCardDomainKey(card);
  const primaryPool = DOMAIN_IMAGE_POOLS[domainKey] || [];
  for (const url of primaryPool) {
    if (!usedFallbackImages.has(url)) {
      usedFallbackImages.add(url);
      return url;
    }
  }

  // 4. Try general pool
  const generalPool = DOMAIN_IMAGE_POOLS.general || [];
  for (const url of generalPool) {
    if (!usedFallbackImages.has(url)) {
      usedFallbackImages.add(url);
      return url;
    }
  }

  // 5. If all pools are exhausted, NEVER repeat an image!
  return null;
}

/**
 * Ensures that at least ONE news card with an image is rendered out of every 5 news updates,
 * prioritizing cards that have genuine real resource images.
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

    // Check if any cards in this 5-card chunk have a genuine real resource image
    const withRealImages = indices.filter((i) => {
      const card = stories[i];
      return Boolean(card?.is_real_image && card?.image_url && card.image_url.trim().length > 0);
    });

    if (withRealImages.length > 0) {
      // Prioritize the card with a real feed image. Prefer rectangle cards (span >= 2) if available
      const preferred = withRealImages.find((i) => (spans[i] ?? 1) >= 2) ?? withRealImages[0];
      result[preferred] = true;
    } else {
      // Out of every 5 news updates, at least one news card with an image is rendered
      // Pick a rectangle card if present in this 5-pack, otherwise the first card
      const preferred = indices.find((i) => (spans[i] ?? 1) >= 2) ?? indices[0];
      result[preferred] = true;
    }
  }

  return result;
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
  const [dailyHeading, setDailyHeading] = useState<string>("Personalized Intelligence Gazette");
  const [briefings, setBriefings] = useState<BriefingCard[]>([]);
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
  const { showLoader, hideLoader } = useLoader();

  // First name extraction for top-bar profile button
  const userFirstName = userName && userName.trim() && userName.trim() !== "User"
    ? userName.trim().split(/\s+/)[0]
    : (userName && userName.trim() ? userName.trim() : "Profile");

  // Infinite Scroll & 20% Page Lift Reveal States
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [editionNumber, setEditionNumber] = useState<number>(1);
  const isLoadingMoreRef = useRef<boolean>(false);
  const canTriggerRef = useRef<boolean>(true);
  const pageNumberRef = useRef<number>(1);
  const activeSearchTopicRef = useRef<string>("");
  const searchedStoriesRef = useRef<BriefingCard[] | null>(null);

  useEffect(() => {
    activeSearchTopicRef.current = activeSearchTopic;
  }, [activeSearchTopic]);

  useEffect(() => {
    searchedStoriesRef.current = searchedStories;
  }, [searchedStories]);

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
    const cachedCards = localStorage.getItem("becon_cached_briefings");
    if (cachedCards) {
      try {
        const parsed = JSON.parse(cachedCards);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBriefings(parsed);
          setLoading(false);
        }
      } catch {}
    }
  }, [hideLoader]);

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
      const currentSearchTopic = activeSearchTopicRef.current.trim();
      const isSearchActive = Boolean(currentSearchTopic && searchedStoriesRef.current !== null);

      if (isSearchActive) {
        // --- 1. SEARCH CONTINUOUS PAGINATION ---
        const currentOffset = searchedStoriesRef.current ? searchedStoriesRef.current.length : 0;
        const searchParams = new URLSearchParams({
          query: currentSearchTopic,
          role: activeRole,
          limit: "6",
          offset: String(currentOffset),
          page: String(nextPage),
        });

        let incomingCards: BriefingCard[] = [];

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 9000);
          const res = await fetch(`${API}/api/search-topic?${searchParams.toString()}`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data: BriefingCard[] = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              incomingCards = data.map((c) => ({
                ...c,
                rank: undefined,
              }));
            }
          }
        } catch (fetchErr) {
          console.error("Backend error fetching next search edition:", fetchErr);
        }

        // If backend returned no cards (e.g. backend offline or end of feed), generate continuous themed search cards
        if (!incomingCards || incomingCards.length === 0) {
          const topicSlug = currentSearchTopic.toLowerCase().replace(/[^a-z0-9]/g, "") || "topic";
          incomingCards = [
            {
              id: `search-${topicSlug}-ed${nextPage}-1`,
              title: `${currentSearchTopic.toUpperCase()}: Market Developments & Strategic Shifts (Edition ${nextPage})`,
              source_url: `https://news.google.com/search?q=${encodeURIComponent(currentSearchTopic)}`,
              image_url: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=800&auto=format&fit=crop",
              target_role: activeRole,
              target_stack: [currentSearchTopic.toUpperCase(), "ANALYSIS"],
              priority: "major",
              card_content: {
                what_happened: [
                  `Expanded regional developments and ecosystem adoption reported across ${currentSearchTopic} commercial networks.`,
                  `New regulatory guidelines and institutional investments accelerate cross-border integration.`
                ],
                why_it_matters: `Directly impacts operational workflows, market trends, and consumer standards within the ${currentSearchTopic} domain.`,
                how_it_affects_you: `Requires validation of ongoing operational roadmaps and alignment with emerging market expectations.`,
                what_to_do_next: {
                  action_type: "apply",
                  guidance: `Incorporate updated intelligence protocols for ${currentSearchTopic} initiatives.`
                }
              }
            },
            {
              id: `search-${topicSlug}-ed${nextPage}-2`,
              title: `Global Infrastructure & Supply Modernization in ${currentSearchTopic.toUpperCase()}`,
              source_url: `https://news.google.com/search?q=${encodeURIComponent(currentSearchTopic)}`,
              image_url: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=800&auto=format&fit=crop",
              target_role: activeRole,
              target_stack: [currentSearchTopic.toUpperCase(), "INNOVATION"],
              priority: "major",
              card_content: {
                what_happened: [
                  `Infrastructure modernization and digital transformation milestones reached for ${currentSearchTopic} operations.`,
                  `Independent benchmarks confirm significant efficiency gains through modernized toolchains.`
                ],
                why_it_matters: `Lowers operational latency and unlocks sustained long-term competitive leverage.`,
                how_it_affects_you: `Benchmark internal capabilities against industry best practices to identify optimization opportunities.`,
                what_to_do_next: {
                  action_type: "learn",
                  guidance: `Review latest reference implementations and case studies on ${currentSearchTopic}.`
                }
              }
            },
            {
              id: `search-${topicSlug}-ed${nextPage}-3`,
              title: `Regulatory Compliance, Risk Mitigation & Governance in ${currentSearchTopic.toUpperCase()}`,
              source_url: `https://news.google.com/search?q=${encodeURIComponent(currentSearchTopic)}`,
              image_url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop",
              target_role: activeRole,
              target_stack: [currentSearchTopic.toUpperCase(), "SECURITY"],
              priority: "major",
              card_content: {
                what_happened: [
                  `Updated security standards and governance policies published for ${currentSearchTopic} stakeholder groups.`,
                  `Compliance verification processes must be audited prior to multi-region rollout.`
                ],
                why_it_matters: `Ensures legal adherence and prevents vulnerability exposure in critical systems.`,
                how_it_affects_you: `Review third-party integrations and supplier commitments for standard compliance.`,
                what_to_do_next: {
                  action_type: "prepare",
                  guidance: `Audit current systems against revised governance standards for ${currentSearchTopic}.`
                }
              }
            }
          ];
        }

        await minDelay;

        // Append directly to searchedStories so the UI Bento Deck immediately renders them!
        setSearchedStories((prev) => {
          const prevList = prev || [];
          const existingIds = new Set(prevList.map((c) => c.id));
          const existingTitles = new Set(prevList.map((c) => c.title.toLowerCase().trim()));
          let unique = incomingCards.filter(
            (c) => !existingIds.has(c.id) && !existingTitles.has(c.title.toLowerCase().trim())
          );
          if (unique.length === 0) {
            unique = incomingCards.map((c, i) => ({
              ...c,
              id: `${c.id}-pg${nextPage}-${i}`,
            }));
          }
          return [...prevList, ...unique];
        });

      } else {
        // --- 2. DEFAULT BROADSHEET FEED PAGINATION ---
        const params = new URLSearchParams();
        if (activeRole) params.set("role", activeRole);
        if (activeInterests) params.set("interests", activeInterests);
        if (activePrompt) params.set("custom_prompt", activePrompt);
        params.set("offset", String(briefings.length));
        params.set("page", String(nextPage));
        params.set("limit", "6");

        let incomingCards: BriefingCard[] = [];

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 9000);
          const res = await fetch(`${API}/api/briefings?${params.toString()}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data: BriefingCard[] = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              incomingCards = data;
            }
          }
        } catch {
          // Backend offline, timed out or error; fallback smoothly below
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
      }

      pageNumberRef.current = nextPage;
      setEditionNumber(nextPage);
    } catch (err) {
      console.error("Error loading next edition", err);
      await minDelay;
    } finally {
      // Lower the page smoothly back to normal position
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
      setTimeout(() => {
        canTriggerRef.current = true;
      }, 800);
    }
  }, [loading, userRole, userInterests, customPrompt, briefings.length]);

  // Topic AI Search Handlers
  const handleTopicSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearchingTopic(true);
    setActiveSearchTopic(query);
    setSearchError("");
    pageNumberRef.current = 1;
    setEditionNumber(1);

    try {
      const params = new URLSearchParams({
        query,
        role: userRole,
        limit: "6",
        offset: "0",
        page: "1",
      });
      const res = await fetch(`${API}/api/search-topic?${params.toString()}`);
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
    pageNumberRef.current = 1;
    setEditionNumber(1);
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

      if (isLoadingMoreRef.current || !canTriggerRef.current || loading) return;
      const scrollPos = window.innerHeight + currentScrollY;
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
      hideLoader();
      try {
        const res = await fetch(`${API}/api/profile`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const profile = await res.json();
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
          if (profile.auth_provider === "guest" || localStorage.getItem("becon_is_guest") === "true") {
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

      const topRes = await fetch(`${API}/api/briefings?${topParams.toString()}`);
      if (topRes.ok) {
        const topData: BriefingCard[] = await topRes.json();
        if (Array.isArray(topData) && topData.length > 0) {
          const mappedTop = topData.map((c, index) => ({
            ...c,
            rank: c.rank ?? index + 1,
          }));
          setBriefings(mappedTop);
          try {
            localStorage.setItem("becon_cached_briefings", JSON.stringify(mappedTop));
          } catch {}
          // INSTANTLY REVEAL TOP SCREEN TO USER!
          setLoading(false);
          hideLoader();

          // STEP 2: SIMULTANEOUSLY LAZY-LOAD REMAINING CARDS FOR BENTO DECK IN BACKGROUND
          setLoadingRemaining(true);
          const remParams = new URLSearchParams(baseParams);
          remParams.set("scope", "remaining");

          try {
            const remRes = await fetch(`${API}/api/briefings?${remParams.toString()}`);
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
                  const full = [...prev, ...newCards];
                  try {
                    localStorage.setItem("becon_cached_briefings", JSON.stringify(full));
                  } catch {}
                  return full;
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
      setBriefings(getBroadsheetCards(activeRole, activeInterests));
    } catch (err) {
      console.log("API offline, displaying full high-density editorial broadsheet", err);
      setBriefings(getBroadsheetCards(activeRole, activeInterests));
    } finally {
      setLoading(false);
      hideLoader();
    }
  };

  const getActionBadgeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "apply":
        return "bg-slate-100/90 dark:bg-slate-800/80 text-emerald-600 dark:text-emerald-400 border-slate-200/90 dark:border-slate-700/80 font-bold";
      case "learn":
        return "bg-slate-100/90 dark:bg-slate-800/80 text-sky-600 dark:text-sky-400 border-slate-200/90 dark:border-slate-700/80 font-bold";
      case "avoid":
        return "bg-slate-100/90 dark:bg-slate-800/80 text-rose-600 dark:text-rose-400 border-slate-200/90 dark:border-slate-700/80 font-bold";
      case "prepare":
      default:
        return "bg-slate-100/90 dark:bg-slate-800/80 text-amber-600 dark:text-amber-400 border-slate-200/90 dark:border-slate-700/80 font-bold";
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

  // Memoized unique image mapping for the Lead story
  const leadImageUrl = useMemo(() => {
    if (!leadStory) return null;
    const singleSet = new Set<string>();
    return resolveUniqueCardImage(leadStory, singleSet);
  }, [leadStory]);

  // Memoized unique image mapping for all Bento deck stories
  // Ensures 100% distinct, non-repeating images across all cards on the page!
  const bentoCardImages = useMemo(() => {
    const usedFallbackImages = new Set<string>();
    // Pre-seed with the Lead Story's fallback image so no Bento card ever re-uses it!
    if (leadImageUrl && !leadStory?.is_real_image) {
      usedFallbackImages.add(leadImageUrl);
    }

    const bentoSpans = computeBentoSpans(displayedBentoStories.length);
    const visibility = computeImageVisibility(displayedBentoStories, bentoSpans);

    return displayedBentoStories.map((card, idx) => {
      if (!visibility[idx]) return null;
      return resolveUniqueCardImage(card, usedFallbackImages);
    });
  }, [displayedBentoStories, leadImageUrl, leadStory]);

  return (
    <div className="relative min-h-screen bg-[#FAF8F5] overflow-x-clip">
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
            <span className="text-slate-400 font-semibold hidden xl:inline border-l border-slate-700 pl-4 uppercase tracking-wider text-[11px] mr-2">
              EDITION: PERSONALIZED INTELLIGENCE
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
                        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
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
                    onClick={() => {
                      localStorage.removeItem("becon_token");
                      localStorage.removeItem("becon_user_name");
                      localStorage.removeItem("becon_user_avatar");
                      localStorage.removeItem("becon_is_guest");
                      router.push("/login");
                    }}
                    className="group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                    <span>{isGuest ? "Exit Guest Mode" : "Logout"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

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

      {/* FOREGROUND MAIN CONTENT (LIFTS UP GENTLY WHEN LOADING NEXT EDITION, HEADER REMAINS ANCHORED) */}
      <div
        style={{
          transform: isLoadingMore ? "translateY(-120px)" : "translateY(0px)",
          transition: "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s ease",
        }}
        className={`relative z-10 min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans selection:bg-slate-900 selection:text-white pb-16 will-change-transform transition-colors duration-200 ${
          isLoadingMore ? "shadow-[0_-20px_45px_rgba(0,0,0,0.65)]" : ""
        }`}
      >
      {/* 3. MULTI-COLUMN HIGH-DENSITY BROADSHEET WITH TOP SHOWCASE & FULL-WIDTH BENTO GRID */}
      <main className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        <div className="space-y-6 sm:space-y-8">
          
          {/* TOP BALANCED SHOWCASE: #1 CRITICAL UPDATE (LEFT) + THE QUICK WIRE (RIGHT) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 pb-8 sm:pb-10 border-b-2 border-slate-900 dark:border-slate-800">
            
            {/* TOP MOST IMPORTANT UPDATE (LEFT 5 COLS) */}
            <div className="lg:col-span-5 flex flex-col">
              <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-slate-800 pb-2 mb-3 font-mono">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-black tracking-wider uppercase bg-rose-600 text-white shadow-xs">
                  <Flame className="w-3.5 h-3.5" /> #1 CRITICAL UPDATE
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase font-mono">
                  • TOP SIGNAL
                </span>
              </div>
              {loading || !leadStory
                ? renderLeadSkeleton()
                : renderLeadSidebarCard(leadStory, getActionBadgeColor, leadImageUrl)}
            </div>

            {/* DAILY DISPATCHES / QUICK WIRE + TELEMETRY (RIGHT 7 COLS) */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div className="flex flex-col flex-1">
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
                    : topWireStories.map((card, idx) =>
                        renderBriefCard(
                          card,
                          getActionBadgeColor,
                          idx < 4 ? idx + 2 : undefined
                        )
                      )}
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
                    <span className="text-slate-400 font-mono font-bold">//</span>
                    <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-xs sm:text-[13px] tracking-wide truncate">
                      {dailyHeading}
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
                      AI Synthesized News for: <strong className="text-slate-950 dark:text-amber-100 underline underline-offset-2">"{activeSearchTopic}"</strong>
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
                          return renderSquareCard(card, getActionBadgeColor, showImageOnCard, resolvedImg);
                        }
                        const isFullWidth = span === 3;
                        return renderRectangleCard(card, getActionBadgeColor, showImageOnCard, isFullWidth, resolvedImg);
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
                      No live news articles found for "{activeSearchTopic}".
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

        {/* BOTTOM GAZETTE END DETECTOR & PULL PROMPT */}
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 mt-12 pt-8 border-t-2 border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={triggerLoadMore}
            disabled={isLoadingMore}
            className="group flex flex-col items-center gap-1.5 px-6 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-950 dark:hover:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 transition-all shadow-xs hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 group-hover:text-amber-300 transition-colors">
              <ChevronDown className={`w-4 h-4 ${isLoadingMore ? "animate-spin text-amber-500" : "animate-bounce group-hover:text-amber-300"}`} />
              <span>{isLoadingMore ? "Lifting Page • Dispatching New Edition..." : "Scroll Down Or Click To Load More Updates"}</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 group-hover:text-slate-400">
              Gazette Edition {editionNumber} • Pull up or scroll to reveal next briefings
            </span>
          </button>
        </div>

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
    </div>
  );
}

/* CLASSIC EDITORIAL STATUS BADGE RENDERER */
function renderActionBadge(actionType: string) {
  const type = (actionType || "prepare").toLowerCase().trim();

  let textColor = "text-amber-600 dark:text-amber-400";
  let label = "PREPARE";

  if (type === "apply") {
    textColor = "text-emerald-600 dark:text-emerald-400";
    label = "APPLY";
  } else if (type === "learn") {
    textColor = "text-sky-600 dark:text-sky-400";
    label = "LEARN";
  } else if (type === "avoid") {
    textColor = "text-rose-600 dark:text-rose-400";
    label = "AVOID";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs select-none ${textColor}`}
    >
      {label}
    </span>
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
    <article className="rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-800 p-4 sm:p-5 md:p-6 shadow-sm dark:shadow-slate-950/50 flex flex-col justify-between flex-1 h-full select-none">
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

        {/* Key Signals Skeleton Box */}
        <div className="mb-3.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-1 text-[10px] font-mono font-extrabold text-slate-500 dark:text-slate-400">
            <Pin className="w-3.5 h-3.5 text-rose-500" />
            <span>EXTRACTING KEY SIGNALS:</span>
          </div>
          <div className="space-y-2 pl-1">
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div>
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-5/6 animate-pulse"></div>
          </div>
        </div>

        {/* Impact Summary Skeleton */}
        <div className="space-y-1.5 mb-4">
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-4/5 animate-pulse"></div>
        </div>
      </div>

      {/* Footer Skeleton */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5">
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
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 md:p-5 shadow-2xs flex flex-col justify-between h-full select-none"
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

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-3">
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
        <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse"></div>
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
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-4">
        <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse"></div>
        <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
      </div>
    </article>
  );
}

/* RENDER HELPER 1: TOP MOST IMPORTANT UPDATE (COMPACT EDITORIAL LEAD BOX ON LEFT) */
function renderLeadSidebarCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  leadImageUrl?: string | null
) {
  return (
    <article
      key={card.id}
      className="rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-800 p-4 sm:p-5 md:p-6 shadow-sm dark:shadow-slate-950/50 flex flex-col justify-between flex-1 h-full"
    >
      <div>
        {/* Top Badges & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-slate-950 dark:bg-amber-400 text-amber-300 dark:text-slate-950 border border-slate-800 dark:border-amber-400 uppercase tracking-wider shadow-xs">
              LEAD // 01
            </span>
            {card.target_stack.slice(0, 2).map((tag) => renderStackTag(tag))}
            <span className="text-[10px] font-sans font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <span>{card.published_at || "Oct 23, 2026"}</span>
            </span>
          </div>
          {renderActionBadge(card.card_content.what_to_do_next.action_type)}
        </div>

        {/* Headline */}
        <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-950 dark:text-slate-50 font-serif tracking-tight leading-tight mb-3">
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-rose-600 dark:hover:text-amber-300 transition-colors"
          >
            {card.title}
          </a>
        </h3>

        {/* Compact Hero Image (Spot 1 - Always high quality and compact) */}
        {leadImageUrl ? (
          <div className="relative w-full h-36 sm:h-44 rounded-lg overflow-hidden my-3 border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={leadImageUrl}
              alt={card.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* 2 Key Takeaway Bullets */}
        <div className="mb-3.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
          <div className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-slate-950 dark:text-slate-100 flex items-center gap-1">
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
        <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mb-4 font-normal line-clamp-3">
          <strong className="text-slate-900 dark:text-slate-200 font-semibold font-mono text-[11px]">IMPACT: </strong>
          {card.card_content.why_it_matters}
        </p>
      </div>

      {/* Action Bar with Resource Link */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 font-mono">
        <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
          Role: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{card.target_role}</strong>
        </span>
        <a
          href={card.source_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 hover:text-amber-200 font-bold text-xs transition-all shadow-xs shrink-0 cursor-pointer border border-transparent dark:border-slate-700"
          title="Open original resource documentation"
        >
          <span>Resource</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </article>
  );
}

/* RENDER HELPER 2: WIDE RECTANGLE CARD (FOR MAJOR ARCHITECTURAL UPDATES IN BENTO DECK) */
function renderRectangleCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  showImage?: boolean,
  isFullWidth?: boolean,
  resolvedImageUrl?: string | null
) {
  const hasValidImage = Boolean(showImage && resolvedImageUrl);
  return (
    <article
      key={card.id}
      className={`${
        isFullWidth
          ? "col-span-1 md:col-span-2 xl:col-span-3"
          : "col-span-1 md:col-span-2 xl:col-span-2"
      } rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-slate-900 dark:hover:border-slate-600 transition-all p-4 sm:p-5 md:p-6 shadow-xs hover:shadow-md flex flex-col justify-between`}
    >
      <div>
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.target_stack.slice(0, 2).map((tag) => renderStackTag(tag))}
            {renderActionBadge(card.card_content.what_to_do_next.action_type)}
            <span className="text-[10px] font-sans font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <span>{card.published_at || "Oct 23, 2026"}</span>
            </span>
          </div>

          {/* Direct Resource Link */}
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-950 dark:hover:bg-slate-700 hover:text-amber-300 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold transition-all border border-slate-200 dark:border-slate-700 shrink-0"
            title="Open original resource documentation"
          >
            <span>Resource</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Content Body: Horizontal Media Split if showImage is true, else clean editorial layout */}
        {hasValidImage ? (
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
            {/* Left Image Thumbnail */}
            <div className="relative w-full sm:w-48 md:w-56 h-36 sm:h-44 shrink-0 rounded-lg overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedImageUrl!}
                alt={card.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* Right Text Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold font-serif text-slate-950 dark:text-slate-100 leading-snug mb-2">
                <a href={card.source_url} target="_blank" rel="noreferrer" className="hover:text-rose-600 dark:hover:text-amber-300 transition-colors">
                  {card.title}
                </a>
              </h3>

              {/* 2 Key Takeaway Bullets */}
              <div className="mb-2 space-y-1">
                <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                      <span className="text-slate-400 dark:text-slate-500 font-bold shrink-0">•</span>
                      <span className="line-clamp-2">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Why It Matters */}
              <p className="text-slate-600 dark:text-slate-400 text-[11px] sm:text-xs leading-relaxed font-normal line-clamp-2">
                <strong className="text-slate-900 dark:text-slate-200 font-semibold font-mono text-[10px]">IMPACT: </strong>
                {card.card_content.why_it_matters}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg sm:text-xl font-bold font-serif text-slate-950 dark:text-slate-100 leading-snug my-2">
              <a href={card.source_url} target="_blank" rel="noreferrer" className="hover:text-rose-600 dark:hover:text-amber-300 transition-colors">
                {card.title}
              </a>
            </h3>

            {/* 2 Key Takeaway Bullets */}
            <div className="mb-2.5 space-y-1">
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-slate-400 dark:text-slate-500 font-bold shrink-0">•</span>
                    <span className="line-clamp-2">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Why It Matters */}
            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm leading-relaxed mb-3 font-normal line-clamp-2">
              <strong className="text-slate-900 dark:text-slate-200 font-semibold font-mono text-[11px]">IMPACT: </strong>
              {card.card_content.why_it_matters}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs mt-3 font-mono">
        <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
          Role: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{card.target_role}</strong>
        </span>
        <a
          href={card.source_url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-950 dark:hover:bg-slate-700 hover:text-amber-300 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0 font-mono"
          title="Open original resource documentation"
        >
          <span>Resource</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </article>
  );
}

/* RENDER HELPER 3: NEAT SQUARE CARD (FOR SYSTEM WATCH & SPOTLIGHTS IN BENTO DECK) */
function renderSquareCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  showImage?: boolean,
  resolvedImageUrl?: string | null
) {
  const hasValidImage = Boolean(showImage && resolvedImageUrl);
  return (
    <article
      key={card.id}
      className="col-span-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-slate-900 dark:hover:border-slate-600 transition-all p-4 sm:p-5 shadow-xs hover:shadow-md flex flex-col justify-between"
    >
      <div>
        {/* Top Row with Tag and Direct Resource Icon Link */}
        <div className="flex items-center justify-between gap-1.5 mb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            {renderStackTag(card.target_stack[0])}
            <span className="text-[9.5px] font-sans font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
              <Calendar className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" />
              <span>{card.published_at || "Oct 23, 2026"}</span>
            </span>
          </div>

          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-950 dark:hover:text-amber-300 transition-colors p-1"
            title="Open original resource documentation"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Optional Image Thumbnail when showImage is true */}
        {hasValidImage && (
          <div className="relative w-full h-32 sm:h-36 rounded-lg overflow-hidden mb-3 border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shadow-2xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedImageUrl!}
              alt={card.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Headline */}
        <h3 className="text-base font-bold font-serif text-slate-950 dark:text-slate-100 leading-snug line-clamp-2 mb-2">
          <a href={card.source_url} target="_blank" rel="noreferrer" className="hover:text-rose-600 dark:hover:text-amber-300 transition-colors">
            {card.title}
          </a>
        </h3>

        {/* 2 Key Signal Bullets */}
        <div className="mb-2 space-y-1">
          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
            {card.card_content.what_happened.slice(0, 2).map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-slate-400 dark:text-slate-500 font-bold shrink-0">•</span>
                <span className="line-clamp-2">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Why It Matters / Impact Snippet */}
        <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed font-normal line-clamp-2 mb-2">
          <strong className="text-slate-900 dark:text-slate-200 font-semibold font-mono text-[10px]">IMPACT: </strong>
          {card.card_content.why_it_matters}
        </p>
      </div>

      {/* Footer */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 mt-auto">
        {renderActionBadge(card.card_content.what_to_do_next.action_type)}

        <a
          href={card.source_url}
          target="_blank"
          rel="noreferrer"
          className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-950 dark:hover:bg-slate-700 hover:text-amber-300 text-slate-700 dark:text-slate-200 font-mono text-[10px] font-bold transition-all border border-slate-200 dark:border-slate-700 shrink-0 flex items-center gap-1 shadow-2xs"
          title="Open original resource documentation"
        >
          <span>Resource</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </article>
  );
}

/* RENDER HELPER 4: BRIEF WIRE CARDS (SIDEBAR DISPATCHES) */
function renderBriefCard(
  card: BriefingCard,
  getBadgeColor: (type: string) => string,
  rankNumber?: number
) {
  return (
    <article
      key={card.id}
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 md:p-5 shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 transition-all flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            {rankNumber !== undefined && rankNumber <= 5 && (
              <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-amber-300 border border-slate-800 dark:border-slate-700 shrink-0">
                #{String(rankNumber).padStart(2, "0")}
              </span>
            )}
            {renderStackTag(card.target_stack[0])}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={card.source_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-950 dark:hover:bg-slate-700 hover:text-amber-300 text-slate-700 dark:text-slate-200 font-mono transition-all border border-slate-200 dark:border-slate-700 shrink-0"
              title="Open original resource documentation"
            >
              <span>Resource</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <h4 className="text-sm sm:text-base font-bold font-serif text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 mb-2">
          <a href={card.source_url} target="_blank" rel="noreferrer" className="hover:text-rose-600 dark:hover:text-amber-300 transition-colors">
            {card.title}
          </a>
        </h4>

        <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed line-clamp-3">
          {card.card_content.what_happened[0] || card.card_content.why_it_matters}
        </p>

        {card.card_content.why_it_matters && card.card_content.what_happened[0] && (
          <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed line-clamp-2 font-mono pt-2 mt-2 border-t border-dashed border-slate-100 dark:border-slate-800">
            <span className="font-bold text-slate-700 dark:text-slate-300">IMPACT: </span>
            {card.card_content.why_it_matters}
          </p>
        )}
      </div>

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-3">
        <span className="truncate flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5 text-slate-400" />
          <span>{card.published_at || "Oct 23, 2026"}</span>
        </span>
        {renderActionBadge(card.card_content.what_to_do_next.action_type)}
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

function getBeautyFashionEditionCards(edition: number, role: string): BriefingCard[] {
  if (edition % 2 === 0) {
    return [
      {
        id: `edition-${edition}-1`,
        title: "Clean Beauty Traceability: Blockchain Verification for Botanical & Fragrance Extracts",
        source_url: "https://wwd.com",
        image_url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=800&auto=format&fit=crop",
        target_role: role || "Beauty Executive",
        target_stack: ["Beauty & Cosmetics", "Supply Chain"],
        priority: "major",
        card_content: {
          what_happened: [
            "Luxury cosmetic houses deploy cryptographic batch passports verifying ethical harvesting of essential oils.",
            "QR codes on product packaging allow consumers to view independent lab test results for heavy metals and purity."
          ],
          why_it_matters: "Defensible ingredient provenance commands up to 30% premium pricing among health-conscious cosmetic buyers.",
          how_it_affects_you: "Suppliers unable to provide verified origin certificates risk de-listing from high-end retail distribution.",
          what_to_do_next: { action_type: "prepare", guidance: "Audit ingredient provenance documentation across your core product lines." }
        }
      },
      {
        id: `edition-${edition}-2`,
        title: "Sustainable Denim Manufacturing: Laser Finishing & Waterless Distressing Tech",
        source_url: "https://vogue.com",
        target_role: role || "Apparel Director",
        target_stack: ["Fashion & Style", "Manufacturing"],
        priority: "major",
        card_content: {
          what_happened: [
            "Automated laser engraving and ozone bleaching eliminate hazardous sandblasting in commercial jean manufacturing.",
            "Water consumption drops from 70 liters to under 5 liters per finished pair of jeans."
          ],
          why_it_matters: "Drastically lowers hazardous waste liability and fulfills stringent international environmental manufacturing codes.",
          how_it_affects_you: "Apparel buyers can promote authentic eco-friendly denim collections without compromising aesthetic finish.",
          what_to_do_next: { action_type: "apply", guidance: "Inquire with denim manufacturing partners regarding laser finishing adoption." }
        }
      },
      {
        id: `edition-${edition}-3`,
        title: "Dermatological Skincare: Peptide Delivery Systems & Skin Barrier Restoration",
        source_url: "https://instyle.com",
        target_role: role || "Skincare Specialist",
        target_stack: ["Beauty & Cosmetics", "Skincare"],
        priority: "major",
        card_content: {
          what_happened: [
            "Next-generation multi-molecular weight copper peptides achieve clinically proven collagen restoration without irritation.",
            "Barrier-repair serums emerge as the fastest-growing skincare category across retail pharmacies and specialty counters."
          ],
          why_it_matters: "Consumers actively seek clinically validated active ingredients over generic cosmetic moisturizing creams.",
          how_it_affects_you: "Merchandising formulations with stated active percentages significantly improves customer trust and repeat orders.",
          what_to_do_next: { action_type: "learn", guidance: "Review peptide research formulations for upcoming seasonal skincare product lines." }
        }
      },
      {
        id: `edition-${edition}-4`,
        title: "Color Cosmetics Forecasting: Terracotta & Olive Lead Luxury Seasonal Lines",
        source_url: "https://wwd.com",
        target_role: role || "Merchandiser",
        target_stack: ["Fashion & Style", "Trend Analysis"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Milan Fashion Week color forecasting identifies terracotta, butter yellow, and muted olive as prevailing colorways.",
            "Apparel and cosmetic collaborations coordinate cohesive seasonal shade palettes across lip, eye, and outerwear."
          ],
          why_it_matters: "Synchronized color stories between makeup and fashion collections drive cross-category basket growth.",
          how_it_affects_you: "Window displays and promotional imagery should spotlight these verified seasonal tones.",
          what_to_do_next: { action_type: "apply", guidance: "Update storefront displays and digital lookbooks to reflect these featured seasonal shades." }
        }
      },
      {
        id: `edition-${edition}-5`,
        title: "Salon & Spa Operations: Predictive Staff Scheduling & Automated Booking SMS",
        source_url: "https://modernsalon.com",
        target_role: role || "Salon Owner",
        target_stack: ["Beauty Business", "Operations"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Cloud salon management platforms utilize booking patterns to forecast appointment rush hours and optimize staff rotas.",
            "Automated SMS rebooking reminders sent at the 4-week mark lift customer return frequency by 22%."
          ],
          why_it_matters: "Unbooked service hours represent irreversible lost revenue for appointment-based beauty and wellness businesses.",
          how_it_affects_you: "Automating rebooking workflows guarantees consistent salon chair utilization throughout the working week.",
          what_to_do_next: { action_type: "apply", guidance: "Set up automated SMS rebooking workflows targeting clients 3-4 weeks post-service." }
        }
      },
      {
        id: `edition-${edition}-6`,
        title: "Luxury Fashion Consignment: Digital Resale Authentication Protocols",
        source_url: "https://businessoffashion.com",
        target_role: role || "Fashion Merchant",
        target_stack: ["Fashion & Style", "Retail Commerce"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Computer vision microscopic stitch analysis tools authenticate pre-owned designer bags and accessories within 30 seconds.",
            "Secondary luxury marketplaces surge in consumer adoption as collectors monetize archived wardrobe assets."
          ],
          why_it_matters: "Authentication guarantees eliminate counterfeit liabilities in high-value pre-owned apparel transactions.",
          how_it_affects_you: "Boutique retailers can introduce trade-in credits to incentivize clients to purchase current-season collections.",
          what_to_do_next: { action_type: "learn", guidance: "Explore store trade-in programs to stimulate sales velocity on current-season inventory." }
        }
      }
    ];
  } else {
    return [
      {
        id: `edition-${edition}-1`,
        title: "AI Shade Matching: Spectral Camera Analysis in Digital Beauty Retail",
        source_url: "https://cosmeticsbusiness.com",
        image_url: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=800&auto=format&fit=crop",
        target_role: role || "Beauty Executive",
        target_stack: ["Beauty & Cosmetics", "Retail Tech"],
        priority: "major",
        card_content: {
          what_happened: [
            "Spectral camera analysis on smartphone sensors matches user skin undertones to foundation formulas with 95% precision.",
            "Beauty brands report a 40% reduction in foundation returns and higher customer retention."
          ],
          why_it_matters: "Accurate online shade matching removes the primary friction barrier in digital cosmetic shopping.",
          how_it_affects_you: "Storefronts with interactive shade matching retain shoppers longer and enjoy superior conversion.",
          what_to_do_next: { action_type: "apply", guidance: "Integrate virtual shade matching tools on your digital beauty storefront." }
        }
      },
      {
        id: `edition-${edition}-2`,
        title: "Circular Apparel Design: Mono-Material Garments for Zero-Waste Recycling",
        source_url: "https://textileworld.com",
        target_role: role || "Fashion Designer",
        target_stack: ["Fashion & Style", "Sustainability"],
        priority: "major",
        card_content: {
          what_happened: [
            "Apparel brands shift toward 100% single-fiber garments (mono-materials) to enable mechanical and chemical recycling.",
            "Avoids blended synthetic fibers that are impossible to separate in conventional recycling plants."
          ],
          why_it_matters: "Anticipates upcoming European textile waste disposal levies and consumer sustainability mandates.",
          how_it_affects_you: "Specifying pure natural or single-source synthetic fibers insulates brands from circular economy penalties.",
          what_to_do_next: { action_type: "prepare", guidance: "Review fabric compositions with apparel pattern designers to prioritize mono-material construction." }
        }
      },
      {
        id: `edition-${edition}-3`,
        title: "Clean Hair Care Formulations: Microplastic-Free Styling Polymers",
        source_url: "https://modernsalon.com",
        target_role: role || "Salon Specialist",
        target_stack: ["Hair Care", "Beauty Trends"],
        priority: "major",
        card_content: {
          what_happened: [
            "Plant-derived polysaccharides replace synthetic microplastic fixatives in professional hair styling gels and hairsprays.",
            "Delivers flexible all-day hold without scalp flaking or environmental bioaccumulation."
          ],
          why_it_matters: "Upcoming regulatory bans on microplastics in leave-on hair formulations require reformulation of legacy lines.",
          how_it_affects_you: "Stocking compliant clean styling products protects professional salon retail sales from regulatory disruptions.",
          what_to_do_next: { action_type: "learn", guidance: "Transition salon retail displays toward verified clean hair care lines." }
        }
      },
      {
        id: `edition-${edition}-4`,
        title: "Footwear Supply Chains: Bio-Based Thermoplastic Soles Gain Traction",
        source_url: "https://footwearnews.com",
        target_role: role || "Footwear Merchant",
        target_stack: ["Fashion & Style", "Supply Chain"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Shoe manufacturers replace petroleum EVA foams with sugarcane-derived bio-resins that match durability standards.",
            "Reduces product carbon footprint by up to 50% without increasing wholesale production costs."
          ],
          why_it_matters: "Footwear brands can make legitimate eco-friendly marketing claims backed by verified bio-content percentages.",
          how_it_affects_you: "Footwear buyers report higher consumer willingness to pay for verified sustainable shoe construction.",
          what_to_do_next: { action_type: "apply", guidance: "Inquire with footwear distributors regarding bio-foam shoe models for next season's catalog." }
        }
      },
      {
        id: `edition-${edition}-5`,
        title: "Beauty Influencer ROI: Micro-Creator Seeding Outperforms Big Endorsements",
        source_url: "https://businessoffashion.com",
        target_role: role || "Brand Strategist",
        target_stack: ["Beauty Marketing", "Social Commerce"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Data analysis shows beauty creators with 10k-50k followers generate 3x higher direct sales conversions than mega-celebrities.",
            "Audience trust in genuine, unscripted product demonstrations drives immediate checkout action."
          ],
          why_it_matters: "Spreading influencer marketing budgets across multiple micro-creators mitigates campaign risk and maximizes ROI.",
          how_it_affects_you: "Building long-term relationships with authentic niche creators creates a consistent stream of customer acquisitions.",
          what_to_do_next: { action_type: "apply", guidance: "Develop a dedicated gifting and affiliate package for 20 active micro-creators in your niche." }
        }
      },
      {
        id: `edition-${edition}-6`,
        title: "Fragrance Chemistry: Sustainable Biotechnology in Molecular Perfumery",
        source_url: "https://perfumerflavorist.com",
        target_role: role || "Product Developer",
        target_stack: ["Cosmetics & Fragrance", "Innovation"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Enzymatic biotechnology synthesizes rare oud and musk scent profiles using renewable sugar feedstocks.",
            "Guarantees 100% hypoallergenic purity and ethical sourcing without reliance on endangered animal or plant sources."
          ],
          why_it_matters: "Removes ethical controversies while securing consistent raw ingredient pricing across seasonal manufacturing cycles.",
          how_it_affects_you: "Luxury perfume houses can market cruelty-free, sustainable credentials with exceptional scent longevity.",
          what_to_do_next: { action_type: "learn", guidance: "Sample bio-derived fragrance compounds for upcoming seasonal perfume releases." }
        }
      }
    ];
  }
}

function getAccountingEditionCards(edition: number, role: string): BriefingCard[] {
  return [
    {
      id: `edition-${edition}-1`,
      title: "Statutory Tax Audits: Digital Record Preservation & Penalty Prevention",
      source_url: "https://taxnotes.com",
      image_url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop",
      target_role: role || "Accountant",
      target_stack: ["Tax & Compliance", "Accounting"],
      priority: "major",
      card_content: {
        what_happened: [
          "Revenue authorities mandate retaining searchable digital transaction archives for a minimum of 7 consecutive financial years.",
          "Inability to furnish machine-readable audit trails during tax inquiries results in disallowance of operating deductions."
        ],
        why_it_matters: "Disallowed business expenses result in steep retrospective tax demands and mandatory interest penalties.",
        how_it_affects_you: "Accounting departments must implement immutable cloud ledger backups with encrypted timestamping.",
        what_to_do_next: { action_type: "apply", guidance: "Audit archive retention procedures to ensure all invoices and payment vouchers are digitally indexed." }
      }
    },
    {
      id: `edition-${edition}-2`,
      title: "Working Capital Optimization: Dynamic Supplier Discounting Models",
      source_url: "https://cpa.org",
      target_role: role || "Financial Controller",
      target_stack: ["Corporate Finance", "Cash Management"],
      priority: "major",
      card_content: {
        what_happened: [
          "Enterprises deploy sliding-scale early payment discounts to suppliers in exchange for 2% invoice price reductions.",
          "Generates annualized risk-free returns exceeding 18% on surplus short-term operational cash reserves."
        ],
        why_it_matters: "Offers a high-yield deployment strategy for corporate cash balances while strengthening crucial vendor supply chains.",
        how_it_affects_you: "Accounts payable workflows can unlock substantial annualized cost savings without altering operational budgets.",
        what_to_do_next: { action_type: "prepare", guidance: "Evaluate early-payment discount agreements with top 20 vendors by monthly spend volume." }
      }
    },
    {
      id: `edition-${edition}-3`,
      title: "Payroll Tax Harmonization: Managing Multi-State & Remote Workforce Withholdings",
      source_url: "https://accountingtoday.com",
      target_role: role || "Payroll Specialist",
      target_stack: ["Payroll", "Tax Compliance"],
      priority: "major",
      card_content: {
        what_happened: [
          "Cross-jurisdictional tax authorities intensify compliance reviews on remote worker payroll withholding obligations.",
          "Failure to register in employee residential states triggers corporate nexus liabilities and payroll penalties."
        ],
        why_it_matters: "Creating unintended corporate tax nexus in new states exposes companies to unexpected state corporate franchise taxes.",
        how_it_affects_you: "Human resources and payroll systems must synchronize worker physical addresses with payroll withholding schedules.",
        what_to_do_next: { action_type: "apply", guidance: "Review current employee remote locations and verify corresponding state payroll registrations." }
      }
    },
    {
      id: `edition-${edition}-4`,
      title: "Commercial Banking Covenants: Navigating Debt-to-EBITDA Thresholds",
      source_url: "https://bloomberg.com",
      target_role: role || "Finance Director",
      target_stack: ["Corporate Finance", "Banking"],
      priority: "brief",
      card_content: {
        what_happened: [
          "Commercial lenders tighten credit review covenants, demanding monthly compliance certification on leverage ratios.",
          "Technical covenant breaches trigger immediate loan re-pricing and mandatory collateral calls."
        ],
        why_it_matters: "Proactive communication and financial modeling preserve favorable borrowing rates with primary banking partners.",
        how_it_affects_you: "Finance heads should stress-test operating earnings against existing loan agreement covenant thresholds.",
        what_to_do_next: { action_type: "prepare", guidance: "Model quarterly EBITDA sensitivities against existing credit facility covenant ratios." }
      }
    },
    {
      id: `edition-${edition}-5`,
      title: "Automated Bank Reconciliations: API Integration with Real-Time Statements",
      source_url: "https://accountingtoday.com",
      target_role: role || "Bookkeeper",
      target_stack: ["Accounting Tech", "Bookkeeping"],
      priority: "brief",
      card_content: {
        what_happened: [
          "Direct open banking APIs eliminate manual CSV statement downloads and automate 95% of routine ledger matching.",
          "Unidentified bank charges and erroneous deposits are flagged within minutes of settlement."
        ],
        why_it_matters: "Reduces month-end closing timelines from 10 days to under 48 hours for fast-growing businesses.",
        how_it_affects_you: "Enabling direct bank feeds frees finance staff to focus on strategic cash management and forecasting.",
        what_to_do_next: { action_type: "apply", guidance: "Activate direct API bank statement synchronization within your primary accounting software." }
      }
    },
    {
      id: `edition-${edition}-6`,
      title: "R&D Tax Credits: Documenting Software Development & Process Improvements",
      source_url: "https://taxnotes.com",
      target_role: role || "Tax Accountant",
      target_stack: ["Tax Credits", "Corporate Planning"],
      priority: "brief",
      card_content: {
        what_happened: [
          "Statutory provisions allow substantial payroll tax offsets for technical wages invested in custom process automation.",
          "Requires contemporaneously recorded developer logs and technical sprint documentation to substantiate claims."
        ],
        why_it_matters: "Can offset up to $500,000 in annual employer payroll taxes for qualifying innovative mid-market enterprises.",
        how_it_affects_you: "Properly substantiating technical project hours converts internal development costs into immediate cash credits.",
        what_to_do_next: { action_type: "apply", guidance: "Review engineering and process automation logs to identify qualifying R&D tax credit activities." }
      }
    }
  ];
}

/* NEXT EDITIONS GENERATOR: RICH EDITORIAL ARCHITECTURE CARDS FOR INFINITE SCROLL */
function getNextEditionCards(edition: number, role: string, interests: string): BriefingCard[] {
  const cat = detectTopicCategory(interests, role);
  if (cat === "beauty_fashion") {
    return getBeautyFashionEditionCards(edition, role);
  }
  if (cat === "accounting_tax") {
    return getAccountingEditionCards(edition, role);
  }
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
        target_stack: ["Generative AI & LLMs", "SQL & Vector DB"],
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
        title: "Enterprise Generative AI: Structured Tool Calling & Output Grounding",
        source_url: "https://ai.google.dev",
        target_role: role || "AI Engineer",
        target_stack: ["Generative AI & LLMs", "AI Systems"],
        priority: "brief",
        card_content: {
          what_happened: [
            "Modern AI API frameworks introduce deterministic schema enforcement with response_schema and function declaration validation.",
            "Hallucination rates fall below 0.5% when combining function calling with retrieval grounding."
          ],
          why_it_matters: "Enterprise automation requires 100% parseable JSON payloads without Markdown formatting artifacts or hallucinated fields.",
          how_it_affects_you: "You can define Pydantic / JSON Schema models that the AI engine is mathematically constrained to conform to.",
          what_to_do_next: {
            action_type: "apply",
            guidance: "Adopt structured JSON schema generation in your AI prompt orchestration workflows."
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

