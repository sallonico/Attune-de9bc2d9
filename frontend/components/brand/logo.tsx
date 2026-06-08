import React from "react";

/**
 * The Attune mark — a capsule split into Tide/Apricot halves bridged by a
 * rhythm pulse. The one brand-specific glyph; use it for app chrome and
 * "rhythm/adherence" contexts.
 */
export function AttuneMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Attune"
      className={className}
    >
      <path d="M58.5 40 L38 40 A20 20 0 0 0 38 80 L58.5 80 Z" fill="#14A394" />
      <path d="M61.5 40 L82 40 A20 20 0 0 1 82 80 L61.5 80 Z" fill="#E26A39" />
      <path
        d="M26 60 L47 60 L53 49 L60 71 L67 60 L94 60"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Mark in a soft rounded tile (warm card surface), the way it sits in the
 * app header and auth/onboarding screens.
 */
export function AttuneLogo({
  showWordmark = true,
  className,
}: {
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-900 shadow-[var(--shadow-sm)]">
        <AttuneMark size={26} />
      </span>
      {showWordmark && (
        <span className="font-display text-xl font-bold lowercase tracking-tight text-stone-900">
          attune
        </span>
      )}
    </div>
  );
}
