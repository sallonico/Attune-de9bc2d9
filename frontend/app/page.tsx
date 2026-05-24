"use client";

import React, { useState } from 'react';
import { AppProvider, useAppStore } from '@/lib/store';
import Onboarding from '@/components/onboarding';
import Dashboard from '@/components/dashboard';
import CaregiverView from '@/components/caregiverview';
import WellnessModal from '@/components/wellnessmodal';
import AuthGate from '@/components/authgate';
import { Activity, Users, Settings, LogOut } from 'lucide-react';

function MainApp() {
  const { isAuthenticated, authLoading, isOnboarded, userProfile, resetApp } = useAppStore();
  const [activeTab, setActiveTab] = useState<'patient' | 'caregiver'>('patient');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthGate />;
  }

  if (!isOnboarded) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-teal-500/30">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-teal-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-white/10 bg-slate-950/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              ATTUNE
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex bg-black/40 p-1 rounded-full border border-white/5">
              <button
                onClick={() => setActiveTab('patient')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  activeTab === 'patient' 
                    ? 'bg-white/10 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                My Dashboard
              </button>
              {userProfile?.features.caregiverAccess && (
                <button
                  onClick={() => setActiveTab('caregiver')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    activeTab === 'caregiver' 
                      ? 'bg-white/10 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden md:inline">Caregiver View</span>
                </button>
              )}
            </div>

            <button 
              onClick={resetApp}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors ml-2"
              title="Reset Prototype"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8 md:py-12">
        {activeTab === 'patient' ? <Dashboard /> : <CaregiverView />}
      </main>

      <WellnessModal />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

