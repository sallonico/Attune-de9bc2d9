"use client";

import React, { useState } from 'react';
import {
  useAppStore, Routine, DayRoutine, MedicationInput, FoodRequirement,
  ScheduleType, browserTimeZone,
} from '../lib/store';
import {
  ArrowRight, Check, Pill, HeartPulse, Users, Sparkles, LogOut,
  Sun, Moon, Clock, Utensils, Brain, CalendarDays,
} from 'lucide-react';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // index 0=Mon .. 6=Sun
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const TOTAL_STEPS = 5;

// Food rules shown to the patient. Order matters — "No restriction" first so the
// simplest answer is the default and the others are progressive.
const FOOD_OPTIONS: { value: FoodRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No food rule', hint: 'Take any time' },
  { value: 'with_food', label: 'With food', hint: 'Take during a meal' },
  { value: 'without_food', label: 'On empty stomach', hint: 'Away from meals' },
  { value: 'before_meals', label: 'Before meals', hint: '~30 min before eating' },
  { value: 'after_meals', label: 'After meals', hint: 'Just after eating' },
];

// A medication being set up. We collect *requirements* and let the server generate
// concrete dose times from the routine (source: 'auto') — so the patient never has
// to hand-pick clock times during onboarding.
interface MedDraft {
  name: string;
  dosesPerDay: number;
  foodRequirement: FoodRequirement;
  bedtimeOnly: boolean;
}

const newMedDraft = (): MedDraft => ({
  name: '', dosesPerDay: 1, foodRequirement: 'none', bedtimeOnly: false,
});

const emptyDayRoutine = (): DayRoutine => ({
  wakeTime: '09:00', sleepTime: '23:30', withFood: false,
  mealTimes: { breakfast: '10:00', lunch: '13:30', dinner: '19:00' },
});

export default function Onboarding() {
  const { completeOnboarding, logout, email } = useAppStore();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');

  // 1–5 medications; keep 5 drafts so changing the count doesn't lose entries.
  const [medCount, setMedCount] = useState(1);
  const [meds, setMeds] = useState<MedDraft[]>(() => Array.from({ length: 5 }, newMedDraft));

  const activeMeds = meds.slice(0, medCount);
  const namesComplete = activeMeds.every(m => m.name.trim().length > 0);

  const updateMed = (idx: number, patch: Partial<MedDraft>) =>
    setMeds(prev => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  // Routine (shared baseline across all meds; weekend/per-day variants optional)
  const [routine, setRoutine] = useState<Routine>({
    wakeTime: '07:00',
    sleepTime: '23:00',
    withFood: false,
    mealTimes: { breakfast: '08:00', lunch: '12:30', dinner: '18:30' },
    variableDays: [],
    scheduleType: 'same',
    weekendRoutine: null,
    dayRoutines: {},
  });

  const setScheduleType = (t: ScheduleType) =>
    setRoutine(prev => ({
      ...prev,
      scheduleType: t,
      // Seed a weekend routine the first time the patient opts into one.
      weekendRoutine: t === 'weekday_weekend' ? (prev.weekendRoutine ?? emptyDayRoutine()) : prev.weekendRoutine,
    }));

  const [features, setFeatures] = useState({
    aiInsights: false,
    wellnessCheckIns: true,
    caregiverAccess: false,
  });

  const handleNext = async () => {
    setError(null);
    if (step === 1 && !name) return;
    if (step === 2 && !namesComplete) return;
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    // Final step -> submit everything. Medications are 'auto': the server
    // generates dose times from each med's requirements + the routine.
    setSubmitting(true);
    try {
      const medications: MedicationInput[] = activeMeds.map(m => ({
        name: m.name.trim(),
        requirements: {
          dosesPerDay: m.dosesPerDay,
          foodRequirement: m.foodRequirement,
          bedtimeOnly: m.bedtimeOnly,
          minSpacingMinutes: null,
        },
        daysOfWeek: ALL_DAYS,
        window: null,
        reason: null,
        source: 'auto',
        rxcui: null,
      }));
      await completeOnboarding({
        // Anchor dose times to the patient's device timezone so the dashboard
        // shows the time they actually take it (editable later in Schedule).
        profile: { name, medications, timezone: browserTimeZone(), features },
        routine,
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to save profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFeature = (key: keyof typeof features) =>
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));

  const continueDisabled =
    submitting || (step === 1 && !name) || (step === 2 && !namesComplete);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-tide-200/30 rounded-full blur-[140px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-apricot-200/25 rounded-full blur-[140px]" />

      <div className="w-full max-w-xl relative z-10">
        <div className="flex items-center justify-between mb-6 text-xs text-stone-500">
          <span className="truncate max-w-[60%]">{email ? `Signed in as ${email}` : ''}</span>
          <button
            onClick={() => void logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-stone-200 hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-colors"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i < step ? 'bg-tide-500' : 'bg-stone-200'
              }`}
            />
          ))}
        </div>

        <div className="bg-white border border-stone-200 rounded-3xl p-8 md:p-10 shadow-[var(--shadow-lg)]">

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="tide"><Sparkles className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">Welcome to attune</h1>
              <p className="text-stone-500 mb-8 text-lg">Let&apos;s set up gentle medication reminders. This takes about a minute.</p>
              <label className="block text-sm font-medium text-stone-700 mb-2">What should we call you?</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Margaret"
                className="w-full bg-stone-50 border border-stone-200 rounded-[14px] px-4 py-3 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
              />
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="apricot"><Pill className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">Your medications</h1>
              <p className="text-stone-500 mb-8 text-lg">What would you like to keep time with? We&apos;ll ask how each one is taken next.</p>

              <label className="block text-sm font-medium text-stone-700 mb-2">How many medications?</label>
              <div className="grid grid-cols-5 gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMedCount(n)}
                    className={`py-3 rounded-[14px] border text-sm font-medium transition-all ${
                      medCount === n ? 'bg-tide-50 border-tide-300 text-tide-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {activeMeds.map((m, i) => (
                  <div key={i}>
                    <label className="block text-sm font-medium text-stone-700 mb-2">
                      {medCount === 1 ? 'Medication name' : `Medication ${i + 1} name`}
                    </label>
                    <input
                      type="text" value={m.name} onChange={(e) => updateMed(i, { name: e.target.value })} placeholder="e.g. Levothyroxine"
                      className="w-full bg-stone-50 border border-stone-200 rounded-[14px] px-4 py-3 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="tide"><Clock className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">How do you take {medCount === 1 ? 'it' : 'each one'}?</h1>
              <p className="text-stone-500 mb-6 text-lg">
                Just the essentials — we&apos;ll pick sensible reminder times from your routine. You can fine-tune them anytime.
              </p>

              <div className="space-y-5">
                {activeMeds.map((m, i) => (
                  <MedRequirementsCard
                    key={i}
                    med={m}
                    showName={medCount > 1}
                    index={i}
                    onChange={(patch) => updateMed(i, patch)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="apricot"><Sun className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">Your daily routine</h1>
              <p className="text-stone-500 mb-8 text-lg">This keeps suggested dose times realistic — meals, waking, and bedtime.</p>

              <DayRoutineFields
                value={routine}
                onChange={(patch) => setRoutine(p => ({ ...p, ...patch }))}
              />

              {/* The variable-weekly-schedule question. */}
              <div className="mt-8 pt-6 border-t border-stone-200">
                <div className="flex items-start gap-3 mb-4">
                  <CalendarDays className="w-5 h-5 text-apricot-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-stone-800">
                      Do your wake-up, meal, or sleep times change depending on the day of the week?
                    </p>
                    <p className="text-xs text-stone-500 mt-1">Many people sleep in on weekends — we can shift reminders to match.</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['same', 'No, same every day'],
                    ['weekday_weekend', 'Weekdays vs weekends'],
                    ['per_day', 'It varies by day'],
                  ] as [ScheduleType, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setScheduleType(val)}
                      className={`py-2.5 px-2 rounded-[14px] border text-xs font-medium transition-all ${
                        routine.scheduleType === val ? 'bg-apricot-50 border-apricot-300 text-apricot-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {routine.scheduleType === 'weekday_weekend' && routine.weekendRoutine && (
                  <div className="mt-5 rounded-2xl border border-apricot-200 bg-apricot-50/40 p-5 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 mb-4">
                      <Moon className="w-4 h-4 text-apricot-600" />
                      <h3 className="text-sm font-semibold text-stone-800">Weekend routine (Sat–Sun)</h3>
                    </div>
                    <DayRoutineFields
                      value={routine.weekendRoutine}
                      onChange={(patch) => setRoutine(p => ({ ...p, weekendRoutine: { ...p.weekendRoutine!, ...patch } }))}
                    />
                  </div>
                )}

                {routine.scheduleType === 'per_day' && (
                  <PerDayRoutineEditor routine={routine} setRoutine={setRoutine} />
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="apricot"><Brain className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">Make it yours</h1>
              <p className="text-stone-500 mb-8 text-lg">Choose the features that matter to you. You can always change these later.</p>
              <div className="space-y-4">
                <FeatureToggle icon={<HeartPulse className="w-5 h-5 text-apricot-600" />} title="Wellness check-ins" description="A quick, one-tap check-in after doses to track how you feel." active={features.wellnessCheckIns} onClick={() => toggleFeature('wellnessCheckIns')} />
                <FeatureToggle icon={<Users className="w-5 h-5 text-tide-600" />} title="Caregiver dashboard" description="Let a family member or doctor follow your progress." active={features.caregiverAccess} onClick={() => toggleFeature('caregiverAccess')} />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-6 text-sm text-danger bg-danger-subtle border border-danger/20 rounded-[14px] px-3 py-2">{error}</p>
          )}

          <div className="mt-10 flex justify-between">
            {step > 1 ? (
              <button
                onClick={() => { setError(null); setStep(step - 1); }}
                className="px-5 py-4 rounded-[14px] font-medium text-stone-500 hover:text-stone-800 transition-colors"
              >
                Back
              </button>
            ) : <span />}
            <button
              onClick={handleNext}
              disabled={continueDisabled}
              className="group bg-tide-500 hover:bg-tide-600 px-8 py-4 rounded-[14px] font-semibold text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-brand)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center gap-2"
            >
              <span>{submitting ? 'Saving…' : step === TOTAL_STEPS ? 'Complete setup' : 'Continue'}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Per-medication requirements — progressive: food/spacing details only surface
// as they become relevant, so a once-a-day med is a single tap.
function MedRequirementsCard({
  med, showName, index, onChange,
}: {
  med: MedDraft;
  showName: boolean;
  index: number;
  onChange: (patch: Partial<MedDraft>) => void;
}) {
  return (
    <div className={showName ? 'rounded-2xl border border-stone-200 p-5 bg-stone-50/50' : ''}>
      {showName && (
        <div className="flex items-center gap-2 mb-4">
          <Pill className="w-4 h-4 text-apricot-600" />
          <h2 className="font-semibold text-stone-900">{med.name || `Medication ${index + 1}`}</h2>
        </div>
      )}

      <label className="block text-sm font-medium text-stone-700 mb-2">How many times a day?</label>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onChange({ dosesPerDay: n, bedtimeOnly: n === 1 ? med.bedtimeOnly : false })}
            className={`py-2.5 rounded-[14px] border text-sm font-medium transition-all ${
              med.dosesPerDay === n ? 'bg-tide-50 border-tide-300 text-tide-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
            }`}
          >
            {n === 4 ? '4+' : n}{n === 1 ? '×' : '×'}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium text-stone-700 mb-2">Any food rule?</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {FOOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange({ foodRequirement: opt.value })}
            className={`flex flex-col items-start gap-0.5 py-2.5 px-3 rounded-[14px] border text-left transition-all ${
              med.foodRequirement === opt.value ? 'bg-tide-50 border-tide-300' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
            }`}
          >
            <span className={`text-xs font-medium ${med.foodRequirement === opt.value ? 'text-tide-700' : 'text-stone-700'}`}>{opt.label}</span>
            <span className="text-[11px] text-stone-400">{opt.hint}</span>
          </button>
        ))}
      </div>

      {/* Bedtime-only is only meaningful for a once-daily med. */}
      {med.dosesPerDay === 1 && (
        <button
          onClick={() => onChange({ bedtimeOnly: !med.bedtimeOnly })}
          className={`mt-4 w-full p-3 rounded-xl border flex items-center gap-3 transition-all ${
            med.bedtimeOnly ? 'bg-tide-50 border-tide-300' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
          }`}
        >
          <Moon className="w-4 h-4 text-tide-600" />
          <span className="flex-1 text-sm text-stone-800 text-left">Only at bedtime</span>
          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${med.bedtimeOnly ? 'bg-tide-500 border-tide-500' : 'border-stone-300'}`}>
            {med.bedtimeOnly && <Check className="w-3 h-3 text-white" />}
          </div>
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Wake / sleep / meals fields shared by the base routine, the weekend routine,
// and each per-day routine.
function DayRoutineFields({
  value, onChange,
}: {
  value: DayRoutine;
  onChange: (patch: Partial<DayRoutine>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <TimeField label="Wake up" value={value.wakeTime} onChange={(v) => onChange({ wakeTime: v })} />
        <TimeField label="Go to sleep" value={value.sleepTime} onChange={(v) => onChange({ sleepTime: v })} />
      </div>
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-stone-700">
        <Utensils className="w-4 h-4 text-tide-600" /> Meal times
      </div>
      <div className="grid grid-cols-3 gap-3">
        {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
          <TimeField
            key={meal}
            label={meal[0].toUpperCase() + meal.slice(1)}
            value={value.mealTimes[meal]}
            onChange={(v) => onChange({ mealTimes: { ...value.mealTimes, [meal]: v } })}
          />
        ))}
      </div>
    </>
  );
}

// --------------------------------------------------------------------------- //
const DAY_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function PerDayRoutineEditor({
  routine, setRoutine,
}: {
  routine: Routine;
  setRoutine: React.Dispatch<React.SetStateAction<Routine>>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const customized = Object.keys(routine.dayRoutines).map(Number).sort();

  const toggleDay = (d: number) =>
    setRoutine(prev => {
      const next = { ...prev.dayRoutines };
      if (next[d]) {
        delete next[d];
        return { ...prev, dayRoutines: next };
      }
      next[d] = { wakeTime: prev.wakeTime, sleepTime: prev.sleepTime, withFood: prev.withFood, mealTimes: { ...prev.mealTimes } };
      return { ...prev, dayRoutines: next };
    });

  return (
    <div className="mt-5 rounded-2xl border border-apricot-200 bg-apricot-50/40 p-5 animate-in fade-in duration-300">
      <p className="text-sm font-semibold text-stone-800 mb-1">Which days are different?</p>
      <p className="text-xs text-stone-500 mb-3">Tap a day to give it its own routine. Untapped days use the routine above.</p>
      <div className="flex gap-2 mb-4">
        {DAY_LABELS.map((lbl, idx) => (
          <button
            key={idx}
            onClick={() => toggleDay(idx)}
            className={`w-10 h-10 rounded-full text-sm font-medium border transition-all ${
              routine.dayRoutines[idx] ? 'bg-apricot-500 border-apricot-500 text-white' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-100'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {customized.map((d) => (
        <div key={d} className="rounded-xl border border-stone-200 bg-white p-4 mb-3">
          <button
            onClick={() => setEditing(editing === d ? null : d)}
            className="w-full flex items-center justify-between text-sm font-medium text-stone-800"
          >
            <span>{DAY_FULL[d]} · {routine.dayRoutines[d].wakeTime}–{routine.dayRoutines[d].sleepTime}</span>
            <span className="text-xs text-tide-600">{editing === d ? 'Close' : 'Edit'}</span>
          </button>
          {editing === d && (
            <div className="mt-4">
              <DayRoutineFields
                value={routine.dayRoutines[d]}
                onChange={(patch) => setRoutine(prev => ({
                  ...prev,
                  dayRoutines: { ...prev.dayRoutines, [d]: { ...prev.dayRoutines[d], ...patch } },
                }))}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StepIcon({ tone, children }: { tone: 'tide' | 'apricot'; children: React.ReactNode }) {
  const tones = {
    tide: 'bg-tide-50 text-tide-600',
    apricot: 'bg-apricot-50 text-apricot-600',
  };
  return (
    <div className={`w-12 h-12 ${tones[tone]} rounded-2xl flex items-center justify-center mb-6`}>
      {children}
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-2">{label}</label>
      <input
        type="time" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-stone-50 border border-stone-200 rounded-[14px] px-3 py-3 text-stone-900 font-mono focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
      />
    </div>
  );
}

function FeatureToggle({ icon, title, description, active, onClick }: { icon: React.ReactNode, title: string, description: string, active: boolean, onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${
        active ? 'bg-tide-50 border-tide-300' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
      }`}
    >
      <div className={`p-2 rounded-xl ${active ? 'bg-white' : 'bg-stone-100'}`}>{icon}</div>
      <div className="flex-1">
        <h3 className="text-stone-900 font-medium mb-1">{title}</h3>
        <p className="text-sm text-stone-500 leading-relaxed">{description}</p>
      </div>
      <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${active ? 'bg-tide-500 border-tide-500' : 'border-stone-300'}`}>
        {active && <Check className="w-4 h-4 text-white" />}
      </div>
    </div>
  );
}
