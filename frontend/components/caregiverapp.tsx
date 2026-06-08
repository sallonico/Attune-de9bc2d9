"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAppStore } from "../lib/store";
import CaregiverView from "./caregiverview";
import { AttuneLogo } from "./brand/logo";
import {
  LogOut,
  HeartHandshake,
  Plus,
  KeyRound,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  ShieldOff,
  Users,
  Pill,
} from "lucide-react";

interface LinkedPatient {
  patientId: string;
  connectionId: string;
  name: string;
  medication: string | null;
  accessEnabled: boolean;
  connectedAt: string;
}

const CONNECT_ERROR_COPY: Record<string, string> = {
  invalid_connection_code: "We couldn't find a patient with that code. Double-check and try again.",
  already_connected: "You're already connected to this patient.",
  cannot_connect_to_self: "That code can't be used here.",
};

export default function CaregiverApp() {
  const { email, logout } = useAppStore();
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch<{ patients: LinkedPatient[] }>("/connections/patients");
      setPatients(res.patients);
    } catch (e) {
      setLoadError((e as Error).message || "Couldn't load your patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = patients.find((p) => p.patientId === selectedId) || null;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-700 selection:bg-tide-200">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-tide-200/30 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-apricot-200/25 rounded-full blur-[140px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-stone-200 bg-stone-50/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AttuneLogo />
            <span className="ml-2 px-2 py-0.5 rounded-full bg-white border border-stone-200 text-xs text-stone-600 flex items-center gap-1">
              <HeartHandshake className="w-3 h-3 text-tide-600" /> Caregiver
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-stone-500">{email}</span>
            <button
              onClick={logout}
              className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-colors"
              title="Log out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8 md:py-12">
        {selected ? (
          <CaregiverView patientId={selected.patientId} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div>
              <h1 className="text-3xl font-bold text-stone-900 tracking-tight flex items-center gap-3">
                <Users className="w-8 h-8 text-tide-600" />
                Your Patients
              </h1>
              <p className="text-stone-500 mt-1">
                Connect with a patient using the code they share, then follow their progress.
              </p>
            </div>

            <ConnectToPatient onConnected={refresh} />

            <PatientList
              patients={patients}
              loading={loading}
              error={loadError}
              onSelect={(id) => setSelectedId(id)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function ConnectToPatient({ onConnected }: { onConnected: () => Promise<void> | void }) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError("Enter the full connection code your patient shared.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ patientName: string }>("/connections/connect", {
        method: "POST",
        body: JSON.stringify({ code: trimmed }),
      });
      setSuccess(`Connected to ${res.patientName}.`);
      setCode("");
      await onConnected();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      const msg = (e as Error).message || "Couldn't connect.";
      setError(CONNECT_ERROR_COPY[msg] || msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white backdrop-blur-xl border border-stone-200 rounded-3xl p-6 md:p-8">
      <h2 className="text-xl font-semibold text-stone-900 flex items-center gap-2 mb-1">
        <Plus className="w-5 h-5 text-tide-600" />
        Connect to a Patient
      </h2>
      <p className="text-stone-500 text-sm mb-5">
        Ask your patient for the connection code shown on their dashboard.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB7K9P2X"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={16}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-3 text-stone-900 tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="group bg-tide-500 hover:bg-tide-600 px-6 py-3 rounded-[14px] font-semibold text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-brand)] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Connect</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-danger bg-danger-subtle border border-danger/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-tide-600 bg-tide-50 border border-tide-200 rounded-xl px-3 py-2">
          {success}
        </p>
      )}
    </div>
  );
}

function PatientList({
  patients,
  loading,
  error,
  onSelect,
}: {
  patients: LinkedPatient[];
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-tide-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger-subtle border border-danger/20 rounded-2xl p-6 text-danger">
        {error}
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="bg-white border border-stone-200 border-dashed rounded-3xl p-10 text-center">
        <Users className="w-10 h-10 text-stone-300 mx-auto mb-3" />
        <p className="text-stone-600 font-medium">No connected patients yet</p>
        <p className="text-stone-400 text-sm mt-1">
          Enter a connection code above to link your first patient.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {patients.map((p) => (
        <button
          key={p.patientId}
          onClick={() => onSelect(p.patientId)}
          className="group text-left bg-white backdrop-blur-xl border border-stone-200 rounded-3xl p-6 hover:bg-stone-100 hover:border-stone-300 transition-all flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <p className="text-stone-900 font-semibold text-lg truncate">{p.name}</p>
            {p.medication && (
              <p className="text-stone-500 text-sm flex items-center gap-1.5 mt-0.5 truncate">
                <Pill className="w-3.5 h-3.5 shrink-0" />
                {p.medication}
              </p>
            )}
            <span
              className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-xs font-medium border ${
                p.accessEnabled
                  ? "bg-success-subtle text-success border-success/20"
                  : "bg-warning-subtle text-warning border-warning/20"
              }`}
            >
              {p.accessEnabled ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" /> Data shared
                </>
              ) : (
                <>
                  <ShieldOff className="w-3.5 h-3.5" /> Sharing off
                </>
              )}
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-stone-900 transition-colors shrink-0" />
        </button>
      ))}
    </div>
  );
}
