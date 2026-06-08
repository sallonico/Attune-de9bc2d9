"use client";

import React, { useState } from 'react';
import { AppProvider, useAppStore } from '@/lib/store';
import Onboarding from '@/components/onboarding';
import Dashboard from '@/components/dashboard';
import CaregiverView from '@/components/caregiverview';
import CaregiverApp from '@/components/caregiverapp';
import ScheduleSettings from '@/components/schedulesettings';
import WellnessModal from '@/components/wellnessmodal';
import AuthGate from '@/components/authgate';
import { AttuneLogo } from '@/components/brand/logo';
import { Users, CalendarClock, LogOut } from 'lucide-react';

function MainApp() {
  const { isAuthenticated, authLoading, role, isOnboarded, userProfile, resetApp } = useAppStore();
  const [activeTab, setActiveTab] = useState<'patient' | 'schedule' | 'caregiver'>('patient');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-tide-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthGate />;
  }

  // Caregiver accounts have their own app — no medication onboarding/dashboard.
  if (role === 'caregiver') {
    return <CaregiverApp />;
  }

  if (!isOnboarded) {
    return <Onboarding />;
  }

  const tabClass = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
      active
        ? 'bg-white text-tide-700 shadow-[var(--shadow-sm)]'
        : 'text-stone-500 hover:text-stone-800'
    }`;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-700 selection:bg-tide-200">
      {/* Soft radial atmosphere — very low-opacity tide/apricot tint */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-25%] left-[-10%] w-[55%] h-[55%] bg-tide-200/30 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-25%] right-[-10%] w-[55%] h-[55%] bg-apricot-200/25 rounded-full blur-[140px]" />
      </div>

      {/* Slim sticky header */}
      <nav className="relative z-10 border-b border-stone-200 bg-stone-50/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <AttuneLogo />

          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex bg-stone-100 p-1 rounded-full border border-stone-200">
              <button onClick={() => setActiveTab('patient')} className={tabClass(activeTab === 'patient')}>
                Today
              </button>
              <button onClick={() => setActiveTab('schedule')} className={tabClass(activeTab === 'schedule')}>
                <CalendarClock className="w-4 h-4" />
                <span className="hidden md:inline">Schedule</span>
              </button>
              {userProfile?.features.caregiverAccess && (
                <button onClick={() => setActiveTab('caregiver')} className={tabClass(activeTab === 'caregiver')}>
                  <Users className="w-4 h-4" />
                  <span className="hidden md:inline">Caregiver view</span>
                </button>
              )}
            </div>

            <button
              onClick={resetApp}
              className="p-2 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-colors ml-2"
              title="Reset prototype"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8 md:py-12">
        {activeTab === 'patient' && <Dashboard />}
        {activeTab === 'schedule' && <ScheduleSettings />}
        {activeTab === 'caregiver' && <CaregiverView />}
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

