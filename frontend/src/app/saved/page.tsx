"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, Info, Trash2, ArrowLeft } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { HeaderActions } from "@/components/HeaderActions";
import { CardDrawer } from "@/components/CardDrawer";
import { ActionBadge } from "@/components/cards/ActionBadge";
import { useAuth } from "@/context/AuthContext";
import { useLoader } from "@/context/LoadingContext";
import { apiFetch } from "@/lib/api";
import { resolveUserIdentity } from "@/lib/identity";
import { BriefingCard } from "@/types/card";

interface SavedCardsApiResponse {
  items: BriefingCard[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

const PAGE_LIMIT = 10;

export default function SavedPage() {
  const router = useRouter();
  const { user, isAnonymous, me, signOut } = useAuth();
  const { showLoader, hideLoader } = useLoader();

  const [cards, setCards] = useState<BriefingCard[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [drawerCard, setDrawerCard] = useState<BriefingCard | null>(null);

  const userIdentity = resolveUserIdentity({
    user,
    isAnonymous,
    me,
  });

  useEffect(() => {
    let active = true;
    showLoader();
    apiFetch<SavedCardsApiResponse>(
      `/api/saved?page=${currentPage}&limit=${PAGE_LIMIT}`
    )
      .then((data) => {
        if (active && data && Array.isArray(data.items)) {
          setCards(data.items);
          setTotal(data.total);
          setHasMore(data.has_more);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Failed to load saved cards:", err);
          setCards([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          hideLoader();
        }
      });

    return () => {
      active = false;
    };
  }, [currentPage, showLoader, hideLoader]);

  const handleUnsave = async (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic removal
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setTotal((prev) => Math.max(0, prev - 1));

    try {
      await apiFetch(`/api/cards/${cardId}/save`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to unsave card:", err);
      // Reload on failure
      apiFetch<SavedCardsApiResponse>(
        `/api/saved?page=${currentPage}&limit=${PAGE_LIMIT}`
      ).then((data) => {
        if (data && Array.isArray(data.items)) {
          setCards(data.items);
          setTotal(data.total);
          setHasMore(data.has_more);
        }
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <RequireAuth>
      <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#070b12] text-slate-800 dark:text-slate-100 font-sans flex flex-col transition-colors duration-200">
        {/* Header */}
        <header className="bg-slate-950 text-slate-200 py-2.5 sm:py-3 px-3 sm:px-6 border-b border-slate-800 shadow-md sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="hover:opacity-85 transition-opacity">
                <span className="font-serif text-xl sm:text-2xl font-black tracking-widest text-white uppercase drop-shadow-xs">
                  B E C O N
                </span>
              </Link>
              <span className="text-slate-400 font-bold text-xs border-l border-slate-700 pl-3 tracking-widest uppercase font-mono hidden md:inline">
                SAVED CARDS
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono">
              <HeaderActions
                identity={userIdentity}
                email={user?.email}
                currentPage="saved"
                backLink={{
                  href: "/",
                  label: "Gazette",
                  ariaLabel: "Return to Gazette",
                }}
                onSignOut={async () => {
                  await signOut();
                  router.push("/login");
                }}
              />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main id="main-content" className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-mono text-xs uppercase tracking-wider font-bold mb-1">
                <Bookmark className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>Personal Library</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-serif text-slate-950 dark:text-slate-50 tracking-tight">
                Saved Intelligence Cards
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 font-mono">
                {total} bookmark{total === 1 ? "" : "s"} saved for technical review and reference.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-400 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 transition-colors w-fit"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Gazette</span>
            </Link>
          </div>

          {/* Cards List */}
          <div className="py-6">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse h-32"
                  />
                ))}
              </div>
            ) : cards.length === 0 ? (
              <div data-testid="empty-saved-cards" className="text-center py-16 px-4 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                  <Bookmark className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-black text-lg text-slate-900 dark:text-slate-100">
                  No saved cards yet
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto font-mono">
                  Bookmark stories from your morning briefing to preserve them in your personal reference stack.
                </p>
                <div className="pt-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-950 dark:bg-amber-400 text-white dark:text-slate-950 text-xs font-mono font-bold tracking-wider uppercase transition-all shadow-sm"
                  >
                    Browse Gazette
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4" data-testid="saved-cards-list">
                {cards.map((card) => (
                  <article
                    key={card.id}
                    data-testid="saved-card-item"
                    onClick={() => setDrawerCard(card)}
                    className="group p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 shadow-2xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {card.target_stack.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          >
                            <span className="text-slate-400 font-mono text-[9px]">/</span>
                            <span>{tag.replace(/^#/, "").trim()}</span>
                          </span>
                        ))}
                        {card.published_at && (
                          <span className="text-[11px] font-mono text-slate-400">
                            {card.published_at}
                          </span>
                        )}
                        {card.card_content?.what_to_do_next && (
                          <ActionBadge actionType={card.card_content.what_to_do_next.action_type} />
                        )}
                      </div>

                      <h3 className="font-serif font-black text-base sm:text-lg text-slate-950 dark:text-slate-50 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug">
                        {card.title}
                      </h3>

                      {card.card_content?.why_it_matters && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {card.card_content.why_it_matters}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        data-testid="unsave-card-button"
                        onClick={(e) => handleUnsave(card.id, e)}
                        aria-label="Remove from saved"
                        title="Remove bookmark"
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawerCard(card);
                        }}
                        aria-label="View details"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button>

                      <a
                        href={card.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Read original source"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-amber-300 font-mono text-xs font-bold border border-slate-800 dark:border-slate-700 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Finite Pagination Controls (no infinite scroll) */}
            {totalPages > 1 && (
              <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">
                  Page {currentPage} of {totalPages} ({total} items)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="pagination-prev"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    data-testid="pagination-next"
                    disabled={!hasMore && currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Card Drawer */}
        <CardDrawer
          card={drawerCard}
          isOpen={Boolean(drawerCard)}
          onClose={() => setDrawerCard(null)}
        />
      </div>
    </RequireAuth>
  );
}
