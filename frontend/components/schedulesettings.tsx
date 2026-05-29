"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore, TimeWindow } from '../lib/store';
import {
  Clock, CalendarDays, AlertTriangle, Plus, Trash2, Utensils, Sun,
  Sunrise, Sunset, Moon, CalendarOff, Pause, ArrowRightLeft, Check,
} from 'lucide-react';

const DAY_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0=Mon..6=Sun
const WINDOW_ICON: Record<TimeWindow, React.ReactNode> = {
  morning: <Sunrise className="w-4 h-4" />,
  afternoon: <Sun className="w-4 h-4" />,
  evening: <Sunset className="w-4 h-4" />,
  night: <Moon className="w-4 h-4" />,
};

function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const card = 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6';
const inputCls = 'bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 [color-scheme:dark]';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:shadow-lg hover:shadow-teal-500/30 transition-all disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors';

export default function ScheduleSettings() {
  const {
    userProfile, scheduleView, refreshSchedule,
    saveSchedule, saveRoutine,
    addDayOverride, removeDayOverride, addDateOverride, removeDateOverride,
  } = useAppStore();

  useEffect(() => { if (!scheduleView) void refreshSchedule(); }, [scheduleView, refreshSchedule]);

  if (!scheduleView) {
    return (
      <div className="flex items-center gap-3 text-slate-400 py-16 justify-center">
        <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
        Loading your schedule…
      </div>
    );
  }

  const { schedule, routine, nextDue, upcoming, conflicts } = scheduleView;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Schedule</h1>
        <p className="text-slate-400 mt-1">
          {userProfile?.medication} · next dose {nextDue ? new Date(nextDue).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}
        </p>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
          {conflicts.map((c, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      <DefaultScheduleCard schedule={schedule} onSave={saveSchedule} />
      <DayOverridesCard schedule={schedule} onAdd={addDayOverride} onRemove={removeDayOverride} />
      <DateOverridesCard onAdd={addDateOverride} onRemove={removeDateOverride} overrides={schedule.dateOverrides} />
      <RoutineCard routine={routine} onSave={saveRoutine} />
      <UpcomingCard upcoming={upcoming} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
function DefaultScheduleCard({
  schedule, onSave,
}: {
  schedule: import('../lib/store').Schedule;
  onSave: (b: { time: string; daysOfWeek: number[]; window: TimeWindow | null; reason: string | null; source: 'ai' | 'user'; rxcui: string | null }) => Promise<void>;
}) {
  const [time, setTime] = useState(schedule.time);
  const [days, setDays] = useState<number[]>(schedule.daysOfWeek);
  const [source, setSource] = useState<'ai' | 'user'>(schedule.source);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (d: number) => setDays(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort()));
  const dirty = time !== schedule.time || JSON.stringify(days) !== JSON.stringify(schedule.daysOfWeek);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ time, daysOfWeek: days, window: schedule.window, reason: schedule.reason, source, rxcui: schedule.rxcui });
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-teal-400" />
        <h2 className="text-lg font-semibold text-white">Default schedule</h2>
      </div>

      {schedule.window && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 mb-4">
          {WINDOW_ICON[schedule.window]}
          {schedule.window[0].toUpperCase() + schedule.window.slice(1)}
          {schedule.source === 'ai' && <span className="text-teal-400">· AI-suggested</span>}
        </div>
      )}
      {schedule.reason && <p className="text-sm text-slate-400 mb-4 leading-relaxed">{schedule.reason}</p>}

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Time</label>
          <input type="time" value={time} onChange={(e) => { setTime(e.target.value); setSource('user'); }} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Days</label>
          <div className="flex gap-1.5">
            {DAY_FULL.map((lbl, idx) => (
              <button key={idx} onClick={() => toggle(idx)}
                className={`w-9 h-9 rounded-full text-xs font-medium border transition-all ${days.includes(idx) ? 'bg-teal-500 border-teal-500 text-white' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'}`}>
                {lbl[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty || days.length === 0} className={btnPrimary}>
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save schedule'}
        </button>
        {days.length === 0 && <span className="text-xs text-rose-400">Pick at least one day.</span>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
function DayOverridesCard({
  schedule, onAdd, onRemove,
}: {
  schedule: import('../lib/store').Schedule;
  onAdd: (weekday: number, time: string) => Promise<void>;
  onRemove: (weekday: number) => Promise<void>;
}) {
  const [weekday, setWeekday] = useState(5); // Sat
  const [time, setTime] = useState('10:00');
  const [busy, setBusy] = useState(false);
  const entries = Object.entries(schedule.dayOverrides);

  const add = async () => { setBusy(true); try { await onAdd(weekday, time); } finally { setBusy(false); } };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold text-white">Day-of-week overrides</h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">A different time on specific weekdays (e.g. Saturdays at 10:00).</p>

      {entries.length > 0 && (
        <div className="space-y-2 mb-4">
          {entries.map(([wd, t]) => (
            <div key={wd} className="flex items-center justify-between bg-black/20 border border-white/10 rounded-xl px-4 py-2">
              <span className="text-sm text-white">{DAY_FULL[Number(wd)]} → {fmtTime(t)}</span>
              <button onClick={() => void onRemove(Number(wd))} className="text-slate-400 hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Day</label>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={inputCls}>
            {DAY_FULL.map((lbl, idx) => <option key={idx} value={idx}>{lbl}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
        </div>
        <button onClick={add} disabled={busy} className={btnGhost}><Plus className="w-4 h-4" /> Add</button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
type OverrideType = 'shift' | 'set' | 'pause';

function DateOverridesCard({
  overrides, onAdd, onRemove,
}: {
  overrides: import('../lib/store').DateOverride[];
  onAdd: (b: Omit<import('../lib/store').DateOverride, 'id'>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [type, setType] = useState<OverrideType>('shift');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [hours, setHours] = useState(2);
  const [time, setTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const labelFor = (o: import('../lib/store').DateOverride) => {
    const range = o.start === o.end ? o.start : `${o.start} → ${o.end}`;
    if (o.type === 'pause') return `Pause · ${range}`;
    if (o.type === 'set') return `Set ${fmtTime(o.time ?? null)} · ${range}`;
    const h = (o.shiftMinutes ?? 0) / 60;
    return `Shift ${h >= 0 ? '+' : ''}${h}h · ${range}`;
  };

  const add = async () => {
    setErr(null);
    if (!start) { setErr('Pick a start date.'); return; }
    const body: Omit<import('../lib/store').DateOverride, 'id'> = {
      start, end: end || start, type, note: note || null,
    };
    if (type === 'shift') body.shiftMinutes = Math.round(hours * 60);
    if (type === 'set') body.time = time;
    setBusy(true);
    try {
      await onAdd(body);
      setStart(''); setEnd(''); setNote('');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-1">
        <CalendarOff className="w-5 h-5 text-rose-400" />
        <h2 className="text-lg font-semibold text-white">Date overrides</h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">Vacation shifts, one-off times, or pausing reminders for a date range — without deleting your schedule.</p>

      {overrides.length > 0 && (
        <div className="space-y-2 mb-4">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between bg-black/20 border border-white/10 rounded-xl px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-white">
                {o.type === 'pause' ? <Pause className="w-4 h-4 text-rose-400" /> : o.type === 'shift' ? <ArrowRightLeft className="w-4 h-4 text-amber-400" /> : <Clock className="w-4 h-4 text-teal-400" />}
                <span>{labelFor(o)}</span>
                {o.note && <span className="text-slate-500">· {o.note}</span>}
              </div>
              <button onClick={() => void onRemove(o.id)} className="text-slate-400 hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as OverrideType)} className={inputCls}>
            <option value="shift">Shift by hours</option>
            <option value="set">Set fixed time</option>
            <option value="pause">Pause</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">End (optional)</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </div>
        {type === 'shift' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hours (±)</label>
            <input type="number" step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${inputCls} w-24`} />
          </div>
        )}
        {type === 'set' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </div>
        )}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-slate-400 mb-1">Note (optional)</label>
          <input type="text" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. vacation" className={`${inputCls} w-full`} />
        </div>
        <button onClick={add} disabled={busy} className={btnGhost}><Plus className="w-4 h-4" /> Add</button>
      </div>
      {err && <p className="text-xs text-rose-400 mt-2">{err}</p>}
    </div>
  );
}

// --------------------------------------------------------------------------- //
function RoutineCard({
  routine, onSave,
}: {
  routine: import('../lib/store').Routine;
  onSave: (r: import('../lib/store').Routine) => Promise<void>;
}) {
  const [r, setR] = useState(routine);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(r) !== JSON.stringify(routine);

  const save = async () => {
    setSaving(true);
    try { await onSave(r); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    finally { setSaving(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-1">
        <Utensils className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-semibold text-white">Your routine</h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">Changing your wake/sleep time automatically re-times AI-suggested doses.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Wake"><input type="time" value={r.wakeTime} onChange={(e) => setR(p => ({ ...p, wakeTime: e.target.value }))} className={`${inputCls} w-full`} /></Field>
        <Field label="Sleep"><input type="time" value={r.sleepTime} onChange={(e) => setR(p => ({ ...p, sleepTime: e.target.value }))} className={`${inputCls} w-full`} /></Field>
      </div>

      <div onClick={() => setR(p => ({ ...p, withFood: !p.withFood }))}
        className={`cursor-pointer mt-4 p-3 rounded-xl border flex items-center gap-3 ${r.withFood ? 'bg-white/10 border-teal-500/50' : 'bg-black/20 border-white/10'}`}>
        <span className="flex-1 text-sm text-white">Take with food</span>
        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${r.withFood ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}>{r.withFood && <Check className="w-3 h-3 text-white" />}</div>
      </div>

      {r.withFood && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {(['breakfast', 'lunch', 'dinner'] as const).map(meal => (
            <Field key={meal} label={meal[0].toUpperCase() + meal.slice(1)}>
              <input type="time" value={r.mealTimes[meal]} onChange={(e) => setR(p => ({ ...p, mealTimes: { ...p.mealTimes, [meal]: e.target.value } }))} className={`${inputCls} w-full`} />
            </Field>
          ))}
        </div>
      )}

      <div className="mt-5">
        <button onClick={save} disabled={saving || !dirty} className={btnPrimary}>
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save routine'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------- //
function UpcomingCard({ upcoming }: { upcoming: import('../lib/store').UpcomingDose[] }) {
  const items = useMemo(() => upcoming, [upcoming]);
  return (
    <div className={card}>
      <h2 className="text-lg font-semibold text-white mb-4">Next 7 days</h2>
      <div className="grid grid-cols-7 gap-2">
        {items.map((u) => {
          const d = new Date(u.date + 'T00:00:00');
          return (
            <div key={u.date} className={`rounded-xl border p-3 text-center ${u.skipped ? 'bg-black/20 border-white/5' : 'bg-teal-500/10 border-teal-500/20'}`}>
              <div className="text-xs text-slate-400">{d.toLocaleDateString([], { weekday: 'short' })}</div>
              <div className="text-xs text-slate-500 mb-1">{d.getDate()}</div>
              <div className={`text-sm font-medium ${u.skipped ? 'text-slate-600' : 'text-white'}`}>{u.skipped ? '—' : fmtTime(u.time)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
