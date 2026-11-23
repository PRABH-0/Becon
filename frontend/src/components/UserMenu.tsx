"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, BookOpen, ChevronDown, LogOut, User, UserPlus } from "lucide-react";
import { UserAvatar, UserChip } from "@/components/UserAvatar";
import type { ResolvedUserIdentity } from "@/lib/identity";

export type UserMenuPage = "home" | "profile" | "about" | "saved";

export interface UserMenuProps {
  identity: ResolvedUserIdentity;
  /** User's email address displayed in the menu header for non-guests (falls back to identity.subtitle). */
  email?: string | null;
  /** Highlights the matching navigation item with aria-current="page". */
  currentPage?: UserMenuPage;
  /** Existing sign-out callback (purges caches while preserving becon_theme and redirects to /login). */
  onSignOut: () => Promise<void> | void;
  className?: string;
}

export function UserMenu({
  identity,
  email,
  currentPage,
  onSignOut,
  className = "",
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const closeMenu = useCallback((returnFocus = false) => {
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const getMenuItems = useCallback((): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
  }, []);

  // Close on outside click or global Escape while open
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu(false);
      }
    };

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen, closeMenu]);

  // Keyboard navigation inside menu: Escape, ArrowUp/ArrowDown, Home/End, Tab
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
      return;
    }

    if (e.key === "Tab") {
      closeMenu(false);
      return;
    }

    const items = getMenuItems();
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex =
        currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      items[prevIndex]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        requestAnimationFrame(() => {
          const items = getMenuItems();
          if (e.key === "ArrowUp") {
            items[items.length - 1]?.focus();
          } else {
            items[0]?.focus();
          }
        });
      }
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      closeMenu(true);
    }
  };

  const handleSignOutClick = async () => {
    closeMenu(false);
    await onSignOut();
  };

  const triggerLabel = identity.isGuest ? "Guest" : identity.firstName;
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  const menuSubtitle = cleanEmail || identity.subtitle;

  const itemBaseClass =
    "group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-800";

  const activeItemClass =
    "bg-slate-100 dark:bg-slate-800/90 text-slate-950 dark:text-amber-300 font-semibold";
  const inactiveItemClass =
    "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800";

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Profile Menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className="group h-9 inline-flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-500 text-white px-2 sm:px-2.5 rounded-lg transition-all shadow-xs hover:shadow-md cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-amber-400/70"
      >
        <UserAvatar
          src={identity.avatarUrl}
          name={identity.displayName}
          isGuest={identity.isGuest}
          size="sm"
          className="ring-1 ring-white/10 border-transparent"
        />
        <span className="font-semibold text-xs text-slate-200 tracking-tight hidden sm:inline max-w-[100px] truncate font-sans">
          {triggerLabel}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ease-in-out shrink-0 ${
            isOpen ? "rotate-180 text-amber-400 group-hover:text-amber-400" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="User menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full mt-2 w-[264px] max-w-[280px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/15 dark:shadow-black/60 rounded-xl p-1.5 z-50 text-slate-800 dark:text-slate-200 font-sans select-none"
        >
          {/* User Identity Header (signed-in) OR Create Account CTA (guest) */}
          {identity.isGuest ? (
            <div className="py-0.5">
              <Link
                href="/register?upgrade=1"
                role="menuitem"
                tabIndex={-1}
                onClick={() => closeMenu(false)}
                className="group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 focus:outline-none focus:bg-amber-50 dark:focus:bg-amber-950/30 transition-colors"
              >
                <UserPlus className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span>Create account</span>
              </Link>
            </div>
          ) : (
            <div className="px-3 py-2.5">
              <UserChip
                name={identity.displayName}
                subtitle={menuSubtitle}
                subtitleTitle={menuSubtitle}
                avatarUrl={identity.avatarUrl}
                isGuest={false}
                size="md"
              />
            </div>
          )}

          <div role="separator" className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

          {/* Navigation Items */}
          <div className="space-y-0.5">
            <Link
              href="/saved"
              role="menuitem"
              tabIndex={-1}
              aria-current={currentPage === "saved" ? "page" : undefined}
              onClick={() => closeMenu(false)}
              className={`${itemBaseClass} ${
                currentPage === "saved" ? activeItemClass : inactiveItemClass
              }`}
            >
              <Bookmark
                aria-hidden="true"
                className={`w-4 h-4 shrink-0 transition-colors ${
                  currentPage === "saved"
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                }`}
              />
              <span>Saved Cards</span>
            </Link>

            <Link
              href="/profile"
              role="menuitem"
              tabIndex={-1}
              aria-current={currentPage === "profile" ? "page" : undefined}
              onClick={() => closeMenu(false)}
              className={`${itemBaseClass} ${
                currentPage === "profile" ? activeItemClass : inactiveItemClass
              }`}
            >
              <User
                aria-hidden="true"
                className={`w-4 h-4 shrink-0 transition-colors ${
                  currentPage === "profile"
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                }`}
              />
              <span>Profile &amp; Settings</span>
            </Link>

            <Link
              href="/about"
              role="menuitem"
              tabIndex={-1}
              aria-current={currentPage === "about" ? "page" : undefined}
              onClick={() => closeMenu(false)}
              className={`${itemBaseClass} ${
                currentPage === "about" ? activeItemClass : inactiveItemClass
              }`}
            >
              <BookOpen
                aria-hidden="true"
                className={`w-4 h-4 shrink-0 transition-colors ${
                  currentPage === "about"
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                }`}
              />
              <span>About Becon</span>
            </Link>
          </div>

          <div role="separator" className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

          {/* Quiet Rose Text Sign Out */}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={handleSignOutClick}
            className="group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 focus:outline-none focus:bg-rose-50 dark:focus:bg-rose-950/30 transition-colors text-left cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
