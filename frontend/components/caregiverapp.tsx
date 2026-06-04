"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAppStore } from "../lib/store";
import CaregiverView from "./caregiverview";
import {
  Activity,
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
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-teal-500/30">
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
            <span className="ml-2 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 flex items-center gap-1">
              <HeartHandshake className="w-3 h-3 text-teal-400" /> Caregiver
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-slate-400">{email}</span>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
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
              <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                <Users className="w-8 h-8 text-teal-400" />
                Your Patients
              </h1>
              <p className="text-slate-400 mt-1">
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
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-1">
        <Plus className="w-5 h-5 text-teal-400" />
        Connect to a Patient
      </h2>
      <p className="text-slate-400 text-sm mb-5">
        Ask your patient for the connection code shown on their dashboard.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB7K9P2X"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={16}
            className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="group bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 rounded-xl font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
        <p className="mt-3 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-xl px-3 py-2">
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
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-rose-300">
        {error}
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 border-dashed rounded-3xl p-10 text-center">
        <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium">No connected patients yet</p>
        <p className="text-slate-500 text-sm mt-1">
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
          className="group text-left bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <p className="text-white font-semibold text-lg truncate">{p.name}</p>
            {p.medication && (
              <p className="text-slate-400 text-sm flex items-center gap-1.5 mt-0.5 truncate">
                <Pill className="w-3.5 h-3.5 shrink-0" />
                {p.medication}
              </p>
            )}
            <span
              className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full text-xs font-medium border ${
                p.accessEnabled
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
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
          <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors shrink-0" />
        </button>
      ))}
    </div>
  );
}
