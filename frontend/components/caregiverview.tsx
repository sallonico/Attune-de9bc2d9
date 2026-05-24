"use client";

import React from 'react';
import { useAppStore } from '../lib/store';
import { Users, Activity, Brain, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function CaregiverView() {
  const { userProfile, logs } = useAppStore();

  // Mock caregiver data based on patient data
  const patientName = userProfile?.name || 'Patient';
  const trend = 82; // Mocked for visual

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-teal-400" />
            Caregiver Dashboard
          </h1>
          <p className="text-slate-400 mt-1">
            Monitoring adherence and wellness for {patientName}
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
            <StatBox label="Adherence" value={`${trend}%`} color="text-teal-400" />
            <StatBox label="Missed Doses" value="4" color="text-rose-400" />
            <StatBox label="Avg Physical" value="4.2/5" color="text-indigo-400" />
            <StatBox label="Avg Mood" value="3.8/5" color="text-purple-400" />
          </div>

          {/* AI Alert for Caregiver */}
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5 flex gap-4">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
            <div>
              <h3 className="text-white font-medium mb-1">Attention Needed</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                {patientName} has missed 2 consecutive evening doses. Their recent wellness check-ins indicate lower physical energy levels. A gentle check-in call might be helpful.
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-400" />
            Recent Activity
          </h2>
          
          <div className="space-y-4">
            <ActivityItem 
              title="Dose Taken" 
              time="Today, 8:05 AM" 
              status="good"
              note="Feeling great today!"
            />
            <ActivityItem 
              title="Dose Missed" 
              time="Yesterday, 8:00 PM" 
              status="bad"
            />
            <ActivityItem 
              title="Dose Taken" 
              time="Yesterday, 8:10 AM" 
              status="good"
              note="Slight headache"
            />
            <ActivityItem 
              title="Settings Updated" 
              time="2 days ago" 
              status="neutral"
            />
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

function ActivityItem({ title, time, status, note }: { title: string, time: string, status: 'good'|'bad'|'neutral', note?: string }) {
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
            "{note}"
          </p>
        )}
      </div>
    </div>
  );
}

