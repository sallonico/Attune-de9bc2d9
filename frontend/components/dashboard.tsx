"use client";

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../lib/store';
import { apiFetch } from '../lib/api';
import { format, subDays, isSameDay } from 'date-fns';
import { Brain, CheckCircle2, XCircle, Clock, Activity, Bluetooth, BluetoothOff, AlertTriangle } from 'lucide-react';

interface TrendResponse {
  days: number;
  takenCount: number;
  totalCount: number;
  trendPercentage: number;
}

interface InsightResponse {
  detected: boolean;
  message: string;
  evidence: { date: string; status: 'taken' | 'missed' }[];
}

export default function Dashboard() {
  const {
    userProfile,
    scheduleView,
    logs,
    logDose,
    remindMeLater,
    remindMeCount,
    deviceConnected,
    toggleDeviceConnection
  } = useAppStore();

  const [isConnecting, setIsConnecting] = useState(false);

  // Friendly "next dose" from the resolved schedule, falling back to the
  // legacy flat time if the schedule view hasn't loaded yet.
  const nextDoseLabel = (() => {
    if (scheduleView?.nextDue) {
      const d = new Date(scheduleView.nextDue);
      const today = isSameDay(d, new Date());
      const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return today ? t : `${format(d, 'EEE')} ${t}`;
    }
    return userProfile?.scheduleTime ?? '—';
  })();
  const conflicts = scheduleView?.conflicts ?? [];
  const scheduleReason = scheduleView?.schedule.reason;
  const [trendPercentage, setTrendPercentage] = useState(0);
  const [insight, setInsight] = useState<InsightResponse | null>(null);

  // Server-side trend (refreshes whenever logs change)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await apiFetch<TrendResponse>('/stats/trend?days=30');
        if (!cancelled) setTrendPercentage(t.trendPercentage);
      } catch {
        if (!cancelled) setTrendPercentage(0);
      }
    })();
    return () => { cancelled = true; };
  }, [logs.length]);

  // AI pattern insight
  useEffect(() => {
    if (!userProfile?.features.aiInsights) {
      setInsight(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const i = await apiFetch<InsightResponse>('/insights/pattern');
        if (!cancelled) setInsight(i);
      } catch {
        if (!cancelled) setInsight(null);
      }
    })();
    return () => { cancelled = true; };
  }, [logs.length, userProfile?.features.aiInsights]);

  // Check if today's dose is taken
  const todayLog = logs.find(log => isSameDay(log.timestamp, new Date()));
  const isTakenToday = todayLog?.status === 'taken';
  const isMissedToday = todayLog?.status === 'missed';

  const handleConnectDevice = () => {
    setIsConnecting(true);
    // Simulate connection attempt
    setTimeout(() => {
      setIsConnecting(false);
      toggleDeviceConnection();
    }, 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Header & Device Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Hello, {userProfile?.name} 👋
          </h1>
          <p className="text-slate-400 mt-1">
            Your {userProfile?.medication} — next dose {nextDoseLabel}
          </p>
        </div>

        <button 
          onClick={handleConnectDevice}
          disabled={isConnecting}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
            deviceConnected 
              ? 'bg-teal-500/10 text-teal-400 border-teal-500/30 hover:bg-teal-500/20' 
              : 'bg-slate-800/50 text-slate-300 border-white/10 hover:bg-slate-800'
          }`}
        >
          {isConnecting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : deviceConnected ? (
            <Bluetooth className="w-4 h-4" />
          ) : (
            <BluetoothOff className="w-4 h-4" />
          )}
          {isConnecting ? 'Connecting...' : deviceConnected ? 'ATTUNE Connected' : 'Connect Device'}
        </button>
      </div>

      {/* Schedule conflict warnings */}
      {conflicts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
          {conflicts.map((c, i) => (
            <div key={i} className="flex items-start gap-3 text-sm text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Primary Action Card */}
      <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-slate-300 mb-4">
              <Clock className="w-4 h-4 text-teal-400" />
              Next dose: {nextDoseLabel}
            </div>
            {scheduleReason && (
              <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto md:mx-0">{scheduleReason}</p>
            )}
            
            {isTakenToday ? (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center justify-center md:justify-start gap-3">
                  <CheckCircle2 className="w-8 h-8 text-teal-400" />
                  Dose Completed
                </h2>
                <p className="text-slate-400">You're all set for today. Great job staying on track.</p>
              </div>
            ) : isMissedToday ? (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center justify-center md:justify-start gap-3">
                  <XCircle className="w-8 h-8 text-rose-400" />
                  Dose Missed
                </h2>
                <p className="text-slate-400">It happens. We'll try again tomorrow.</p>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  Time for your medication
                </h2>
                <p className="text-slate-400">
                  {deviceConnected 
                    ? "Press the button on your ATTUNE device, or log it here." 
                    : "Log your dose below to keep your trend accurate."}
                </p>
              </div>
            )}
          </div>

          {!isTakenToday && !isMissedToday && (
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <button 
                onClick={() => logDose('taken')}
                className="group relative overflow-hidden bg-gradient-to-r from-teal-500 to-emerald-500 px-8 py-4 rounded-2xl font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/40 hover:scale-[1.02] transform transition-all duration-300 w-full md:w-64"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Log as Taken
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
              
              <button 
                onClick={remindMeLater}
                className="px-8 py-4 rounded-2xl font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-all w-full md:w-64 flex items-center justify-center gap-2"
              >
                <Clock className="w-5 h-5" />
                Remind me later {remindMeCount > 0 && `(${remindMeCount}/3)`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Insight (The Aha Moment) */}
      {userProfile?.features.aiInsights && insight?.detected && (
        <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400 shrink-0">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                Pattern Detected
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                  AI Insight
                </span>
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                {insight.message}
              </p>

              {insight.evidence.length > 0 && (
                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                  <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">Evidence: Recent Wed/Thu</p>
                  <div className="flex gap-2">
                    {insight.evidence.map((e, i) => (
                      <div
                        key={`${e.date}-${i}`}
                        className={`h-8 flex-1 rounded-md ${e.status === 'taken' ? 'bg-teal-500/80' : 'bg-rose-500/80'}`}
                        title={`${e.date}: ${e.status}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Trend Score */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-slate-400 font-medium">30-Day Trend</h3>
            <Activity className="w-5 h-5 text-teal-400" />
          </div>
          <div className="flex items-end gap-4">
            <span className="text-6xl font-bold text-white tracking-tighter">
              {trendPercentage}%
            </span>
            <span className="text-slate-400 mb-2">adherence</span>
          </div>
          <div className="mt-6 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-1000"
              style={{ width: `${trendPercentage}%` }}
            />
          </div>
        </div>

        {/* 4-Week Heatmap */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-slate-400 font-medium">Recent History</h3>
            <span className="text-xs text-slate-500">Last 28 days</span>
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
              <div key={day} className="text-center text-xs text-slate-500 font-medium mb-2">{day}</div>
            ))}
            
            {/* Generate 28 days of heatmap blocks */}
            {Array.from({ length: 28 }).map((_, i) => {
              const date = subDays(new Date(), 27 - i);
              const log = logs.find(l => isSameDay(l.timestamp, date));
              
              let bgColor = 'bg-slate-800/50 border-white/5'; // No data
              if (log?.status === 'taken') bgColor = 'bg-teal-500/80 border-teal-400/50 shadow-[0_0_10px_rgba(45,212,191,0.2)]';
              if (log?.status === 'missed') bgColor = 'bg-rose-500/80 border-rose-400/50';

              return (
                <div 
                  key={i} 
                  className={`aspect-square rounded-lg border ${bgColor} transition-all hover:scale-110 cursor-default`}
                  title={`${format(date, 'MMM d')}: ${log ? log.status : 'No data'}`}
                />
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}

