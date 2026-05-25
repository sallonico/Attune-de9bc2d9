"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { subDays } from 'date-fns';
import { apiFetch, getToken, setToken } from './api';

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

interface MeResponse {
  user_id: string;
  email: string;
  profile: (UserProfile & { deviceConnected?: boolean; remindMeCount?: number }) | null;
}

interface AppState {
  isAuthenticated: boolean;
  authLoading: boolean;
  email: string | null;
  isOnboarded: boolean;
  userProfile: UserProfile | null;
  logs: Log[];
  remindMeCount: number;
  deviceConnected: boolean;
  showWellnessModal: boolean;
  pendingLogId: string | null;

  // Auth actions
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  // App actions
  completeOnboarding: (profile: UserProfile) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  logDose: (status: LogStatus) => void;
  remindMeLater: () => void;
  submitCheckIn: (logId: string, checkIn: CheckIn) => void;
  toggleDeviceConnection: () => void;
  skipCheckIn: () => void;
  resetApp: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

// Generate 30 days of mock data for the "Aha" moment (kept until S3 wires real logs)
const generateMockLogs = (): Log[] => {
  const logs: Log[] = [];
  const today = new Date();

  for (let i = 30; i >= 1; i--) {
    const date = subDays(today, i);
    const dayOfWeek = date.getDay();
    const isWedOrThu = dayOfWeek === 3 || dayOfWeek === 4;
    const chanceToTake = isWedOrThu ? 0.3 : 0.9;
    const status: LogStatus = Math.random() < chanceToTake ? 'taken' : 'missed';

    logs.push({
      id: `mock-${i}`,
      timestamp: date,
      status,
      checkIn: status === 'taken' ? {
        physical: Math.floor(Math.random() * 2) + 4,
        emotional: Math.floor(Math.random() * 2) + 4,
      } : {
        physical: Math.floor(Math.random() * 3) + 1,
        emotional: Math.floor(Math.random() * 3) + 1,
      }
    });
  }
  return logs;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [remindMeCount, setRemindMeCount] = useState(0);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);

  const hydrateFromMe = useCallback((me: MeResponse) => {
    setIsAuthenticated(true);
    setEmail(me.email);
    if (me.profile) {
      setUserProfile({
        name: me.profile.name,
        medication: me.profile.medication,
        scheduleTime: me.profile.scheduleTime,
        features: me.profile.features,
      });
      setIsOnboarded(true);
      if (typeof me.profile.deviceConnected === 'boolean') setDeviceConnected(me.profile.deviceConnected);
      if (typeof me.profile.remindMeCount === 'number') setRemindMeCount(me.profile.remindMeCount);
    } else {
      setUserProfile(null);
      setIsOnboarded(false);
    }
  }, []);

  // Bootstrap: if we have a token, hydrate via /auth/me
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const token = getToken();
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await apiFetch<MeResponse>('/auth/me');
        if (cancelled) return;
        hydrateFromMe(me);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    boot();
    // Seed mock logs until S3 wires real logs
    setLogs(generateMockLogs());
    return () => {
      cancelled = true;
    };
  }, [hydrateFromMe]);

  const signup = async (emailVal: string, password: string) => {
    const res = await apiFetch<{ access_token: string; email: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: emailVal, password }),
    });
    setToken(res.access_token);
    const me = await apiFetch<MeResponse>('/auth/me');
    hydrateFromMe(me);
  };

  const login = async (emailVal: string, password: string) => {
    const res = await apiFetch<{ access_token: string; email: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: emailVal, password }),
    });
    setToken(res.access_token);
    const me = await apiFetch<MeResponse>('/auth/me');
    hydrateFromMe(me);
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore; we clear client state regardless
    }
    setToken(null);
    setIsAuthenticated(false);
    setEmail(null);
    setIsOnboarded(false);
    setUserProfile(null);
    setLogs(generateMockLogs());
    setRemindMeCount(0);
    setDeviceConnected(false);
  };

  const completeOnboarding = async (profile: UserProfile) => {
    const res = await apiFetch<UserProfile & { deviceConnected?: boolean; remindMeCount?: number }>(
      '/profile',
      {
        method: 'POST',
        body: JSON.stringify(profile),
      }
    );
    setUserProfile({
      name: res.name,
      medication: res.medication,
      scheduleTime: res.scheduleTime,
      features: res.features,
    });
    if (typeof res.deviceConnected === 'boolean') setDeviceConnected(res.deviceConnected);
    if (typeof res.remindMeCount === 'number') setRemindMeCount(res.remindMeCount);
    setIsOnboarded(true);
  };

  const updateProfile = async (patch: Partial<UserProfile>) => {
    const res = await apiFetch<UserProfile & { deviceConnected?: boolean; remindMeCount?: number }>(
      '/profile',
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    setUserProfile({
      name: res.name,
      medication: res.medication,
      scheduleTime: res.scheduleTime,
      features: res.features,
    });
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
    // Reset is now an alias for logout — keeps the nav button behavior intact
    void logout();
  };

  return (
    <AppContext.Provider value={{
      isAuthenticated,
      authLoading,
      email,
      isOnboarded,
      userProfile,
      logs,
      remindMeCount,
      deviceConnected,
      showWellnessModal,
      pendingLogId,
      signup,
      login,
      logout,
      completeOnboarding,
      updateProfile,
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
