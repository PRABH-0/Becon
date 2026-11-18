"use client";

import React, { useState } from "react";
import { User } from "lucide-react";
import { sanitizeHttpsUrl } from "@/lib/identity";

export interface UserAvatarProps {
  src?: string | null;
  name: string;
  isGuest?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "w-6 h-6 text-[11px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
};

const ICON_SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

/**
 * Displays an https-only user avatar image with referrerPolicy="no-referrer",
 * falling back cleanly via React state (no DOM mutation) to the user's initial,
 * or a generic User icon for guests.
 */
export function UserAvatar({
  src,
  name,
  isGuest = false,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const safeSrc = isGuest ? null : sanitizeHttpsUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showImage = Boolean(safeSrc && failedSrc !== safeSrc);
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full bg-slate-800 text-white border border-slate-700/60 font-bold flex items-center justify-center shrink-0 overflow-hidden select-none ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- OAuth avatars come from arbitrary external https hosts (Google, etc.) and require referrerPolicy="no-referrer" + React-state error fallback
        <img
          src={safeSrc!}
          alt={name}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover rounded-full"
          onError={() => setFailedSrc(safeSrc)}
        />
      ) : isGuest ? (
        <User className={ICON_SIZE_CLASSES[size]} aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}

export interface UserChipProps {
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  isGuest?: boolean;
  size?: "sm" | "md";
  tone?: "light" | "dark";
  showGuestBadge?: boolean;
  className?: string;
}

/**
 * Compact user identity chip (UserAvatar + display name + subtitle).
 * Renders all identity strings strictly as plain text.
 */
export function UserChip({
  name,
  subtitle,
  avatarUrl,
  isGuest = false,
  size = "md",
  tone = "light",
  showGuestBadge = false,
  className = "",
}: UserChipProps) {
  const nameClass =
    tone === "dark"
      ? "text-slate-100"
      : "text-slate-900 dark:text-slate-100";
  const subtitleClass =
    tone === "dark"
      ? "text-slate-400"
      : "text-slate-500 dark:text-slate-400";

  return (
    <div className={`flex items-center gap-2.5 min-w-0 font-sans ${className}`}>
      <UserAvatar src={avatarUrl} name={name} isGuest={isGuest} size={size} />
      <div className="min-w-0 flex-1">
        <div className={`font-semibold text-xs truncate flex items-center gap-1.5 ${nameClass}`}>
          <span className="truncate">{name}</span>
          {showGuestBadge && isGuest && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-400/15 text-amber-600 dark:text-amber-400 border border-amber-400/30 uppercase font-bold tracking-wide shrink-0">
              Guest
            </span>
          )}
        </div>
        {subtitle && (
          <div className={`text-[11px] truncate ${subtitleClass}`}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
