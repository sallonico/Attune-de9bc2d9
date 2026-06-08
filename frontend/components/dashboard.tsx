"use client";

import React, { useEffect, useState } from 'react';
import { useAppStore, browserTimeZone } from '../lib/store';
import { apiFetch } from '../lib/api';
import ConnectionCode from './connectioncode';
import { format, subDays, isSameDay } from 'date-fns';
import { CheckCircle2, XCircle, Clock, Activity, Bluetooth, BluetoothOff, AlertTriangle } from 'lucide-react';

/** True when two instants fall on the same calendar day in the given timezone. */
function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  return key(a) === key(b);
}

/** A ticking "current date & time" in the patient's timezone. */
function LiveClock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null); // null until mounted (avoids SSR/client mismatch)
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz });
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: tz });
  return (
    <div className="flex items-center gap-2 text-sm text-stone-500" title={`Times shown in ${tz.replace(/_/g, ' ')}`}>
      <Clock className="w-4 h-4 text-tide-600" />
      <span className="text-stone-600">{date}</span>
      <span className="text-stone-900 font-medium font-mono tabular-nums">{time}</span>
    </div>
  );
}

interface TrendResponse {
  days: number;
  takenCount: number;
  totalCount: number;
  trendPercentage: number;
}

export default function Dashboard() {
  const {
    userProfile,
    scheduleView,
    logs,
    logDose,
    remindMeLater,
    remindMeCount,
    deviceConnected,
    toggleDeviceConnection
  } = useAppStore();

  const [isConnecting, setIsConnecting] = useState(false);

  // All dose times are anchored to the patient's timezone (set at onboarding,
  // editable in Schedule settings). We format every label in that zone so the
  // displayed time matches when they actually take the medication — regardless
  // of the device's own clock.
  const tz = scheduleView?.timezone || browserTimeZone();

  // Friendly "next dose" from the resolved schedule, falling back to the
  // legacy flat time if the schedule view hasn't loaded yet.
  const nextDoseLabel = (() => {
    if (scheduleView?.nextDue) {
      const d = new Date(scheduleView.nextDue);
      const today = sameDayInTz(d, new Date(), tz);
      const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
      return today ? t : `${d.toLocaleDateString([], { weekday: 'short', timeZone: tz })} ${t}`;
    }
    return userProfile?.scheduleTime ?? '—';
  })();
  const conflicts = scheduleView?.conflicts ?? [];
  const scheduleReason = scheduleView?.schedule.reason;
  const [trendPercentage, setTrendPercentage] = useState(0);

  // Server-side trend (refreshes whenever logs change)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await apiFetch<TrendResponse>('/stats/trend?days=30');
        if (!cancelled) setTrendPercentage(t.trendPercentage);
      } catch {
        if (!cancelled) setTrendPercentage(0);
      }
    })();
    return () => { cancelled = true; };
  }, [logs.length]);

  // Check if today's dose is taken — "today" as seen in the patient's timezone.
  const todayLog = logs.find(log => sameDayInTz(log.timestamp, new Date(), tz));
  const isTakenToday = todayLog?.status === 'taken';
  const isMissedToday = todayLog?.status === 'missed';

  const handleConnectDevice = () => {
    setIsConnecting(true);
    // Simulate connection attempt
    setTimeout(() => {
      setIsConnecting(false);
      toggleDeviceConnection();
    }, 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Header & Device Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">
            Hello, {userProfile?.name}
          </h1>
          <p className="text-stone-500 mt-1">
            Your {userProfile?.medication} — next dose {nextDoseLabel}
          </p>
          <div className="mt-2">
            <LiveClock tz={tz} />
          </div>
        </div>

        <button
          onClick={handleConnectDevice}
          disabled={isConnecting}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
            deviceConnected
              ? 'bg-tide-50 text-tide-700 border-tide-200 hover:bg-tide-100'
              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
          }`}
        >
          {isConnecting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : deviceConnected ? (
            <Bluetooth className="w-4 h-4" />
          ) : (
            <BluetoothOff className="w-4 h-4" />
          )}
          {isConnecting ? 'Connecting…' : deviceConnected ? 'attune connected' : 'Connect device'}
        </button>
      </div>

      {/* Schedule conflict warnings */}
      {conflicts.length > 0 && (
        <div className="bg-warning-subtle border border-warning/30 rounded-2xl p-4 space-y-2">
          {conflicts.map((c, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Primary Action Card — brand fill for emphasis */}
      <div className="relative overflow-hidden bg-tide-500 rounded-3xl p-8 shadow-[var(--shadow-brand)]">
        <div className="absolute -right-10 -bottom-16 text-white/10">
          <Activity className="w-56 h-56" strokeWidth={2.4} />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-sm text-white/90 mb-4">
              {!isTakenToday && !isMissedToday && (
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-breathe" />
              )}
              Next dose · {nextDoseLabel}
            </div>
            {scheduleReason && (
              <p className="text-xs text-white/70 mb-4 max-w-md mx-auto md:mx-0">{scheduleReason}</p>
            )}

            {isTakenToday ? (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center justify-center md:justify-start gap-3">
                  <CheckCircle2 className="w-8 h-8" />
                  Dose taken
                </h2>
                <p className="text-white/80">Nice — you&apos;re on track for today.</p>
              </div>
            ) : isMissedToday ? (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center justify-center md:justify-start gap-3">
                  <XCircle className="w-8 h-8" />
                  Looks like it slipped by
                </h2>
                <p className="text-white/80">It happens. We&apos;ll keep the rhythm going tomorrow.</p>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  Time for your dose
                </h2>
                <p className="text-white/80">
                  {deviceConnected
                    ? "Press the button on your attune device, or mark it here."
                    : "Mark it below and we'll keep your rhythm going."}
                </p>
              </div>
            )}
          </div>

          {!isTakenToday && !isMissedToday && (
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <button
                onClick={() => logDose('taken')}
                className="bg-white text-tide-700 px-8 py-4 rounded-2xl font-semibold shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] active:scale-[0.98] transition-all duration-200 w-full md:w-64 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Mark as taken
              </button>

              <button
                onClick={remindMeLater}
                className="px-8 py-4 rounded-2xl font-medium text-white bg-white/15 hover:bg-white/25 transition-all w-full md:w-64 flex items-center justify-center gap-2"
              >
                <Clock className="w-5 h-5" />
                Snooze {remindMeCount > 0 && `(${remindMeCount}/3)`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Insight (The Aha Moment) */}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trend Score */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-[var(--shadow-sm)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-stone-500 font-medium">30-day trend</h3>
            <Activity className="w-5 h-5 text-tide-600" />
          </div>
          <div className="flex items-end gap-4">
            <span className="text-6xl font-bold text-stone-900 font-mono tracking-tighter">
              {trendPercentage}%
            </span>
            <span className="text-stone-500 mb-2">adherence</span>
          </div>
          <div className="mt-6 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-tide-500 rounded-full transition-all duration-1000"
              style={{ width: `${trendPercentage}%` }}
            />
          </div>
        </div>

        {/* 4-Week Heatmap */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-stone-500 font-medium">Recent rhythm</h3>
            <span className="text-xs text-stone-400">Last 28 days</span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-xs text-stone-400 font-medium mb-2">{day}</div>
            ))}

            {/* Generate 28 days of heatmap blocks */}
            {Array.from({ length: 28 }).map((_, i) => {
              const date = subDays(new Date(), 27 - i);
              const log = logs.find(l => isSameDay(l.timestamp, date));

              let bgColor = 'bg-stone-100 border-stone-200'; // No data
              if (log?.status === 'taken') bgColor = 'bg-tide-500 border-tide-600';
              if (log?.status === 'missed') bgColor = 'bg-danger border-rose-600';

              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg border ${bgColor} transition-all hover:scale-110 cursor-default`}
                  title={`${format(date, 'MMM d')}: ${log ? log.status : 'No data'}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Caregiver connection code */}
      <ConnectionCode />

    </div>
  );
}

