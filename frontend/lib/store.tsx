"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { subDays, format, isSameDay } from 'date-fns';

export type LogStatus = 'taken' | 'missed';

export interface CheckIn {
  physical: number; // 1-5 scale
  emotional: number; // 1-5 scale
  note?: string;
}

export interface Log {
  id: string;
  timestamp: Date;
  status: LogStatus;
  checkIn?: CheckIn;
}

export interface UserProfile {
  name: string;
  medication: string;
  scheduleTime: string; // HH:mm
  features: {
    aiInsights: boolean;
    wellnessCheckIns: boolean;
    caregiverAccess: boolean;
  };
}

interface AppState {
  isOnboarded: boolean;
  userProfile: UserProfile | null;
  logs: Log[];
  remindMeCount: number;
  deviceConnected: boolean;
  showWellnessModal: boolean;
  pendingLogId: string | null;
  
  // Actions
  completeOnboarding: (profile: UserProfile) => void;
  logDose: (status: LogStatus) => void;
  remindMeLater: () => void;
  submitCheckIn: (logId: string, checkIn: CheckIn) => void;
  toggleDeviceConnection: () => void;
  skipCheckIn: () => void;
  resetApp: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

// Generate 30 days of mock data for the "Aha" moment
const generateMockLogs = (): Log[] => {
  const logs: Log[] = [];
  const today = new Date();
  
  for (let i = 30; i >= 1; i--) {
    const date = subDays(today, i);
    // Create a pattern: misses often on Wed/Thu
    const dayOfWeek = date.getDay();
    const isWedOrThu = dayOfWeek === 3 || dayOfWeek === 4;
    
    // 80% chance to take normally, but on Wed/Thu it drops to 30%
    const chanceToTake = isWedOrThu ? 0.3 : 0.9;
    const status: LogStatus = Math.random() < chanceToTake ? 'taken' : 'missed';
    
    logs.push({
      id: `mock-${i}`,
      timestamp: date,
      status,
      checkIn: status === 'taken' ? {
        physical: Math.floor(Math.random() * 2) + 4, // 4-5
        emotional: Math.floor(Math.random() * 2) + 4,
      } : {
        physical: Math.floor(Math.random() * 3) + 1, // 1-3
        emotional: Math.floor(Math.random() * 3) + 1,
      }
    });
  }
  return logs;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [remindMeCount, setRemindMeCount] = useState(0);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);

  // Load mock data on mount
  useEffect(() => {
    setLogs(generateMockLogs());
  }, []);

  const completeOnboarding = (profile: UserProfile) => {
    setUserProfile(profile);
    setIsOnboarded(true);
  };

  const logDose = (status: LogStatus) => {
    const newLog: Log = {
      id: `log-${Date.now()}`,
      timestamp: new Date(),
      status,
    };
    
    setLogs(prev => [...prev, newLog]);
    setRemindMeCount(0);
    
    if (userProfile?.features.wellnessCheckIns) {
      setPendingLogId(newLog.id);
      setShowWellnessModal(true);
    }
  };

  const remindMeLater = () => {
    const newCount = remindMeCount + 1;
    if (newCount >= 3) {
      logDose('missed');
    } else {
      setRemindMeCount(newCount);
      // In a real app, this would schedule a local notification
      console.log(`Reminding in 15 mins. Count: ${newCount}/3`);
    }
  };

  const submitCheckIn = (logId: string, checkIn: CheckIn) => {
    setLogs(prev => prev.map(log => 
      log.id === logId ? { ...log, checkIn } : log
    ));
    setShowWellnessModal(false);
    setPendingLogId(null);
  };

  const skipCheckIn = () => {
    setShowWellnessModal(false);
    setPendingLogId(null);
  };

  const toggleDeviceConnection = () => {
    setDeviceConnected(prev => !prev);
  };

  const resetApp = () => {
    setIsOnboarded(false);
    setUserProfile(null);
    setLogs(generateMockLogs());
    setRemindMeCount(0);
    setDeviceConnected(false);
  };

  return (
    <AppContext.Provider value={{
      isOnboarded,
      userProfile,
      logs,
      remindMeCount,
      deviceConnected,
      showWellnessModal,
      pendingLogId,
      completeOnboarding,
      logDose,
      remindMeLater,
      submitCheckIn,
      toggleDeviceConnection,
      skipCheckIn,
      resetApp
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
};

