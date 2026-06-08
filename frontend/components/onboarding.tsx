"use client";

import React, { useState } from 'react';
import { useAppStore, TimeWindow, Routine, browserTimeZone } from '../lib/store';
import {
  ArrowRight, Check, Pill, HeartPulse, Users, Sparkles, LogOut,
  Sun, Sunrise, Sunset, Moon, Clock, Utensils, Brain,
} from 'lucide-react';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // index 0=Mon .. 6=Sun
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const WINDOW_META: Record<TimeWindow, { label: string; icon: React.ReactNode }> = {
  morning: { label: 'Morning', icon: <Sunrise className="w-4 h-4" /> },
  afternoon: { label: 'Afternoon', icon: <Sun className="w-4 h-4" /> },
  evening: { label: 'Evening', icon: <Sunset className="w-4 h-4" /> },
  night: { label: 'Night', icon: <Moon className="w-4 h-4" /> },
};

const TOTAL_STEPS = 5;

export default function Onboarding() {
  const { completeOnboarding, logout, email } = useAppStore();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [medication, setMedication] = useState('');

  // Suggestion + chosen schedule
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [window, setWindow] = useState<TimeWindow | null>('morning');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(ALL_DAYS);

  // Routine
  const [routine, setRoutine] = useState<Routine>({
    wakeTime: '07:00',
    sleepTime: '23:00',
    withFood: false,
    mealTimes: { breakfast: '08:00', lunch: '12:30', dinner: '18:30' },
    variableDays: [],
  });

  const [features, setFeatures] = useState({
    aiInsights: false,
    wellnessCheckIns: true,
    caregiverAccess: false,
  });

  const handleNext = async () => {
    setError(null);
    if (step === 1 && !name) return;
    if (step === 2) {
      if (!medication) return;
      setStep(3);
      return;
    }
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    // Final step -> submit everything.
    setSubmitting(true);
    try {
      await completeOnboarding({
        // Anchor dose times to the patient's device timezone so the dashboard
        // shows the time they actually take it (editable later in Schedule).
        profile: { name, medication, scheduleTime, timezone: browserTimeZone(), features },
        schedule: { time: scheduleTime, daysOfWeek, window, reason: null, source: 'user', rxcui: null },
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

  const toggleDay = (d: number) =>
    setDaysOfWeek(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));

  const toggleVariableDay = (d: number) =>
    setRoutine(prev => ({
      ...prev,
      variableDays: prev.variableDays.includes(d)
        ? prev.variableDays.filter(x => x !== d)
        : [...prev.variableDays, d].sort(),
    }));

  const continueDisabled =
    submitting || (step === 1 && !name) || (step === 2 && !medication) ||
    (step === 3 && daysOfWeek.length === 0);

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
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">Your medication</h1>
              <p className="text-stone-500 mb-8 text-lg">What would you like to keep time with? We&apos;ll use this to set your daily reminder schedule.</p>
              <label className="block text-sm font-medium text-stone-700 mb-2">Medication name</label>
              <input
                type="text" value={medication} onChange={(e) => setMedication(e.target.value)} placeholder="e.g. Levothyroxine"
                className="w-full bg-stone-50 border border-stone-200 rounded-[14px] px-4 py-3 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
              />
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="tide"><Clock className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">When to take it</h1>

              <>
                  {/* Window picker */}
                  <label className="block text-sm font-medium text-stone-700 mb-2 mt-6">Time of day</label>
                  <div className="grid grid-cols-4 gap-2 mb-6">
                    {(Object.keys(WINDOW_META) as TimeWindow[]).map((w) => (
                      <button
                        key={w}
                        onClick={() => setWindow(w)}
                        className={`flex flex-col items-center gap-1 py-3 rounded-[14px] border text-xs transition-all ${
                          window === w ? 'bg-tide-50 border-tide-300 text-tide-700' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        {WINDOW_META[w].icon}
                        {WINDOW_META[w].label}
                      </button>
                    ))}
                  </div>

                  {/* Exact time */}
                  <label className="block text-sm font-medium text-stone-700 mb-2">Exact time</label>
                  <input
                    type="time" value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-[14px] px-4 py-3 text-stone-900 font-mono focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all mb-2"
                  />
                  <p className="text-xs text-stone-500 mb-6">Pinned to this exact time.</p>

                  {/* Days of week */}
                  <label className="block text-sm font-medium text-stone-700 mb-2">Which days?</label>
                  <div className="flex gap-2">
                    {DAY_LABELS.map((lbl, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleDay(idx)}
                        className={`w-10 h-10 rounded-full text-sm font-medium border transition-all ${
                          daysOfWeek.includes(idx) ? 'bg-tide-500 border-tide-500 text-white' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {daysOfWeek.length === 0 && <p className="text-xs text-danger mt-2">Pick at least one day.</p>}
                </>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon tone="apricot"><Sun className="w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-2 tracking-tight">Your daily routine</h1>
              <p className="text-stone-500 mb-8 text-lg">This personalizes your reminders and keeps suggested times realistic.</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <TimeField label="I usually wake up" value={routine.wakeTime} onChange={(v) => setRoutine(p => ({ ...p, wakeTime: v }))} />
                <TimeField label="I usually go to sleep" value={routine.sleepTime} onChange={(v) => setRoutine(p => ({ ...p, sleepTime: v }))} />
              </div>

              <div
                onClick={() => setRoutine(p => ({ ...p, withFood: !p.withFood }))}
                className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-center gap-3 mb-4 ${
                  routine.withFood ? 'bg-tide-50 border-tide-300' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Utensils className="w-5 h-5 text-tide-600" />
                <span className="flex-1 text-stone-900 text-sm">I take this medication with food</span>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${routine.withFood ? 'bg-tide-500 border-tide-500' : 'border-stone-300'}`}>
                  {routine.withFood && <Check className="w-4 h-4 text-white" />}
                </div>
              </div>

              {routine.withFood && (
                <div className="grid grid-cols-3 gap-3 mb-6 animate-in fade-in duration-300">
                  {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                    <TimeField
                      key={meal}
                      label={meal[0].toUpperCase() + meal.slice(1)}
                      value={routine.mealTimes[meal]}
                      onChange={(v) => setRoutine(p => ({ ...p, mealTimes: { ...p.mealTimes, [meal]: v } }))}
                    />
                  ))}
                </div>
              )}

              <label className="block text-sm font-medium text-stone-700 mb-2">Any days your routine is different? (optional)</label>
              <div className="flex gap-2">
                {DAY_LABELS.map((lbl, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleVariableDay(idx)}
                    className={`w-10 h-10 rounded-full text-sm font-medium border transition-all ${
                      routine.variableDays.includes(idx) ? 'bg-apricot-500 border-apricot-500 text-white' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <p className="text-xs text-stone-500 mt-2">We&apos;ll flag these so you can set day-specific times later.</p>
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

          <div className="mt-10 flex justify-end">
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
