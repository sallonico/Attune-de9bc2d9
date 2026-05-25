"use client";

import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { ArrowRight, Check, Pill, Brain, HeartPulse, Users, Sparkles, LogOut } from 'lucide-react';

export default function Onboarding() {
  const { completeOnboarding, logout, email } = useAppStore();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [medication, setMedication] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');

  const [features, setFeatures] = useState({
    aiInsights: true,
    wellnessCheckIns: true,
    caregiverAccess: false,
  });

  const handleNext = async () => {
    setError(null);
    if (step === 1 && !name) return;
    if (step === 2 && !medication) return;
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding({ name, medication, scheduleTime, features });
    } catch (e) {
      setError((e as Error).message || 'Failed to save profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFeature = (key: keyof typeof features) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-teal-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px]" />
      
      <div className="w-full max-w-xl relative z-10">
        {/* Top bar: signed-in identity + logout */}
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
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i <= step ? 'bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)]' : 'bg-white/10'
              }`} 
            />
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl shadow-teal-900/20">
          
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-teal-500/30">
                <Sparkles className="text-white w-6 h-6" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Welcome to ATTUNE
              </h1>
              <p className="text-slate-400 mb-8 text-lg">
                Let's get your medication profile set up. This will only take a minute.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">What should we call you?</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Margaret"
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/30">
                <Pill className="text-white w-6 h-6" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Your Medication
              </h1>
              <p className="text-slate-400 mb-8 text-lg">
                What is the primary medication you want to track?
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Medication Name</label>
                  <input 
                    type="text" 
                    value={medication}
                    onChange={(e) => setMedication(e.target.value)}
                    placeholder="e.g. Levothyroxine"
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Daily Schedule Time</label>
                  <input 
                    type="time" 
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-12 h-12 bg-gradient-to-br from-rose-400 to-orange-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-rose-500/30">
                <Brain className="text-white w-6 h-6" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Customize Your Experience
              </h1>
              <p className="text-slate-400 mb-8 text-lg">
                Choose the features that matter to you. You can always change these later.
              </p>

              <div className="space-y-4">
                <FeatureToggle 
                  icon={<Brain className="w-5 h-5 text-indigo-400" />}
                  title="AI Pattern Insights"
                  description="Get personalized suggestions based on your adherence trends."
                  active={features.aiInsights}
                  onClick={() => toggleFeature('aiInsights')}
                />
                <FeatureToggle 
                  icon={<HeartPulse className="w-5 h-5 text-rose-400" />}
                  title="Wellness Check-ins"
                  description="Quick 1-tap check-ins after doses to track how you feel."
                  active={features.wellnessCheckIns}
                  onClick={() => toggleFeature('wellnessCheckIns')}
                />
                <FeatureToggle 
                  icon={<Users className="w-5 h-5 text-teal-400" />}
                  title="Caregiver Dashboard"
                  description="Allow a family member or doctor to view your progress."
                  active={features.caregiverAccess}
                  onClick={() => toggleFeature('caregiverAccess')}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-6 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="mt-10 flex justify-end">
            <button
              onClick={handleNext}
              disabled={submitting || (step === 1 && !name) || (step === 2 && !medication)}
              className="group relative overflow-hidden bg-gradient-to-r from-teal-500 to-emerald-500 px-8 py-4 rounded-xl font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/40 hover:scale-[1.02] transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
            >
              <span className="relative z-10">{submitting ? 'Saving...' : step === 3 ? 'Complete Setup' : 'Continue'}</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureToggle({ icon, title, description, active, onClick }: { icon: React.ReactNode, title: string, description: string, active: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${
        active 
          ? 'bg-white/10 border-teal-500/50 shadow-[0_0_15px_rgba(45,212,191,0.1)]' 
          : 'bg-black/20 border-white/5 hover:bg-white/5'
      }`}
    >
      <div className={`p-2 rounded-xl ${active ? 'bg-white/10' : 'bg-black/30'}`}>
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="text-white font-medium mb-1">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
      <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
        active ? 'bg-teal-500 border-teal-500' : 'border-slate-600'
      }`}>
        {active && <Check className="w-4 h-4 text-white" />}
      </div>
    </div>
  );
}

