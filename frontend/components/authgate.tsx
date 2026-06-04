"use client";

import React, { useState } from "react";
import { useAppStore, UserRole } from "../lib/store";
import { ArrowRight, Mail, Lock, Activity, User, HeartHandshake } from "lucide-react";

export default function AuthGate() {
  const { signup, login } = useAppStore();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [role, setRole] = useState<UserRole>("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || password.length < 8) {
      setError("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") await signup(email, password, role);
      else await login(email, password);
    } catch (err) {
      setError((err as Error).message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-teal-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-2xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            ATTUNE
          </span>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-teal-900/20">
          <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-slate-400 mb-6 text-sm">
            {mode === "signup"
              ? role === "patient"
                ? "Sign up to start tracking your medication."
                : "Sign up to support someone you care for."
              : "Log in to continue."}
          </p>

          {mode === "signup" && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">I am a…</label>
              <div className="grid grid-cols-2 gap-3">
                <RoleCard
                  active={role === "patient"}
                  onClick={() => setRole("patient")}
                  icon={<User className="w-5 h-5" />}
                  title="Patient"
                  subtitle="Track my medication"
                />
                <RoleCard
                  active={role === "caregiver"}
                  onClick={() => setRole("caregiver")}
                  icon={<HeartHandshake className="w-5 h-5" />}
                  title="Caregiver"
                  subtitle="Support a patient"
                />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-3 rounded-xl font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/40 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{submitting ? "Working..." : mode === "signup" ? "Create account" : "Log in"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {mode === "signup" && role === "caregiver" && (
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              After signing up, you&apos;ll enter a connection code shared by your patient to
              link your accounts.
            </p>
          )}

          <div className="mt-6 text-center text-sm text-slate-400">
            {mode === "signup" ? "Already have an account?" : "New to ATTUNE?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError(null);
              }}
              className="text-teal-400 hover:text-teal-300 font-medium"
            >
              {mode === "signup" ? "Log in" : "Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all ${
        active
          ? "bg-teal-500/10 border-teal-500/50 shadow-lg shadow-teal-500/10"
          : "bg-black/20 border-white/10 hover:border-white/20 hover:bg-white/5"
      }`}
    >
      <span className={active ? "text-teal-400" : "text-slate-400"}>{icon}</span>
      <span className="text-white font-semibold text-sm">{title}</span>
      <span className="text-xs text-slate-500">{subtitle}</span>
    </button>
  );
}
