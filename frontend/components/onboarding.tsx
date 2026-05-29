"use client";

import React, { useState } from 'react';
import { useAppStore, TimeWindow, Suggestion, Routine } from '../lib/store';
import {
  ArrowRight, Check, Pill, Brain, HeartPulse, Users, Sparkles, LogOut,
  Sun, Sunrise, Sunset, Moon, Clock, Utensils, AlertTriangle, ShieldCheck,
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
  const { completeOnboarding, fetchSuggestion, logout, email } = useAppStore();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [medication, setMedication] = useState('');

  // Suggestion + chosen schedule
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [window, setWindow] = useState<TimeWindow | null>(null);
  const [source, setSource] = useState<'ai' | 'user'>('user');
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
    aiInsights: true,
    wellnessCheckIns: true,
    caregiverAccess: false,
  });

  const runSuggestion = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const s = await fetchSuggestion(medication);
      setSuggestion(s);
      setScheduleTime(s.time);
      setWindow(s.window);
      // Keep AI-sourced unless we had to fall back to a manual pick.
      setSource(s.needsManual ? 'user' : 'ai');
      if (typeof s.withFood === 'boolean') {
        setRoutine(prev => ({ ...prev, withFood: s.withFood as boolean }));
      }
    } catch {
      // Suggestion is best-effort; fall back to a plain time pick.
      setSuggestion({
        window: 'morning', reason: null, confidence: 'low', withFood: null, rxcui: null,
        tier: 'manual', grounded: false, unverified: false, needsManual: true, time: '08:00',
      });
      setWindow('morning');
      setSource('user');
    } finally {
      setSuggesting(false);
    }
  };

  const handleNext = async () => {
    setError(null);
    if (step === 1 && !name) return;
    if (step === 2) {
      if (!medication) return;
      setStep(3);
      await runSuggestion();
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
        profile: { name, medication, scheduleTime, features },
        schedule: { time: scheduleTime, daysOfWeek, window, reason: suggestion?.reason ?? null, source, rxcui: suggestion?.rxcui ?? null },
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
    submitting || suggesting || (step === 1 && !name) || (step === 2 && !medication) ||
    (step === 3 && daysOfWeek.length === 0);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-teal-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-xl relative z-10">
        <div className="flex items-center justify-between mb-6 text-xs text-slate-400">
          <span className="truncate max-w-[60%]">{email ? `Signed in as ${email}` : ''}</span>
          <button
            onClick={() => void logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
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
                i < step ? 'bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl shadow-teal-900/20">

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon gradient="from-teal-400 to-emerald-500"><Sparkles className="text-white w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Welcome to ATTUNE</h1>
              <p className="text-slate-400 mb-8 text-lg">Let&apos;s set up smart medication reminders. This takes about a minute.</p>
              <label className="block text-sm font-medium text-slate-300 mb-2">What should we call you?</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Margaret"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
              />
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon gradient="from-indigo-400 to-purple-500"><Pill className="text-white w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Your Medication</h1>
              <p className="text-slate-400 mb-8 text-lg">What medication would you like to track? We&apos;ll look up the best time to take it.</p>
              <label className="block text-sm font-medium text-slate-300 mb-2">Medication Name</label>
              <input
                type="text" value={medication} onChange={(e) => setMedication(e.target.value)} placeholder="e.g. Levothyroxine"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon gradient="from-amber-400 to-orange-500"><Clock className="text-white w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">When to take it</h1>

              {suggesting ? (
                <div className="flex items-center gap-3 text-slate-400 py-8">
                  <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  Looking up the best timing for {medication}…
                </div>
              ) : (
                <>
                  {/* Suggestion banner — honors the 3 tiers */}
                  {suggestion?.grounded && (
                    <div className="mb-6 bg-teal-500/10 border border-teal-500/30 rounded-2xl p-4 flex gap-3">
                      <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-teal-200 mb-1">
                          Suggested: {window && WINDOW_META[window].label}
                          {suggestion.withFood === true && ' · with food'}
                          {suggestion.withFood === false && ' · empty stomach'}
                        </p>
                        {suggestion.reason && <p className="text-sm text-slate-300 leading-relaxed">{suggestion.reason}</p>}
                        <p className="text-[11px] text-slate-500 mt-2">Based on the FDA drug label · always confirm with your pharmacist.</p>
                      </div>
                    </div>
                  )}
                  {suggestion?.unverified && (
                    <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-200 mb-1">Suggested: {window && WINDOW_META[window].label}</p>
                        <p className="text-sm text-slate-300">This is a general timing suggestion only — please confirm the right time with your pharmacist.</p>
                      </div>
                    </div>
                  )}
                  {suggestion?.needsManual && (
                    <p className="text-slate-400 mb-6">We couldn&apos;t find official timing guidance for this one — choose the time that works for you.</p>
                  )}

                  {/* Window picker */}
                  <label className="block text-sm font-medium text-slate-300 mb-2">Time of day</label>
                  <div className="grid grid-cols-4 gap-2 mb-6">
                    {(Object.keys(WINDOW_META) as TimeWindow[]).map((w) => (
                      <button
                        key={w}
                        onClick={() => { setWindow(w); if (source === 'user') setSource('ai'); }}
                        className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs transition-all ${
                          window === w ? 'bg-white/10 border-teal-500/50 text-white' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        {WINDOW_META[w].icon}
                        {WINDOW_META[w].label}
                      </button>
                    ))}
                  </div>

                  {/* Exact time */}
                  <label className="block text-sm font-medium text-slate-300 mb-2">Exact time</label>
                  <input
                    type="time" value={scheduleTime}
                    onChange={(e) => { setScheduleTime(e.target.value); setSource('user'); }}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all [color-scheme:dark] mb-2"
                  />
                  <p className="text-xs text-slate-500 mb-6">
                    {source === 'ai'
                      ? 'We’ll keep this aligned to your routine (set next). Edit the time to pin it exactly.'
                      : 'Pinned to this exact time.'}
                  </p>

                  {/* Days of week */}
                  <label className="block text-sm font-medium text-slate-300 mb-2">Which days?</label>
                  <div className="flex gap-2">
                    {DAY_LABELS.map((lbl, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleDay(idx)}
                        className={`w-10 h-10 rounded-full text-sm font-medium border transition-all ${
                          daysOfWeek.includes(idx) ? 'bg-teal-500 border-teal-500 text-white' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {daysOfWeek.length === 0 && <p className="text-xs text-rose-400 mt-2">Pick at least one day.</p>}
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon gradient="from-rose-400 to-pink-500"><Sun className="text-white w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Your daily routine</h1>
              <p className="text-slate-400 mb-8 text-lg">This personalizes your reminders and keeps suggested times realistic.</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <TimeField label="I usually wake up" value={routine.wakeTime} onChange={(v) => setRoutine(p => ({ ...p, wakeTime: v }))} />
                <TimeField label="I usually go to sleep" value={routine.sleepTime} onChange={(v) => setRoutine(p => ({ ...p, sleepTime: v }))} />
              </div>

              <div
                onClick={() => setRoutine(p => ({ ...p, withFood: !p.withFood }))}
                className={`cursor-pointer p-4 rounded-2xl border transition-all flex items-center gap-3 mb-4 ${
                  routine.withFood ? 'bg-white/10 border-teal-500/50' : 'bg-black/20 border-white/10 hover:bg-white/5'
                }`}
              >
                <Utensils className="w-5 h-5 text-teal-400" />
                <span className="flex-1 text-white text-sm">I take this medication with food</span>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${routine.withFood ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}>
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

              <label className="block text-sm font-medium text-slate-300 mb-2">Any days your routine is different? (optional)</label>
              <div className="flex gap-2">
                {DAY_LABELS.map((lbl, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleVariableDay(idx)}
                    className={`w-10 h-10 rounded-full text-sm font-medium border transition-all ${
                      routine.variableDays.includes(idx) ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">We&apos;ll flag these so you can set day-specific times later.</p>
            </div>
          )}

          {step === 5 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <StepIcon gradient="from-rose-400 to-orange-500"><Brain className="text-white w-6 h-6" /></StepIcon>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Customize Your Experience</h1>
              <p className="text-slate-400 mb-8 text-lg">Choose the features that matter to you. You can always change these later.</p>
              <div className="space-y-4">
                <FeatureToggle icon={<Brain className="w-5 h-5 text-indigo-400" />} title="AI Pattern Insights" description="Get personalized suggestions based on your adherence trends." active={features.aiInsights} onClick={() => toggleFeature('aiInsights')} />
                <FeatureToggle icon={<HeartPulse className="w-5 h-5 text-rose-400" />} title="Wellness Check-ins" description="Quick 1-tap check-ins after doses to track how you feel." active={features.wellnessCheckIns} onClick={() => toggleFeature('wellnessCheckIns')} />
                <FeatureToggle icon={<Users className="w-5 h-5 text-teal-400" />} title="Caregiver Dashboard" description="Allow a family member or doctor to view your progress." active={features.caregiverAccess} onClick={() => toggleFeature('caregiverAccess')} />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-6 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="mt-10 flex justify-end">
            <button
              onClick={handleNext}
              disabled={continueDisabled}
              className="group relative overflow-hidden bg-gradient-to-r from-teal-500 to-emerald-500 px-8 py-4 rounded-xl font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/40 hover:scale-[1.02] transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
            >
              <span className="relative z-10">{submitting ? 'Saving...' : step === TOTAL_STEPS ? 'Complete Setup' : 'Continue'}</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIcon({ gradient, children }: { gradient: string; children: React.ReactNode }) {
  return (
    <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center mb-6 shadow-lg`}>
      {children}
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <input
        type="time" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all [color-scheme:dark]"
      />
    </div>
  );
}

function FeatureToggle({ icon, title, description, active, onClick }: { icon: React.ReactNode, title: string, description: string, active: boolean, onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${
        active ? 'bg-white/10 border-teal-500/50 shadow-[0_0_15px_rgba(45,212,191,0.1)]' : 'bg-black/20 border-white/5 hover:bg-white/5'
      }`}
    >
      <div className={`p-2 rounded-xl ${active ? 'bg-white/10' : 'bg-black/30'}`}>{icon}</div>
      <div className="flex-1">
        <h3 className="text-white font-medium mb-1">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
      <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${active ? 'bg-teal-500 border-teal-500' : 'border-slate-600'}`}>
        {active && <Check className="w-4 h-4 text-white" />}
      </div>
    </div>
  );
}
