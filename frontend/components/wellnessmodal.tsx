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
        className="absolute inset-0 bg-[var(--surface-overlay,rgba(31,30,26,0.42))] backdrop-blur-sm animate-in fade-in duration-300"
        style={{ background: 'rgba(31, 30, 26, 0.42)' }}
        onClick={skipCheckIn}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white border border-stone-200 rounded-3xl shadow-[var(--shadow-xl)] overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-6 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-apricot-50 rounded-xl">
              <HeartPulse className="w-5 h-5 text-apricot-600" />
            </div>
            <h2 className="text-xl font-semibold text-stone-900">Quick check-in</h2>
          </div>
          <button
            onClick={skipCheckIn}
            className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-8">
          
          {/* Physical */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-4 text-center">
              Physically, how are you feeling right now?
            </label>
            <div className="flex justify-between gap-2">
              {emojis.map((item) => (
                <button
                  key={`phys-${item.val}`}
                  onClick={() => setPhysical(item.val)}
                  className={`flex flex-col items-center gap-2 p-2 rounded-2xl transition-all flex-1 ${
                    physical === item.val
                      ? 'bg-apricot-50 scale-110 border border-apricot-200'
                      : 'hover:bg-stone-100 opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
                  }`}
                >
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emotional */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-4 text-center">
              Emotionally, how is your mood?
            </label>
            <div className="flex justify-between gap-2">
              {emojis.map((item) => (
                <button
                  key={`emo-${item.val}`}
                  onClick={() => setEmotional(item.val)}
                  className={`flex flex-col items-center gap-2 p-2 rounded-2xl transition-all flex-1 ${
                    emotional === item.val
                      ? 'bg-apricot-50 scale-110 border border-apricot-200'
                      : 'hover:bg-stone-100 opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
                  }`}
                >
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">{item.label}</span>
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
              placeholder="Anything you'd like to note? (optional)"
              className="w-full bg-stone-50 border border-stone-200 rounded-[14px] px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-apricot-500/40 focus:border-apricot-400 transition-all"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          {error && (
            <p className="mb-3 text-sm text-danger bg-danger-subtle border border-danger/20 rounded-[14px] px-3 py-2">
              {error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={physical === 0 || emotional === 0 || submitting}
            className="w-full group bg-apricot-500 hover:bg-apricot-600 px-6 py-4 rounded-[14px] font-semibold text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-accent)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            <span>{submitting ? 'Saving…' : 'Save check-in'}</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={skipCheckIn}
            className="w-full mt-3 py-2 text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            Skip for now
          </button>
        </div>

      </div>
    </div>
  );
}

