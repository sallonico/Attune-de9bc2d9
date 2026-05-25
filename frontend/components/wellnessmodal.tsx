"use client";

import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { HeartPulse, X, ArrowRight } from 'lucide-react';

export default function WellnessModal() {
  const { showWellnessModal, pendingLogId, submitCheckIn, skipCheckIn } = useAppStore();

  const [physical, setPhysical] = useState<number>(0);
  const [emotional, setEmotional] = useState<number>(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showWellnessModal || !pendingLogId) return null;

  const handleSubmit = async () => {
    if (physical === 0 || emotional === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCheckIn(pendingLogId, { physical, emotional, note });
      setTimeout(() => {
        setPhysical(0);
        setEmotional(0);
        setNote('');
      }, 300);
    } catch (e) {
      setError((e as Error).message || 'Failed to save check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  const emojis = [
    { val: 1, label: 'Terrible', emoji: '😫' },
    { val: 2, label: 'Poor', emoji: '🙁' },
    { val: 3, label: 'Okay', emoji: '😐' },
    { val: 4, label: 'Good', emoji: '🙂' },
    { val: 5, label: 'Great', emoji: '🤩' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={skipCheckIn}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 rounded-xl">
              <HeartPulse className="w-5 h-5 text-rose-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Quick Check-in</h2>
          </div>
          <button 
            onClick={skipCheckIn}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-8">
          
          {/* Physical */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-4 text-center">
              Physically, how are you feeling right now?
            </label>
            <div className="flex justify-between gap-2">
              {emojis.map((item) => (
                <button
                  key={`phys-${item.val}`}
                  onClick={() => setPhysical(item.val)}
                  className={`flex flex-col items-center gap-2 p-2 rounded-2xl transition-all flex-1 ${
                    physical === item.val 
                      ? 'bg-white/10 scale-110 shadow-lg border border-white/20' 
                      : 'hover:bg-white/5 opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
                  }`}
                >
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emotional */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-4 text-center">
              Emotionally, how is your mood?
            </label>
            <div className="flex justify-between gap-2">
              {emojis.map((item) => (
                <button
                  key={`emo-${item.val}`}
                  onClick={() => setEmotional(item.val)}
                  className={`flex flex-col items-center gap-2 p-2 rounded-2xl transition-all flex-1 ${
                    emotional === item.val 
                      ? 'bg-white/10 scale-110 shadow-lg border border-white/20' 
                      : 'hover:bg-white/5 opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
                  }`}
                >
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <input 
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any specific symptoms? (Optional)"
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 transition-all"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          {error && (
            <p className="mb-3 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={physical === 0 || emotional === 0 || submitting}
            className="w-full group relative overflow-hidden bg-gradient-to-r from-rose-500 to-orange-500 px-6 py-4 rounded-xl font-semibold text-white shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/40 hover:scale-[1.02] transform transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            <span className="relative z-10">{submitting ? 'Saving...' : 'Save Check-in'}</span>
            <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={skipCheckIn}
            className="w-full mt-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Skip for now
          </button>
        </div>

      </div>
    </div>
  );
}

