"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { apiFetch, getToken, setToken } from './api';

export type LogStatus = 'taken' | 'missed';
export type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'night';
export type UserRole = 'patient' | 'caregiver';

/** The device's IANA timezone (e.g. "America/New_York"), or "UTC" if unavailable. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

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

export interface DateOverride {
  id: string;
  start: string;            // YYYY-MM-DD
  end: string;              // YYYY-MM-DD
  type: 'shift' | 'set' | 'pause';
  shiftMinutes?: number;
  time?: string;            // HH:mm (type 'set')
  note?: string | null;
}

export interface Schedule {
  time: string;             // HH:mm — default daily dose time
  daysOfWeek: number[];     // Mon=0 .. Sun=6
  window: TimeWindow | null;
  reason: string | null;
  source: 'ai' | 'user';
  rxcui: string | null;
  dayOverrides: Record<string, string>;   // { "5": "10:00" }
  dateOverrides: DateOverride[];
}

export interface Routine {
  wakeTime: string;
  sleepTime: string;
  withFood: boolean;
  mealTimes: Record<string, string>;       // { breakfast, lunch, dinner }
  variableDays: number[];
}

export interface UpcomingDose {
  date: string;             // YYYY-MM-DD
  time: string | null;      // null = no dose / skipped
  skipped: boolean;
}

export interface Conflict {
  type: string;
  message: string;
}

export interface ScheduleView {
  schedule: Schedule;
  routine: Routine;
  timezone: string;         // IANA name (e.g. "America/New_York") doses are anchored to
  nextDue: string | null;   // ISO datetime (carries the user's tz offset)
  upcoming: UpcomingDose[];
  conflicts: Conflict[];
}

export interface UserProfile {
  name: string;
  medication: string;
  scheduleTime: string; // HH:mm
  timezone: string;     // IANA name, e.g. "America/New_York"
  features: {
    aiInsights: boolean;
    wellnessCheckIns: boolean;
    caregiverAccess: boolean;
  };
}

// Everything completeOnboarding needs to persist in one go.
export interface OnboardingData {
  profile: UserProfile;
  schedule: {
    time: string;
    daysOfWeek: number[];
    window: TimeWindow | null;
    reason: string | null;
    source: 'ai' | 'user';
    rxcui: string | null;
  };
  routine: Routine;
}

interface MeResponse {
  user_id: string;
  email: string;
  role: UserRole;
  connectionCode?: string | null;
  profile:
    | (UserProfile & { deviceConnected?: boolean; remindMeCount?: number; schedule?: Schedule; routine?: Routine })
    | null;
}

interface AppState {
  isAuthenticated: boolean;
  authLoading: boolean;
  email: string | null;
  role: UserRole | null;
  connectionCode: string | null;
  isOnboarded: boolean;
  userProfile: UserProfile | null;
  scheduleView: ScheduleView | null;
  logs: Log[];
  remindMeCount: number;
  deviceConnected: boolean;
  showWellnessModal: boolean;
  pendingLogId: string | null;

  // Auth actions
  signup: (email: string, password: string, role: UserRole) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  // Patient connection-code actions
  regenerateConnectionCode: () => Promise<string>;

  // App actions
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  logDose: (status: LogStatus) => Promise<void>;
  remindMeLater: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  submitCheckIn: (logId: string, checkIn: CheckIn) => Promise<void>;
  toggleDeviceConnection: () => Promise<void>;
  skipCheckIn: () => void;
  resetApp: () => void;

  // Scheduling actions
  refreshSchedule: () => Promise<void>;
  saveSchedule: (body: OnboardingData['schedule'] & { daysOfWeek: number[] }) => Promise<void>;
  saveRoutine: (routine: Routine) => Promise<void>;
  addDayOverride: (weekday: number, time: string) => Promise<void>;
  removeDayOverride: (weekday: number) => Promise<void>;
  addDateOverride: (body: Omit<DateOverride, 'id'>) => Promise<void>;
  removeDateOverride: (id: string) => Promise<void>;
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

const profileFromApi = (
  p: UserProfile & { deviceConnected?: boolean; remindMeCount?: number }
): UserProfile => ({
  name: p.name,
  medication: p.medication,
  scheduleTime: p.scheduleTime,
  // Older profiles created before tz support fall back to the device zone.
  timezone: p.timezone || browserTimeZone(),
  features: p.features,
});

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [connectionCode, setConnectionCode] = useState<string | null>(null);

  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [scheduleView, setScheduleView] = useState<ScheduleView | null>(null);
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

  const refreshSchedule = useCallback(async () => {
    try {
      const view = await apiFetch<ScheduleView>('/schedule');
      setScheduleView(view);
    } catch {
      // ignore — schedule view is best-effort
    }
  }, []);

  const hydrateFromMe = useCallback(async (me: MeResponse) => {
    setIsAuthenticated(true);
    setEmail(me.email);
    setRole(me.role);

    // Caregivers have no medication profile / onboarding; their home is the
    // connect-to-patient flow. Skip all patient-only hydration.
    if (me.role === 'caregiver') {
      setConnectionCode(null);
      setUserProfile(null);
      setScheduleView(null);
      setIsOnboarded(false);
      setLogs([]);
      return;
    }

    setConnectionCode(me.connectionCode ?? null);
    if (me.profile) {
      setUserProfile(profileFromApi(me.profile));
      setIsOnboarded(true);
      if (typeof me.profile.deviceConnected === 'boolean') setDeviceConnected(me.profile.deviceConnected);
      if (typeof me.profile.remindMeCount === 'number') setRemindMeCount(me.profile.remindMeCount);
      await Promise.all([refreshLogs(), refreshSchedule()]);
    } else {
      setUserProfile(null);
      setScheduleView(null);
      setIsOnboarded(false);
      setLogs([]);
    }
  }, [refreshLogs, refreshSchedule]);

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

  const signup = async (emailVal: string, password: string, signupRole: UserRole) => {
    const res = await apiFetch<{ access_token: string; email: string; role: UserRole }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: emailVal, password, role: signupRole }),
    });
    setToken(res.access_token);
    const me = await apiFetch<MeResponse>('/auth/me');
    await hydrateFromMe(me);
  };

  const regenerateConnectionCode = async (): Promise<string> => {
    const res = await apiFetch<{ connectionCode: string }>('/connections/regenerate', {
      method: 'POST',
    });
    setConnectionCode(res.connectionCode);
    return res.connectionCode;
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
    setRole(null);
    setConnectionCode(null);
    setIsOnboarded(false);
    setUserProfile(null);
    setScheduleView(null);
    setLogs([]);
    setRemindMeCount(0);
    setDeviceConnected(false);
  };

  const completeOnboarding = async (data: OnboardingData) => {
    // 1. Create the profile (existing shape — unchanged contract).
    const res = await apiFetch<UserProfile & { deviceConnected?: boolean; remindMeCount?: number }>(
      '/profile',
      { method: 'POST', body: JSON.stringify(data.profile) }
    );
    setUserProfile(profileFromApi(res));
    if (typeof res.deviceConnected === 'boolean') setDeviceConnected(res.deviceConnected);
    if (typeof res.remindMeCount === 'number') setRemindMeCount(res.remindMeCount);

    // 2. Persist the schedule, then 3. the routine (recomputes AI-sourced time).
    await apiFetch<ScheduleView>('/schedule', { method: 'PUT', body: JSON.stringify(data.schedule) });
    const view = await apiFetch<ScheduleView>('/schedule/routine', {
      method: 'PUT',
      body: JSON.stringify(data.routine),
    });
    setScheduleView(view);
    setIsOnboarded(true);
  };

  const updateProfile = async (patch: Partial<UserProfile>) => {
    const res = await apiFetch<UserProfile & { deviceConnected?: boolean; remindMeCount?: number }>(
      '/profile',
      { method: 'PATCH', body: JSON.stringify(patch) }
    );
    setUserProfile(profileFromApi(res));
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

  // ---- Scheduling actions ------------------------------------------------ //
  const saveSchedule = async (body: OnboardingData['schedule'] & { daysOfWeek: number[] }) => {
    const view = await apiFetch<ScheduleView>('/schedule', { method: 'PUT', body: JSON.stringify(body) });
    setScheduleView(view);
  };

  const saveRoutine = async (routine: Routine) => {
    const view = await apiFetch<ScheduleView>('/schedule/routine', {
      method: 'PUT',
      body: JSON.stringify(routine),
    });
    setScheduleView(view);
  };

  const addDayOverride = async (weekday: number, time: string) => {
    const view = await apiFetch<ScheduleView>('/schedule/day-override', {
      method: 'POST',
      body: JSON.stringify({ weekday, time }),
    });
    setScheduleView(view);
  };

  const removeDayOverride = async (weekday: number) => {
    const view = await apiFetch<ScheduleView>(`/schedule/day-override/${weekday}`, { method: 'DELETE' });
    setScheduleView(view);
  };

  const addDateOverride = async (body: Omit<DateOverride, 'id'>) => {
    const view = await apiFetch<ScheduleView>('/schedule/date-override', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setScheduleView(view);
  };

  const removeDateOverride = async (id: string) => {
    const view = await apiFetch<ScheduleView>(`/schedule/date-override/${id}`, { method: 'DELETE' });
    setScheduleView(view);
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
      role,
      connectionCode,
      isOnboarded,
      userProfile,
      scheduleView,
      logs,
      remindMeCount,
      deviceConnected,
      showWellnessModal,
      pendingLogId,
      signup,
      login,
      logout,
      regenerateConnectionCode,
      completeOnboarding,
      updateProfile,
      logDose,
      remindMeLater,
      refreshLogs,
      submitCheckIn,
      toggleDeviceConnection,
      skipCheckIn,
      resetApp,
      refreshSchedule,
      saveSchedule,
      saveRoutine,
      addDayOverride,
      removeDayOverride,
      addDateOverride,
      removeDateOverride,
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
