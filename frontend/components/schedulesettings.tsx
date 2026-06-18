"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
  useAppStore, TimeWindow, MedicationInput, Requirements, FoodRequirement,
  DayRoutine, ScheduleType, browserTimeZone,
} from '../lib/store';
import {
  Clock, CalendarDays, AlertTriangle, Plus, Trash2, Utensils,
  Moon, CalendarOff, Pause, ArrowRightLeft, Check, Globe, Pill,
  Sparkles, Hand,
} from 'lucide-react';

// A short, friendly list; the user's current and device zones are always added.
const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Athens', 'Asia/Kolkata', 'Asia/Dubai',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

const DAY_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0=Mon..6=Sun
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const FOOD_LABEL: Record<FoodRequirement, string> = {
  none: 'No food rule',
  with_food: 'With food',
  without_food: 'On empty stomach',
  before_meals: 'Before meals',
  after_meals: 'After meals',
};

function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const fmtTimes = (times: string[]) => (times.length ? times.map(fmtTime).join(' · ') : '—');

const card = 'bg-white border border-stone-200 rounded-3xl p-6 shadow-[var(--shadow-sm)]';
const inputCls = 'bg-stone-50 border border-stone-200 rounded-[14px] px-3 py-2 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 rounded-[14px] text-sm font-medium bg-tide-500 text-white hover:bg-tide-600 hover:shadow-[var(--shadow-brand)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-sm text-stone-600 bg-white border border-stone-200 hover:bg-stone-100 transition-colors';

export default function ScheduleSettings() {
  const {
    scheduleView, refreshSchedule, updateProfile,
    saveSchedule, saveRoutine, addMedication, removeMedication,
    addDayOverride, removeDayOverride, addDateOverride, removeDateOverride,
  } = useAppStore();

  const [activeMedId, setActiveMedId] = useState<string | null>(null);

  // Changing the timezone re-anchors every dose time, so refresh the resolved
  // view (nextDue/upcoming) after the profile patch lands.
  const saveTimezone = async (timezone: string) => {
    await updateProfile({ timezone });
    await refreshSchedule();
  };

  useEffect(() => { if (!scheduleView) void refreshSchedule(); }, [scheduleView, refreshSchedule]);

  if (!scheduleView) {
    return (
      <div className="flex items-center gap-3 text-stone-500 py-16 justify-center">
        <div className="w-5 h-5 border-2 border-tide-500 border-t-transparent rounded-full animate-spin" />
        Loading your schedule…
      </div>
    );
  }

  const { medications, routine, timezone } = scheduleView;
  const med = medications.find(m => m.id === activeMedId) ?? medications[0];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Schedule</h1>
        <p className="text-stone-500 mt-1">
          {medications.length === 1
            ? `${medications[0].name} · one medication`
            : `${medications.length} medications, each on its own schedule`}
        </p>
      </div>

      {/* Medication selector */}
      {medications.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {medications.map(m => (
            <button
              key={m.id}
              onClick={() => setActiveMedId(m.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                m.id === med.id ? 'bg-tide-500 border-tide-500 text-white' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Pill className="w-4 h-4" />
              {m.name}
              <span className={`text-xs ${m.id === med.id ? 'text-white/80' : 'text-stone-400'}`}>{fmtTimes(m.schedule.times)}</span>
            </button>
          ))}
        </div>
      )}

      {med.conflicts.length > 0 && (
        <div className="bg-warning-subtle border border-warning/30 rounded-2xl p-4 space-y-2">
          {med.conflicts.map((c, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      <TimezoneCard timezone={timezone} onSave={saveTimezone} />

      <MedicationScheduleCard
        key={med.id}
        med={med}
        canRemove={medications.length > 1}
        onSave={(body) => saveSchedule(med.id, body)}
        onRemove={() => { setActiveMedId(medications.find(m => m.id !== med.id)?.id ?? null); return removeMedication(med.id); }}
      />
      <DayOverridesCard
        schedule={med.schedule}
        onAdd={(wd, t) => addDayOverride(med.id, wd, t)}
        onRemove={(wd) => removeDayOverride(med.id, wd)}
      />
      <DateOverridesCard
        overrides={med.schedule.dateOverrides}
        onAdd={(b) => addDateOverride(med.id, b)}
        onRemove={(id) => removeDateOverride(med.id, id)}
      />
      <UpcomingCard upcoming={med.upcoming} medName={med.name} />

      <AddMedicationCard onAdd={addMedication} />

      <RoutineCard routine={routine} onSave={saveRoutine} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
function TimezoneCard({ timezone, onSave }: { timezone: string; onSave: (tz: string) => Promise<void> }) {
  const device = browserTimeZone();
  const [tz, setTz] = useState(timezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setTz(timezone); }, [timezone]);

  // Always offer the saved zone and this device's zone, even if uncommon.
  const options = useMemo(
    () => Array.from(new Set([timezone, device, ...COMMON_TIMEZONES])),
    [timezone, device],
  );
  const dirty = tz !== timezone;

  // Live preview of "now" in the selected zone so the choice is concrete.
  const nowPreview = (() => {
    try {
      return new Date().toLocaleString([], {
        weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz,
      });
    } catch { return '—'; }
  })();

  const save = async () => {
    setSaving(true);
    try { await onSave(tz); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    finally { setSaving(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-5 h-5 text-info" />
        <h2 className="text-lg font-semibold text-stone-900">Timezone</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        Your dose times are shown in this timezone. Update it if you travel or set up reminders for someone in another zone.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Timezone</label>
          <select value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
            {options.map((z) => (
              <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        {tz !== device && (
          <button onClick={() => setTz(device)} className={btnGhost}>
            <Globe className="w-4 h-4" /> Use this device ({device.replace(/_/g, ' ')})
          </button>
        )}
      </div>

      <p className="text-xs text-stone-400 mt-3">Now in this zone: <span className="text-stone-600">{nowPreview}</span></p>

      <div className="mt-4">
        <button onClick={save} disabled={saving || !dirty} className={btnPrimary}>
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save timezone'}
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
type ScheduleSaveBody = {
  name?: string; time?: string; times?: string[]; requirements?: Requirements;
  daysOfWeek: number[]; window: TimeWindow | null;
  reason: string | null; source: 'ai' | 'user' | 'auto'; rxcui: string | null;
};

const FOOD_VALUES: FoodRequirement[] = ['none', 'with_food', 'without_food', 'before_meals', 'after_meals'];

function MedicationScheduleCard({
  med, canRemove, onSave, onRemove,
}: {
  med: import('../lib/store').MedicationView;
  canRemove: boolean;
  onSave: (b: ScheduleSaveBody) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { schedule, requirements } = med;
  const [name, setName] = useState(med.name);
  const [days, setDays] = useState<number[]>(schedule.daysOfWeek);
  // 'auto' = times generated from requirements + routine; 'user' = hand-picked.
  const [mode, setMode] = useState<'auto' | 'user'>(schedule.source === 'auto' ? 'auto' : 'user');
  const [req, setReq] = useState<Requirements>(requirements);
  const [times, setTimes] = useState<string[]>(schedule.times);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [removing, setRemoving] = useState(false);

  const toggle = (d: number) => setDays(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort()));
  const setTimeAt = (i: number, v: string) => setTimes(p => p.map((t, idx) => (idx === i ? v : t)));
  const addTime = () => setTimes(p => [...p, '12:00']);
  const removeTime = (i: number) => setTimes(p => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const dirty =
    name !== med.name ||
    JSON.stringify(days) !== JSON.stringify(schedule.daysOfWeek) ||
    mode !== (schedule.source === 'auto' ? 'auto' : 'user') ||
    JSON.stringify(req) !== JSON.stringify(requirements) ||
    (mode === 'user' && JSON.stringify(times) !== JSON.stringify(schedule.times));

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || med.name,
        daysOfWeek: days,
        window: schedule.window,
        reason: schedule.reason,
        rxcui: schedule.rxcui,
        requirements: req,
        ...(mode === 'auto'
          ? { source: 'auto' }
          : { source: 'user', times: [...times].sort() }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setRemoving(true);
    try { await onRemove(); } finally { setRemoving(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-tide-600" />
          <h2 className="text-lg font-semibold text-stone-900">Schedule for this medication</h2>
        </div>
        {canRemove && (
          <button onClick={remove} disabled={removing} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-danger transition-colors disabled:opacity-50">
            <Trash2 className="w-4 h-4" /> {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-6 mb-5">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Name</label>
          <input type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-44`} />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Days</label>
          <div className="flex gap-1.5">
            {DAY_FULL.map((lbl, idx) => (
              <button key={idx} onClick={() => toggle(idx)}
                className={`w-9 h-9 rounded-full text-xs font-medium border transition-all ${days.includes(idx) ? 'bg-tide-500 border-tide-500 text-white' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
                {lbl[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <RequirementsEditor req={req} onChange={setReq} />

      {/* Auto vs manual times */}
      <div className="mt-5">
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMode('auto')}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-[12px] border text-sm transition-all ${mode === 'auto' ? 'bg-tide-50 border-tide-300 text-tide-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
            <Sparkles className="w-4 h-4" /> Auto times
          </button>
          <button onClick={() => setMode('user')}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-[12px] border text-sm transition-all ${mode === 'user' ? 'bg-tide-50 border-tide-300 text-tide-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
            <Hand className="w-4 h-4" /> Set times myself
          </button>
        </div>

        {mode === 'auto' ? (
          <p className="text-sm text-stone-500">
            We generate dose times from these requirements and your routine.
            {' '}Currently: <span className="text-stone-800 font-medium">{fmtTimes(schedule.times)}</span>.
            {schedule.source !== 'auto' && <span className="text-tide-600"> Saving switches this medication to auto times.</span>}
          </p>
        ) : (
          <div>
            <label className="block text-xs text-stone-500 mb-2">Dose times</label>
            <div className="flex flex-wrap gap-2">
              {times.map((t, i) => (
                <div key={i} className="inline-flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-[12px] pl-2 pr-1 py-1">
                  <input type="time" value={t} onChange={(e) => setTimeAt(i, e.target.value)} className="bg-transparent text-sm text-stone-900 focus:outline-none" />
                  {times.length > 1 && (
                    <button onClick={() => removeTime(i)} className="text-stone-400 hover:text-danger p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
              <button onClick={addTime} className={btnGhost}><Plus className="w-4 h-4" /> Add time</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving || !dirty || days.length === 0} className={btnPrimary}>
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save schedule'}
        </button>
        {days.length === 0 && <span className="text-xs text-danger">Pick at least one day.</span>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
function RequirementsEditor({ req, onChange }: { req: Requirements; onChange: (r: Requirements) => void }) {
  const set = (patch: Partial<Requirements>) => onChange({ ...req, ...patch });
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
      <div className="flex flex-wrap gap-6">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Doses per day</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <button key={n}
                onClick={() => set({ dosesPerDay: n, bedtimeOnly: n === 1 ? req.bedtimeOnly : false })}
                className={`w-9 h-9 rounded-[10px] text-sm font-medium border transition-all ${req.dosesPerDay === n ? 'bg-tide-500 border-tide-500 text-white' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Food rule</label>
          <select value={req.foodRequirement} onChange={(e) => set({ foodRequirement: e.target.value as FoodRequirement })} className={inputCls}>
            {FOOD_VALUES.map(v => <option key={v} value={v}>{FOOD_LABEL[v]}</option>)}
          </select>
        </div>
        {req.dosesPerDay >= 2 && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Min. spacing (hrs)</label>
            <input
              type="number" min={0} max={24} step={0.5}
              value={req.minSpacingMinutes != null ? req.minSpacingMinutes / 60 : ''}
              placeholder="—"
              onChange={(e) => set({ minSpacingMinutes: e.target.value === '' ? null : Math.round(Number(e.target.value) * 60) })}
              className={`${inputCls} w-24`}
            />
          </div>
        )}
        {req.dosesPerDay === 1 && (
          <div className="flex items-end">
            <button
              onClick={() => set({ bedtimeOnly: !req.bedtimeOnly })}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-[12px] border text-sm transition-all ${req.bedtimeOnly ? 'bg-tide-50 border-tide-300 text-tide-700' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
              <Moon className="w-4 h-4" /> Bedtime only
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
function AddMedicationCard({ onAdd }: { onAdd: (b: MedicationInput) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [req, setReq] = useState<Requirements>({ dosesPerDay: 1, foodRequirement: 'none', bedtimeOnly: false, minSpacingMinutes: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (d: number) => setDays(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort()));

  const add = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Enter a medication name.'); return; }
    if (days.length === 0) { setErr('Pick at least one day.'); return; }
    setBusy(true);
    try {
      // New meds default to auto times generated from requirements + routine.
      await onAdd({ name: name.trim(), requirements: req, daysOfWeek: days, window: null, reason: null, source: 'auto', rxcui: null });
      setName(''); setDays(ALL_DAYS); setReq({ dosesPerDay: 1, foodRequirement: 'none', bedtimeOnly: false, minSpacingMinutes: null }); setOpen(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="w-5 h-5 text-tide-600" />
          <h2 className="text-lg font-semibold text-stone-900">Add a medication</h2>
        </div>
        {!open && <button onClick={() => setOpen(true)} className={btnGhost}><Plus className="w-4 h-4" /> Add</button>}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Name</label>
              <input type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metformin" className={`${inputCls} w-44`} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Days</label>
              <div className="flex gap-1.5">
                {DAY_FULL.map((lbl, idx) => (
                  <button key={idx} onClick={() => toggle(idx)}
                    className={`w-9 h-9 rounded-full text-xs font-medium border transition-all ${days.includes(idx) ? 'bg-tide-500 border-tide-500 text-white' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
                    {lbl[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <RequirementsEditor req={req} onChange={setReq} />
          <div className="flex items-center gap-3">
            <button onClick={add} disabled={busy} className={btnPrimary}>{busy ? 'Adding…' : 'Add medication'}</button>
            <button onClick={() => { setOpen(false); setErr(null); }} className={btnGhost}>Cancel</button>
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      )}
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
        <CalendarDays className="w-5 h-5 text-apricot-600" />
        <h2 className="text-lg font-semibold text-stone-900">Day-of-week overrides</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">A different time on specific weekdays (e.g. Saturdays at 10:00).</p>

      {entries.length > 0 && (
        <div className="space-y-2 mb-4">
          {entries.map(([wd, t]) => (
            <div key={wd} className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-4 py-2">
              <span className="text-sm text-stone-900">{DAY_FULL[Number(wd)]} → {fmtTimes(t)}</span>
              <button onClick={() => void onRemove(Number(wd))} className="text-stone-500 hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Day</label>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={inputCls}>
            {DAY_FULL.map((lbl, idx) => <option key={idx} value={idx}>{lbl}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Time</label>
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
        <CalendarOff className="w-5 h-5 text-danger" />
        <h2 className="text-lg font-semibold text-stone-900">Date overrides</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">Vacation shifts, one-off times, or pausing reminders for a date range — without deleting your schedule.</p>

      {overrides.length > 0 && (
        <div className="space-y-2 mb-4">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-stone-900">
                {o.type === 'pause' ? <Pause className="w-4 h-4 text-danger" /> : o.type === 'shift' ? <ArrowRightLeft className="w-4 h-4 text-warning" /> : <Clock className="w-4 h-4 text-tide-600" />}
                <span>{labelFor(o)}</span>
                {o.note && <span className="text-stone-400">· {o.note}</span>}
              </div>
              <button onClick={() => void onRemove(o.id)} className="text-stone-500 hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as OverrideType)} className={inputCls}>
            <option value="shift">Shift by hours</option>
            <option value="set">Set fixed time</option>
            <option value="pause">Pause</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Start</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">End (optional)</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </div>
        {type === 'shift' && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Hours (±)</label>
            <input type="number" step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${inputCls} w-24`} />
          </div>
        )}
        {type === 'set' && (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </div>
        )}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-stone-500 mb-1">Note (optional)</label>
          <input type="text" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. vacation" className={`${inputCls} w-full`} />
        </div>
        <button onClick={add} disabled={busy} className={btnGhost}><Plus className="w-4 h-4" /> Add</button>
      </div>
      {err && <p className="text-xs text-danger mt-2">{err}</p>}
    </div>
  );
}

// --------------------------------------------------------------------------- //
const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  same: 'Same every day',
  weekday_weekend: 'Weekdays vs weekends',
  per_day: 'Varies by day',
};

const emptyDayRoutine = (base: DayRoutine): DayRoutine => ({
  wakeTime: base.wakeTime, sleepTime: base.sleepTime, withFood: base.withFood,
  mealTimes: { ...base.mealTimes },
});

function RoutineCard({
  routine, onSave,
}: {
  routine: import('../lib/store').Routine;
  onSave: (r: import('../lib/store').Routine) => Promise<void>;
}) {
  const [r, setR] = useState(routine);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setR(routine); }, [routine]);
  const dirty = JSON.stringify(r) !== JSON.stringify(routine);

  const setType = (t: ScheduleType) =>
    setR(prev => ({
      ...prev,
      scheduleType: t,
      weekendRoutine: t === 'weekday_weekend' ? (prev.weekendRoutine ?? emptyDayRoutine(prev)) : prev.weekendRoutine,
    }));

  const toggleDay = (d: number) =>
    setR(prev => {
      const next = { ...prev.dayRoutines };
      if (next[d]) delete next[d];
      else next[d] = emptyDayRoutine(prev);
      return { ...prev, dayRoutines: next };
    });

  const save = async () => {
    setSaving(true);
    try { await onSave(r); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    finally { setSaving(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-1">
        <Utensils className="w-5 h-5 text-tide-600" />
        <h2 className="text-lg font-semibold text-stone-900">Your routine</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">Shared across all your medications. Auto-timed doses re-anchor to these times — including any day-specific routines below.</p>

      <DayRoutineEditor value={r} onChange={(patch) => setR(p => ({ ...p, ...patch }))} />

      {/* Variable weekly schedule */}
      <div className="mt-6 pt-5 border-t border-stone-200">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-apricot-600" />
          <span className="text-sm font-medium text-stone-800">Does your schedule change by day of week?</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SCHEDULE_TYPE_LABEL) as ScheduleType[]).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`py-2.5 px-2 rounded-[14px] border text-xs font-medium transition-all ${r.scheduleType === t ? 'bg-apricot-50 border-apricot-300 text-apricot-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
              {SCHEDULE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {r.scheduleType === 'weekday_weekend' && r.weekendRoutine && (
          <div className="mt-4 rounded-2xl border border-apricot-200 bg-apricot-50/40 p-4">
            <div className="flex items-center gap-2 mb-3"><Moon className="w-4 h-4 text-apricot-600" /><h3 className="text-sm font-semibold text-stone-800">Weekend routine (Sat–Sun)</h3></div>
            <DayRoutineEditor value={r.weekendRoutine} onChange={(patch) => setR(p => ({ ...p, weekendRoutine: { ...p.weekendRoutine!, ...patch } }))} />
          </div>
        )}

        {r.scheduleType === 'per_day' && (
          <div className="mt-4 rounded-2xl border border-apricot-200 bg-apricot-50/40 p-4">
            <p className="text-xs text-stone-500 mb-3">Tap a day to give it its own routine. Untapped days use the routine above.</p>
            <div className="flex gap-2 mb-3">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((lbl, idx) => (
                <button key={idx} onClick={() => toggleDay(idx)}
                  className={`w-9 h-9 rounded-full text-xs font-medium border transition-all ${r.dayRoutines[idx] ? 'bg-apricot-500 border-apricot-500 text-white' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
                  {lbl}
                </button>
              ))}
            </div>
            {Object.keys(r.dayRoutines).map(Number).sort().map((d) => (
              <div key={d} className="rounded-xl border border-stone-200 bg-white p-3 mb-2">
                <p className="text-xs font-semibold text-stone-700 mb-2">{DAY_FULL[d]}</p>
                <DayRoutineEditor
                  value={r.dayRoutines[d]}
                  onChange={(patch) => setR(p => ({ ...p, dayRoutines: { ...p.dayRoutines, [d]: { ...p.dayRoutines[d], ...patch } } }))}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        <button onClick={save} disabled={saving || !dirty} className={btnPrimary}>
          {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save routine'}
        </button>
      </div>
    </div>
  );
}

function DayRoutineEditor({ value, onChange }: { value: DayRoutine; onChange: (patch: Partial<DayRoutine>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Wake"><input type="time" value={value.wakeTime} onChange={(e) => onChange({ wakeTime: e.target.value })} className={`${inputCls} w-full`} /></Field>
        <Field label="Sleep"><input type="time" value={value.sleepTime} onChange={(e) => onChange({ sleepTime: e.target.value })} className={`${inputCls} w-full`} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        {(['breakfast', 'lunch', 'dinner'] as const).map(meal => (
          <Field key={meal} label={meal[0].toUpperCase() + meal.slice(1)}>
            <input type="time" value={value.mealTimes[meal]} onChange={(e) => onChange({ mealTimes: { ...value.mealTimes, [meal]: e.target.value } })} className={`${inputCls} w-full`} />
          </Field>
        ))}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-stone-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------- //
function UpcomingCard({ upcoming, medName }: { upcoming: import('../lib/store').UpcomingDose[]; medName: string }) {
  const items = useMemo(() => upcoming, [upcoming]);
  return (
    <div className={card}>
      <h2 className="text-lg font-semibold text-stone-900 mb-4">Next 7 days · {medName}</h2>
      <div className="grid grid-cols-7 gap-2">
        {items.map((u) => {
          const d = new Date(u.date + 'T00:00:00');
          return (
            <div key={u.date} className={`rounded-xl border p-3 text-center ${u.skipped ? 'bg-stone-100 border-stone-200' : 'bg-tide-50 border-tide-200'}`}>
              <div className="text-xs text-stone-500">{d.toLocaleDateString([], { weekday: 'short' })}</div>
              <div className="text-xs text-stone-400 mb-1">{d.getDate()}</div>
              {u.skipped ? (
                <div className="text-sm font-medium text-stone-400">—</div>
              ) : (
                <div className="space-y-0.5">
                  {u.times.map((t, i) => (
                    <div key={i} className="text-xs font-medium text-stone-900 leading-tight">{fmtTime(t)}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
