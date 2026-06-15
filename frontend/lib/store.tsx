"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { apiFetch, getToken, setToken } from './api';
import { connectToDevice, disconnectDevice, type BleConnection } from './bluetooth';

export type LogStatus = 'taken' | 'missed';
export type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'night';
export type UserRole = 'patient' | 'caregiver';
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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
  medicationId: string;
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

/** A medication and its own schedule. Two meds can share a time or differ. */
export interface Medication {
  id: string;
  name: string;
  schedule: Schedule;
}

/** One medication's resolved view: schedule + next-due/upcoming/conflicts. */
export interface MedicationView {
  id: string;
  name: string;
  schedule: Schedule;
  nextDue: string | null;   // ISO datetime (carries the user's tz offset)
  upcoming: UpcomingDose[];
  conflicts: Conflict[];
}

export interface ScheduleView {
  medications: MedicationView[];
  routine: Routine;         // shared across all meds
  timezone: string;         // IANA name (e.g. "America/New_York") doses are anchored to
}

/** A medication + schedule as sent to the server (onboarding / add). */
export interface MedicationInput {
  name: string;
  time: string;             // HH:mm
  daysOfWeek: number[];
  window: TimeWindow | null;
  reason?: string | null;
  source?: 'ai' | 'user';
  rxcui?: string | null;
}

export interface UserProfile {
  name: string;
  medications: Medication[];
  medication: string;   // legacy display string: joined medication names
  timezone: string;     // IANA name, e.g. "America/New_York"
  features: {
    aiInsights: boolean;
    wellnessCheckIns: boolean;
    caregiverAccess: boolean;
  };
}

// Everything completeOnboarding needs to persist in one go.
export interface OnboardingData {
  profile: {
    name: string;
    medications: MedicationInput[];
    timezone: string;
    features: UserProfile['features'];
  };
  routine: Routine;
}

type ApiProfile = UserProfile & {
  deviceConnected?: boolean;
  remindMeCounts?: Record<string, number>;
  schedule?: Schedule;
  routine?: Routine;
};

interface MeResponse {
  user_id: string;
  email: string;
  role: UserRole;
  connectionCode?: string | null;
  profile: ApiProfile | null;
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
  remindMeCounts: Record<string, number>;
  deviceConnected: boolean;
  deviceStatus: DeviceStatus;
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
  updateProfile: (patch: Partial<Pick<UserProfile, 'name' | 'timezone' | 'features'>>) => Promise<void>;
  logDose: (medicationId: string, status: LogStatus) => Promise<void>;
  remindMeLater: (medicationId: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
  submitCheckIn: (logId: string, checkIn: CheckIn) => Promise<void>;
  connectDevice: () => Promise<void>;
  disconnectDevice: () => Promise<void>;
  skipCheckIn: () => void;
  resetApp: () => void;

  // Scheduling actions (per medication)
  refreshSchedule: () => Promise<void>;
  saveSchedule: (medicationId: string, body: { name?: string; time: string; daysOfWeek: number[]; window: TimeWindow | null; reason: string | null; source: 'ai' | 'user'; rxcui: string | null }) => Promise<void>;
  saveRoutine: (routine: Routine) => Promise<void>;
  addMedication: (body: MedicationInput) => Promise<void>;
  removeMedication: (medicationId: string) => Promise<void>;
  addDayOverride: (medicationId: string, weekday: number, time: string) => Promise<void>;
  removeDayOverride: (medicationId: string, weekday: number) => Promise<void>;
  addDateOverride: (medicationId: string, body: Omit<DateOverride, 'id'>) => Promise<void>;
  removeDateOverride: (medicationId: string, id: string) => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

interface ApiLog {
  id: string;
  timestamp: string;
  status: LogStatus;
  medicationId: string;
  checkIn?: CheckIn;
}

const fromApiLog = (l: ApiLog): Log => ({
  id: l.id,
  timestamp: new Date(l.timestamp),
  status: l.status,
  medicationId: l.medicationId,
  checkIn: l.checkIn,
});

const profileFromApi = (p: ApiProfile): UserProfile => ({
  name: p.name,
  medications: p.medications ?? [],
  medication: p.medication ?? (p.medications ?? []).map(m => m.name).join(', '),
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
  const [remindMeCounts, setRemindMeCounts] = useState<Record<string, number>>({});
  const [deviceConnected, setDeviceConnected] = useState(false);
  // Live BLE link state for this tab. Starts 'disconnected' on load because
  // Web Bluetooth cannot silently re-establish a link after a refresh.
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('disconnected');
  const bleConnection = useRef<BleConnection | null>(null);
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);

  // Records the last-known connected/disconnected state on the backend so it
  // survives a refresh and can be shared (e.g. caregiver view). Best-effort:
  // the live link's correctness never depends on this call succeeding.
  const persistDeviceState = useCallback(async (connected: boolean) => {
    setDeviceConnected(connected);
    try {
      await apiFetch('/device', { method: 'POST', body: JSON.stringify({ connected }) });
    } catch {
      // ignore — UI already reflects the live link
    }
  }, []);

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
      if (me.profile.remindMeCounts) setRemindMeCounts(me.profile.remindMeCounts);
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
    setRemindMeCounts({});
    disconnectDevice(bleConnection.current);
    bleConnection.current = null;
    setDeviceConnected(false);
    setDeviceStatus('disconnected');
  };

  const completeOnboarding = async (data: OnboardingData) => {
    // 1. Create the profile (name, medications + their schedules, tz, features).
    const res = await apiFetch<ApiProfile>(
      '/profile',
      { method: 'POST', body: JSON.stringify(data.profile) }
    );
    setUserProfile(profileFromApi(res));
    if (typeof res.deviceConnected === 'boolean') setDeviceConnected(res.deviceConnected);
    if (res.remindMeCounts) setRemindMeCounts(res.remindMeCounts);

    // 2. Persist the shared routine (recomputes any AI-sourced dose times).
    const view = await apiFetch<ScheduleView>('/schedule/routine', {
      method: 'PUT',
      body: JSON.stringify(data.routine),
    });
    setScheduleView(view);
    setIsOnboarded(true);
  };

  const updateProfile = async (patch: Partial<Pick<UserProfile, 'name' | 'timezone' | 'features'>>) => {
    const res = await apiFetch<ApiProfile>(
      '/profile',
      { method: 'PATCH', body: JSON.stringify(patch) }
    );
    setUserProfile(profileFromApi(res));
  };

  const logDose = async (medicationId: string, status: LogStatus) => {
    const created = await apiFetch<ApiLog>('/logs', {
      method: 'POST',
      body: JSON.stringify({ medicationId, status }),
    });
    const newLog = fromApiLog(created);
    setLogs(prev => {
      const others = prev.filter(l => l.id !== newLog.id);
      return [...others, newLog].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    });
    setRemindMeCounts(prev => ({ ...prev, [medicationId]: 0 }));

    if (status === 'taken' && userProfile?.features.wellnessCheckIns) {
      setPendingLogId(newLog.id);
      setShowWellnessModal(true);
    }
  };

  const remindMeLater = async (medicationId: string) => {
    const res = await apiFetch<{ medicationId: string; remindMeCount: number; autoMissed: boolean }>(
      '/reminders/remind-later',
      { method: 'POST', body: JSON.stringify({ medicationId }) }
    );
    setRemindMeCounts(prev => ({ ...prev, [res.medicationId]: res.remindMeCount }));
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

  // Fired by the BLE layer when the link drops for any reason (device powered
  // off, out of range, or our own disconnect).
  const handleBleDisconnect = useCallback(() => {
    bleConnection.current = null;
    setDeviceStatus('disconnected');
    void persistDeviceState(false);
  }, [persistDeviceState]);

  const connectDevice = useCallback(async () => {
    setDeviceStatus('connecting');
    try {
      const conn = await connectToDevice(handleBleDisconnect);
      bleConnection.current = conn;
      setDeviceStatus('connected');
      await persistDeviceState(true);
    } catch (err) {
      // The user dismissing the native picker throws a NotFoundError — that's a
      // cancel, not an error, so fall back to 'disconnected' for it.
      const cancelled = err instanceof DOMException && err.name === 'NotFoundError';
      setDeviceStatus(cancelled ? 'disconnected' : 'error');
    }
  }, [handleBleDisconnect, persistDeviceState]);

  const disconnectDeviceAction = useCallback(async () => {
    disconnectDevice(bleConnection.current);
    bleConnection.current = null;
    setDeviceStatus('disconnected');
    await persistDeviceState(false);
  }, [persistDeviceState]);

  // ---- Scheduling actions (per medication) ------------------------------- //
  // Each action returns the full multi-med ScheduleView; we also re-sync the
  // profile's medications list (names can change) from it.
  const applyView = (view: ScheduleView) => {
    setScheduleView(view);
    setUserProfile(prev => prev ? {
      ...prev,
      medications: view.medications.map(m => ({ id: m.id, name: m.name, schedule: m.schedule })),
      medication: view.medications.map(m => m.name).join(', '),
    } : prev);
  };

  const saveSchedule = async (
    medicationId: string,
    body: { name?: string; time: string; daysOfWeek: number[]; window: TimeWindow | null; reason: string | null; source: 'ai' | 'user'; rxcui: string | null },
  ) => {
    const view = await apiFetch<ScheduleView>(`/schedule/${medicationId}`, { method: 'PUT', body: JSON.stringify(body) });
    applyView(view);
  };

  const saveRoutine = async (routine: Routine) => {
    const view = await apiFetch<ScheduleView>('/schedule/routine', {
      method: 'PUT',
      body: JSON.stringify(routine),
    });
    applyView(view);
  };

  const addMedication = async (body: MedicationInput) => {
    const view = await apiFetch<ScheduleView>('/schedule/medications', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    applyView(view);
  };

  const removeMedication = async (medicationId: string) => {
    const view = await apiFetch<ScheduleView>(`/schedule/medications/${medicationId}`, { method: 'DELETE' });
    applyView(view);
  };

  const addDayOverride = async (medicationId: string, weekday: number, time: string) => {
    const view = await apiFetch<ScheduleView>(`/schedule/${medicationId}/day-override`, {
      method: 'POST',
      body: JSON.stringify({ weekday, time }),
    });
    applyView(view);
  };

  const removeDayOverride = async (medicationId: string, weekday: number) => {
    const view = await apiFetch<ScheduleView>(`/schedule/${medicationId}/day-override/${weekday}`, { method: 'DELETE' });
    applyView(view);
  };

  const addDateOverride = async (medicationId: string, body: Omit<DateOverride, 'id'>) => {
    const view = await apiFetch<ScheduleView>(`/schedule/${medicationId}/date-override`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    applyView(view);
  };

  const removeDateOverride = async (medicationId: string, id: string) => {
    const view = await apiFetch<ScheduleView>(`/schedule/${medicationId}/date-override/${id}`, { method: 'DELETE' });
    applyView(view);
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
      remindMeCounts,
      deviceConnected,
      deviceStatus,
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
      connectDevice,
      disconnectDevice: disconnectDeviceAction,
      skipCheckIn,
      resetApp,
      refreshSchedule,
      saveSchedule,
      saveRoutine,
      addMedication,
      removeMedication,
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
