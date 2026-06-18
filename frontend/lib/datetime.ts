"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day helpers for the dashboard greeting and date.
 *
 * Everything is derived from the runtime system clock — never hardcoded — and
 * formatted with the Intl APIs so it stays locale- and timezone-aware. The
 * `useGreeting` hook re-derives its labels each minute so a tab left open past
 * midnight (or across a greeting boundary) updates on its own.
 */

export type GreetingPeriod = "morning" | "afternoon" | "evening";

const GREETINGS: Record<GreetingPeriod, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** Hour (0–23) at `date` within `timeZone`, or device-local when omitted. */
function hourInTimeZone(date: Date, timeZone?: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(date);
  // Some engines render midnight as "24"; normalize back to 0.
  return Number(hour) % 24;
}

export function greetingPeriod(date: Date, timeZone?: string): GreetingPeriod {
  const hour = hourInTimeZone(date, timeZone);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** "Good morning" | "Good afternoon" | "Good evening" for `date`. */
export function getGreeting(date: Date, timeZone?: string): string {
  return GREETINGS[greetingPeriod(date, timeZone)];
}

/** Locale-aware long date, e.g. "Thursday, June 18, 2026". */
export function formatLongDate(
  date: Date,
  timeZone?: string,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

/**
 * Current time as a Date, refreshed on each minute boundary. Returns `null`
 * until mounted so server and client render the same markup (no hydration
 * mismatch from a clock that only exists in the browser).
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    let timeout: ReturnType<typeof setTimeout>;
    const scheduleNextTick = () => {
      // Land just after the next minute boundary so midnight/greeting rollovers
      // are reflected promptly instead of up to a minute late.
      const msToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
      timeout = setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, msToNextMinute);
    };
    scheduleNextTick();

    return () => clearTimeout(timeout);
  }, []);

  return now;
}

export interface GreetingInfo {
  /** Instant the labels were derived from; `null` before mount. */
  now: Date | null;
  /** e.g. "Good morning"; `null` before mount. */
  greeting: string | null;
  /** e.g. "Thursday, June 18, 2026"; `null` before mount. */
  date: string | null;
}

/**
 * Greeting + locale-aware long date that stay correct as time passes.
 *
 * @param timeZone IANA zone to anchor the labels to (defaults to device-local).
 * @param locale   BCP-47 locale for formatting (defaults to the browser locale).
 */
export function useGreeting(timeZone?: string, locale?: string): GreetingInfo {
  const now = useNow();
  return {
    now,
    greeting: now ? getGreeting(now, timeZone) : null,
    date: now ? formatLongDate(now, timeZone, locale) : null,
  };
}
