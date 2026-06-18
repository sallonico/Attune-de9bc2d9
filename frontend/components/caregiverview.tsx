"use client";

import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Users, Activity, AlertTriangle, ShieldCheck, ArrowLeft } from 'lucide-react';

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

const ERROR_COPY: Record<string, string> = {
  caregiver_access_disabled:
    "This patient hasn't enabled caregiver sharing yet. Ask them to turn on the Caregiver Dashboard in their settings.",
  not_connected_to_patient: "You're no longer connected to this patient.",
  profile_not_found: "This patient hasn't finished setting up their account yet.",
};

/**
 * Patient adherence/wellness summary. With `patientId` it shows a linked
 * patient (caregiver context); without it, the signed-in patient's own data.
 */
export default function CaregiverView({
  patientId,
  onBack,
}: {
  patientId?: string;
  onBack?: () => void;
} = {}) {
  const [summary, setSummary] = useState<CaregiverSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const path = patientId
        ? `/connections/patients/${patientId}/summary`
        : '/caregiver/summary';
      try {
        const data = await apiFetch<CaregiverSummary>(path);
        if (!cancelled) setSummary(data);
      } catch (e) {
        const msg = (e as Error).message || 'Unable to load caregiver data.';
        if (!cancelled) setError(ERROR_COPY[msg] || msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-tide-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to patients
          </button>
        )}
        <div className="bg-danger-subtle border border-danger/20 rounded-2xl p-6 text-danger">
          {error || 'No caregiver data.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to patients
        </button>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-tide-600" />
            Caregiver dashboard
          </h1>
          <p className="text-stone-500 mt-1">
            Monitoring adherence and wellness for {summary.patientName}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-success-subtle border border-success/20 rounded-full text-success text-sm font-medium">
          <ShieldCheck className="w-4 h-4" />
          Access active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Patient Overview Card */}
        <div className="lg:col-span-2 bg-white backdrop-blur-xl border border-stone-200 rounded-3xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold text-stone-900">30-day overview</h2>
            <span className="text-sm text-stone-500">Updated just now</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatBox label="Adherence" value={`${summary.adherence}%`} color="text-tide-600" />
            <StatBox label="Missed doses" value={String(summary.missedDoses)} color="text-danger" />
            <StatBox label="Avg physical" value={`${summary.avgPhysical}/5`} color="text-info" />
            <StatBox label="Avg mood" value={`${summary.avgMood}/5`} color="text-apricot-600" />
          </div>

          {summary.alert && (
            <div className="bg-danger-subtle border border-danger/20 rounded-2xl p-5 flex gap-4">
              <AlertTriangle className="w-6 h-6 text-danger shrink-0" />
              <div>
                <h3 className="text-stone-900 font-medium mb-1">{summary.alert.title}</h3>
                <p className="text-stone-600 text-sm leading-relaxed">{summary.alert.body}</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white backdrop-blur-xl border border-stone-200 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-stone-900 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-stone-500" />
            Recent activity
          </h2>

          <div className="space-y-4">
            {summary.recentActivity.length === 0 && (
              <p className="text-sm text-stone-400">No activity yet.</p>
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
    <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
      <p className="text-stone-500 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ActivityItem({ title, time, status, note }: ActivityEntry) {
  const colors = {
    good: 'bg-tide-100 text-tide-600 border-tide-200',
    bad: 'bg-danger-subtle text-danger border-danger/20',
    neutral: 'bg-stone-300 text-stone-500 border-stone-200'
  };

  return (
    <div className="flex gap-4 relative">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full mt-1.5 ${colors[status].split(' ')[0]}`} />
        <div className="w-px h-full bg-stone-100 my-1" />
      </div>
      <div className="pb-4">
        <p className="text-stone-900 font-medium text-sm">{title}</p>
        <p className="text-stone-400 text-xs mb-1">{time}</p>
        {note && (
          <p className="text-stone-600 text-xs bg-white p-2 rounded-lg mt-2 border border-stone-200 inline-block">
            &ldquo;{note}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
