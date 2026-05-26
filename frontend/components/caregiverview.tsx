"use client";

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Users, Activity, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ActivityEntry {
  title: string;
  time: string;
  status: 'good' | 'bad' | 'neutral';
  note?: string;
}

interface CaregiverSummary {
  patientName: string;
  adherence: number;
  missedDoses: number;
  avgPhysical: number;
  avgMood: number;
  alert: { title: string; body: string } | null;
  recentActivity: ActivityEntry[];
}

export default function CaregiverView() {
  const [summary, setSummary] = useState<CaregiverSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<CaregiverSummary>('/caregiver/summary');
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Unable to load caregiver data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-rose-300">
        {error || 'No caregiver data.'}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-teal-400" />
            Caregiver Dashboard
          </h1>
          <p className="text-slate-400 mt-1">
            Monitoring adherence and wellness for {summary.patientName}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium">
          <ShieldCheck className="w-4 h-4" />
          Access Active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Patient Overview Card */}
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold text-white">30-Day Overview</h2>
            <span className="text-sm text-slate-400">Updated just now</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatBox label="Adherence" value={`${summary.adherence}%`} color="text-teal-400" />
            <StatBox label="Missed Doses" value={String(summary.missedDoses)} color="text-rose-400" />
            <StatBox label="Avg Physical" value={`${summary.avgPhysical}/5`} color="text-indigo-400" />
            <StatBox label="Avg Mood" value={`${summary.avgMood}/5`} color="text-purple-400" />
          </div>

          {summary.alert && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5 flex gap-4">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <h3 className="text-white font-medium mb-1">{summary.alert.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{summary.alert.body}</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-400" />
            Recent Activity
          </h2>

          <div className="space-y-4">
            {summary.recentActivity.length === 0 && (
              <p className="text-sm text-slate-500">No activity yet.</p>
            )}
            {summary.recentActivity.map((item, i) => (
              <ActivityItem key={i} {...item} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ActivityItem({ title, time, status, note }: ActivityEntry) {
  const colors = {
    good: 'bg-teal-500/20 text-teal-400 border-teal-500/20',
    bad: 'bg-rose-500/20 text-rose-400 border-rose-500/20',
    neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/20'
  };

  return (
    <div className="flex gap-4 relative">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full mt-1.5 ${colors[status].split(' ')[0]}`} />
        <div className="w-px h-full bg-white/10 my-1" />
      </div>
      <div className="pb-4">
        <p className="text-white font-medium text-sm">{title}</p>
        <p className="text-slate-500 text-xs mb-1">{time}</p>
        {note && (
          <p className="text-slate-300 text-xs bg-white/5 p-2 rounded-lg mt-2 border border-white/5 inline-block">
            &ldquo;{note}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
