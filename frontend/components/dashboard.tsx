"use client";

import React, { useEffect, useState } from 'react';
import {
  useAppStore, browserTimeZone,
  type MedicationView, type Log, type Requirements, type FoodRequirement,
} from '../lib/store';
import { useGreeting } from '../lib/datetime';
import { apiFetch } from '../lib/api';
import { isWebBluetoothSupported } from '../lib/bluetooth';
import ConnectionCode from './connectioncode';
import { format, subDays, isSameDay, startOfWeek, addDays } from 'date-fns';
import { CheckCircle2, Clock, Activity, Bluetooth, BluetoothOff, AlertTriangle, Pill } from 'lucide-react';

/** True when two instants fall on the same calendar day in the given timezone. */
function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  return key(a) === key(b);
}

/** Splits a medication's next dose into a clock time + a small sublabel
 *  (AM/PM today, or the weekday when it falls on another day). */
function doseTimeParts(nextDue: string | null, tz: string, now: Date): { time: string; sub: string } {
  if (!nextDue) return { time: '—', sub: '' };
  const d = new Date(nextDue);
  const [time, meridiem] = d
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .split(' ');
  const sub = sameDayInTz(d, now, tz)
    ? (meridiem ?? '')
    : d.toLocaleDateString([], { weekday: 'short', timeZone: tz });
  return { time, sub };
}

/** Human "how soon" badge for a next dose, e.g. "in 25 min" / "Due now". */
function relativeToNow(nextDue: string | null, now: Date): string {
  if (!nextDue) return '';
  const mins = Math.round((new Date(nextDue).getTime() - now.getTime()) / 60_000);
  if (mins <= -1) return 'Overdue';
  if (mins <= 1) return 'Due now';
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

const FOOD_LABEL: Record<FoodRequirement, string | null> = {
  none: null,
  with_food: 'with food',
  without_food: 'on an empty stomach',
  before_meals: 'before meals',
  after_meals: 'after meals',
};

/** Concise dosing line from a med's requirements, e.g. "Twice daily · with food". */
function doseDetail(req: Requirements): string {
  const freq = req.dosesPerDay <= 1 ? 'Once daily' : req.dosesPerDay === 2 ? 'Twice daily' : `${req.dosesPerDay}× daily`;
  const food = FOOD_LABEL[req.foodRequirement];
  return food ? `${freq} · ${food}` : freq;
}

type DoseState = 'taken' | 'missed' | 'next' | 'later';

/** Today's resolved state for one medication, in the patient's timezone. */
function doseState(med: MedicationView, logs: Log[], tz: string, now: Date, isFocus: boolean): DoseState {
  const todayLog = logs.find(l => l.medicationId === med.id && sameDayInTz(l.timestamp, now, tz));
  if (todayLog?.status === 'taken') return 'taken';
  if (todayLog?.status === 'missed') return 'missed';
  return isFocus ? 'next' : 'later';
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
    remindMeCounts,
    deviceStatus,
    connectDevice,
    disconnectDevice,
  } = useAppStore();

  // Web Bluetooth only exists in Chrome/Edge/Opera on desktop + Android.
  const [bleSupported, setBleSupported] = useState(true);
  useEffect(() => {
    setBleSupported(isWebBluetoothSupported());
  }, []);

  const isConnecting = deviceStatus === 'connecting';
  const deviceConnected = deviceStatus === 'connected';

  const handleConnectDevice = () => {
    if (deviceConnected) {
      void disconnectDevice();
    } else {
      void connectDevice();
    }
  };

  // All dose times are anchored to the patient's timezone (set at onboarding,
  // editable in Schedule settings). We format every label in that zone so the
  // displayed time matches when they actually take the medication — regardless
  // of the device's own clock.
  const tz = scheduleView?.timezone || browserTimeZone();

  // Greeting + date + a once-a-minute clock, all anchored to the patient's
  // timezone so they match the rest of the dashboard and roll over on their own.
  const { greeting, date, now } = useGreeting(tz);
  const today = now ?? new Date();

  // Medications arrive ordered by next dose. The "focus" med is the soonest one
  // still awaiting a log today — it gets the hero card and the "Next" badge.
  const medications = scheduleView?.medications ?? [];
  const focusMed = medications.find(
    m => !logs.some(l => l.medicationId === m.id && sameDayInTz(l.timestamp, today, tz)),
  ) ?? null;

  // Conflicts surfaced across every medication (de-duplicated by message).
  const conflicts = Array.from(
    new Map(medications.flatMap(m => m.conflicts).map(c => [c.message, c])).values()
  );
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

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* Header & Device Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {/* Reserve the date line's height before mount so the header doesn't
              shift when the clock-derived labels appear. */}
          <p className="text-sm font-medium text-stone-500 min-h-[1.25rem]" title={`Times shown in ${tz.replace(/_/g, ' ')}`}>
            {date}
          </p>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight mt-0.5">
            {greeting ? `${greeting}, ` : ''}{userProfile?.name}
          </h1>
          <p className="text-stone-500 mt-1">
            {medications.length === 1
              ? `Your ${medications[0].name}`
              : `Tracking ${medications.length} medications`}
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1">
          <button
            onClick={handleConnectDevice}
            disabled={isConnecting || !bleSupported}
            title={
              bleSupported
                ? undefined
                : 'Use Chrome or Edge on desktop or Android to connect a device'
            }
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border disabled:opacity-60 disabled:cursor-not-allowed ${
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
            {isConnecting
              ? 'Connecting…'
              : deviceConnected
              ? 'attune connected'
              : 'Connect device'}
          </button>
          {!bleSupported && (
            <span className="text-xs text-stone-400">
              Bluetooth needs Chrome or Edge (desktop/Android)
            </span>
          )}
          {bleSupported && deviceStatus === 'error' && (
            <span className="text-xs text-danger">Couldn’t connect — try again</span>
          )}
        </div>
      </div>

      {/* Week strip */}
      <WeekStrip today={today} logs={logs} />

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

      {/* Hero — the soonest dose still due, or an all-clear once today is done */}
      {focusMed ? (
        <NextDoseCard
          med={focusMed}
          tz={tz}
          now={today}
          deviceConnected={deviceConnected}
          snoozeCount={remindMeCounts[focusMed.id] ?? 0}
          onTaken={() => logDose(focusMed.id, 'taken')}
          onSnooze={() => remindMeLater(focusMed.id)}
        />
      ) : medications.length > 0 ? (
        <AllCaughtUpCard count={medications.length} />
      ) : null}

      {/* Today's schedule */}
      {medications.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-semibold text-stone-900">Today&rsquo;s schedule</h2>
            <span className="text-sm text-stone-400">
              {medications.length} medication{medications.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="space-y-2.5">
            {medications.map(med => (
              <ScheduleRow
                key={med.id}
                med={med}
                tz={tz}
                now={today}
                state={doseState(med, logs, tz, today, med.id === focusMed?.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Adherence stats */}
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

            {/* Generate 28 days of heatmap blocks. Across all meds: a day is
                red if any dose was missed, green if any taken (and none missed),
                otherwise empty. */}
            {Array.from({ length: 28 }).map((_, i) => {
              const date = subDays(new Date(), 27 - i);
              const dayLogs = logs.filter(l => isSameDay(l.timestamp, date));
              const anyMissed = dayLogs.some(l => l.status === 'missed');
              const anyTaken = dayLogs.some(l => l.status === 'taken');

              let bgColor = 'bg-stone-100 border-stone-200'; // No data
              let label = 'No data';
              if (anyMissed) { bgColor = 'bg-danger border-rose-600'; label = 'Dose missed'; }
              else if (anyTaken) { bgColor = 'bg-tide-500 border-tide-600'; label = 'On track'; }

              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg border ${bgColor} transition-all hover:scale-110 cursor-default`}
                  title={`${format(date, 'MMM d')}: ${label}`}
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

/** The current week as a row of day chips, today highlighted, with a small
 *  adherence dot (taken / missed) under each day that has a log. */
function WeekStrip({ today, logs }: { today: Date; logs: Log[] }) {
  const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="grid grid-cols-7 gap-2 md:gap-3">
      {days.map((day, i) => {
        const active = isSameDay(day, today);
        const dayLogs = logs.filter(l => isSameDay(l.timestamp, day));
        const missed = dayLogs.some(l => l.status === 'missed');
        const taken = dayLogs.some(l => l.status === 'taken');
        const dot = missed
          ? (active ? 'bg-white' : 'bg-apricot-400')
          : taken
          ? (active ? 'bg-white' : 'bg-tide-400')
          : 'bg-transparent';

        return (
          <div
            key={i}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-colors ${
              active
                ? 'bg-tide-500 border-tide-500 shadow-[var(--shadow-brand)]'
                : 'bg-white border-stone-200'
            }`}
          >
            <span className={`text-[10px] font-mono uppercase tracking-wide ${active ? 'text-white/80' : 'text-stone-400'}`}>
              {format(day, 'EEE')}
            </span>
            <span className={`font-display text-base font-semibold ${active ? 'text-white' : 'text-stone-600'}`}>
              {format(day, 'd')}
            </span>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          </div>
        );
      })}
    </div>
  );
}

/** The hero "Next dose" card — gradient panel with a large clock readout,
 *  dosing detail, and the taken/snooze actions for the soonest-due med. */
function NextDoseCard({
  med, tz, now, deviceConnected, snoozeCount, onTaken, onSnooze,
}: {
  med: MedicationView;
  tz: string;
  now: Date;
  deviceConnected: boolean;
  snoozeCount: number;
  onTaken: () => void;
  onSnooze: () => void;
}) {
  const { time, sub } = doseTimeParts(med.nextDue, tz, now);
  const relative = relativeToNow(med.nextDue, now);
  const reason = med.schedule.reason;

  return (
    <div className="relative overflow-hidden rounded-3xl p-7 md:p-8 text-white shadow-[var(--shadow-brand)] bg-[linear-gradient(150deg,#16A89A_0%,#0E7C71_100%)]">
      <Activity className="absolute -right-8 -bottom-12 w-52 h-52 text-white/10" strokeWidth={2} />

      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white/90">
          <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.22)] animate-breathe" />
          Next dose{relative && ` · ${relative}`}
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-5xl md:text-6xl font-semibold leading-none tracking-tight">{time}</span>
          {sub && <span className="font-mono text-lg text-white/80">{sub}</span>}
        </div>

        <h2 className="mt-4 text-xl md:text-2xl font-bold text-white flex items-center gap-2">
          <Pill className="w-5 h-5 text-white/90" />
          {med.name}
        </h2>
        <p className="mt-1 text-sm text-white/80">{doseDetail(med.requirements)}</p>
        {reason && <p className="mt-2 max-w-md text-sm text-white/70">{reason}</p>}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onTaken}
            className="flex-1 sm:flex-none sm:min-w-52 h-12 rounded-2xl bg-white px-6 font-semibold text-tide-700 shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            Mark as taken
          </button>
          <button
            onClick={onSnooze}
            className="h-12 rounded-2xl border-[1.5px] border-white/45 px-6 font-medium text-white transition-colors hover:bg-white/15 flex items-center justify-center gap-2"
          >
            <Clock className="w-5 h-5" />
            Snooze{snoozeCount > 0 && ` (${snoozeCount}/3)`}
          </button>
        </div>

        {deviceConnected && (
          <p className="mt-3 text-xs text-white/70">
            Or press the button on your attune device.
          </p>
        )}
      </div>
    </div>
  );
}

/** Shown once every medication has been logged for the day. */
function AllCaughtUpCard({ count }: { count: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-7 md:p-8 text-white shadow-[var(--shadow-brand)] bg-[linear-gradient(150deg,#16A89A_0%,#0E7C71_100%)]">
      <Activity className="absolute -right-8 -bottom-12 w-52 h-52 text-white/10" strokeWidth={2} />
      <div className="relative z-10 flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold">All caught up</h2>
          <p className="mt-1 text-sm text-white/80">
            {count === 1 ? "Today's dose is logged." : `All ${count} of today's medications are logged.`} Nicely in rhythm.
          </p>
        </div>
      </div>
    </div>
  );
}

const ROW_BADGE: Record<DoseState, { label: string; cls: string }> = {
  taken:  { label: 'Taken',  cls: 'bg-success-subtle text-success' },
  missed: { label: 'Missed', cls: 'bg-danger-subtle text-danger' },
  next:   { label: 'Next',   cls: 'bg-apricot-100 text-apricot-600' },
  later:  { label: 'Later',  cls: 'bg-stone-100 text-stone-500' },
};

/** One medication row in "Today's schedule": time · name + dosing · status. */
function ScheduleRow({
  med, tz, now, state,
}: {
  med: MedicationView;
  tz: string;
  now: Date;
  state: DoseState;
}) {
  const { time, sub } = doseTimeParts(med.nextDue, tz, now);
  const badge = ROW_BADGE[state];
  // The soonest pending dose gets a warm border to echo the showcase.
  const highlight = state === 'next';

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 ${
        highlight ? 'border-apricot-200 shadow-[var(--shadow-sm)]' : 'border-stone-200'
      }`}
    >
      <div className="w-12 shrink-0 text-center">
        <div className="font-mono text-sm font-semibold text-stone-900">{time}</div>
        {sub && <div className="font-mono text-[10px] uppercase text-stone-400">{sub}</div>}
      </div>
      <div className={`h-9 w-px shrink-0 ${highlight ? 'bg-apricot-200' : 'bg-stone-200'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-stone-900">{med.name}</div>
        <div className="truncate text-xs text-stone-500">{doseDetail(med.requirements)}</div>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
        {badge.label}
      </span>
    </div>
  );
}

