"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { BriefingCard } from "@/types/card";
import { useAuth } from "@/context/AuthContext";
import { useLoader } from "@/context/LoadingContext";
import { apiFetch } from "@/lib/api";
import { recordMetric } from "@/lib/metrics";
import { syncIdentityCache } from "@/lib/cache";
import { resolveUserIdentity } from "@/lib/identity";

const BRIEFING_MAX_CARDS = 10;

function getBriefingsCacheKey(userId?: string | number): string {
  return `becon_briefings_${userId || "guest"}`;
}

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
  "Modern Software Systems & Tech Innovation",
];

export function getDailyBeconHeading(interests?: string[], role?: string): string {
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
        "Market Intelligence & Executive Signals",
      ];
      return `${topicStr} // ${ANGLES[dayOfYear % ANGLES.length]}`;
    }
  }

  if (role && role.trim() && role.toLowerCase() !== "professional" && role.toLowerCase() !== "user") {
    return `${role.toUpperCase()} EXECUTIVE DISPATCH // ${DAILY_BECON_THEMES[dayOfYear % DAILY_BECON_THEMES.length]}`;
  }

  return DAILY_BECON_THEMES[dayOfYear % DAILY_BECON_THEMES.length];
}

export function useBriefing() {
  const { user, me, isAnonymous, signOut } = useAuth();
  const { hideLoader } = useLoader();

  const [dailyHeading, setDailyHeading] = useState<string>(() => getDailyBeconHeading());
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

  // Dynamic Reading Time Estimate across active cards (~150-200 words per minute)
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

  // Initial local storage hydration
  useEffect(() => {
    hideLoader();
    const cachedName = localStorage.getItem("becon_user_name");
    const cachedCards = localStorage.getItem(getBriefingsCacheKey(user?.id));
    queueMicrotask(() => {
      if (cachedName) setUserName(cachedName);
      if (cachedCards) {
        try {
          const parsed = JSON.parse(cachedCards);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBriefings(parsed);
            setLoading(false);
          }
        } catch {}
      }
    });
  }, [hideLoader, user?.id]);

  const fetchAllBriefings = useCallback(
    async (forceRefresh = false, profile: { role?: string; interests?: string; customPrompt?: string } | null = null) => {
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
          recordMetric("briefing_viewed", { count: mappedTop.length, scope: "top" });
          try {
            localStorage.setItem(getBriefingsCacheKey(user?.id), JSON.stringify(mappedTop));
          } catch {}
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

        // Clear briefings when API returns empty array
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
    },
    [userRole, userInterests, customPrompt, hideLoader, user]
  );

  // Profile & Briefing loading on user state change
  useEffect(() => {
    if (!user) return;

    const fetchProfileAndBriefings = async () => {
      hideLoader();
      try {
        const profile = await apiFetch<{
          name?: string;
          email?: string;
          role?: string;
          picture_url?: string;
          auth_provider?: string;
          interests?: string;
          customPrompt?: string;
        }>("/api/profile");
        if (profile) {
          if (profile.name) setUserName(profile.name);
          if (profile.email) setUserEmail(profile.email);
          if (profile.role) setUserRole(profile.role);
          if (profile.picture_url) setUserAvatar(profile.picture_url);
          const guestFlag = profile.auth_provider === "guest" || isAnonymous;
          if (guestFlag) setIsGuest(true);

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

          // Incomplete profile: fetch default cold-start briefings without bouncing to setup
          fetchAllBriefings(false, profile);
        }
      } catch (err) {
        console.error("Error fetching profile", err);
        fetchAllBriefings();
      }
    };

    fetchProfileAndBriefings();
  }, [user, me, isAnonymous, hideLoader, fetchAllBriefings]);

  const todayDate = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, []);

  return {
    briefings,
    setBriefings,
    loading,
    loadingRemaining,
    dailyHeading,
    readingTimeMinutes,
    userName,
    userEmail,
    userRole,
    userInterests,
    userIdentity,
    drawerCard,
    setDrawerCard,
    todayDate,
    signOut,
    fetchAllBriefings,
  };
}
