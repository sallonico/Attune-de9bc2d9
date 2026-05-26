"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
  logDose: (status: LogStatus) => Promise<void>;
  remindMeLater: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  submitCheckIn: (logId: string, checkIn: CheckIn) => Promise<void>;
  toggleDeviceConnection: () => Promise<void>;
  skipCheckIn: () => void;
  resetApp: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

interface ApiLog {
  id: string;
  timestamp: string;
  status: LogStatus;
  checkIn?: CheckIn;
}

const fromApiLog = (l: ApiLog): Log => ({
  id: l.id,
  timestamp: new Date(l.timestamp),
  status: l.status,
  checkIn: l.checkIn,
});

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

  const refreshLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ logs: ApiLog[] }>('/logs?days=30');
      setLogs(res.logs.map(fromApiLog));
    } catch {
      // ignore — caller decides if it cares
    }
  }, []);

  const hydrateFromMe = useCallback(async (me: MeResponse) => {
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
      await refreshLogs();
    } else {
      setUserProfile(null);
      setIsOnboarded(false);
      setLogs([]);
    }
  }, [refreshLogs]);

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
        await hydrateFromMe(me);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    boot();
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
    await hydrateFromMe(me);
  };

  const login = async (emailVal: string, password: string) => {
    const res = await apiFetch<{ access_token: string; email: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: emailVal, password }),
    });
    setToken(res.access_token);
    const me = await apiFetch<MeResponse>('/auth/me');
    await hydrateFromMe(me);
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
    setLogs([]);
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

  const logDose = async (status: LogStatus) => {
    const created = await apiFetch<ApiLog>('/logs', {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    const newLog = fromApiLog(created);
    setLogs(prev => {
      const others = prev.filter(l => l.id !== newLog.id);
      return [...others, newLog].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    });
    setRemindMeCount(0);

    if (status === 'taken' && userProfile?.features.wellnessCheckIns) {
      setPendingLogId(newLog.id);
      setShowWellnessModal(true);
    }
  };

  const remindMeLater = async () => {
    const res = await apiFetch<{ remindMeCount: number; autoMissed: boolean }>(
      '/reminders/remind-later',
      { method: 'POST' }
    );
    setRemindMeCount(res.remindMeCount);
    if (res.autoMissed) {
      await refreshLogs();
    }
  };

  const submitCheckIn = async (logId: string, checkIn: CheckIn) => {
    const updated = await apiFetch<ApiLog>(`/logs/${logId}/check-in`, {
      method: 'POST',
      body: JSON.stringify(checkIn),
    });
    const updatedLog = fromApiLog(updated);
    setLogs(prev => prev.map(log => (log.id === updatedLog.id ? updatedLog : log)));
    setShowWellnessModal(false);
    setPendingLogId(null);
  };

  const skipCheckIn = () => {
    setShowWellnessModal(false);
    setPendingLogId(null);
  };

  const toggleDeviceConnection = async () => {
    const res = await apiFetch<{ deviceConnected: boolean }>('/device/toggle', { method: 'POST' });
    setDeviceConnected(res.deviceConnected);
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
      refreshLogs,
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
