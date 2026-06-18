"use client";

import React, { useState } from "react";
import { useAppStore, UserRole } from "../lib/store";
import { AttuneLogo } from "./brand/logo";
import { ArrowRight, Mail, Lock, User, HeartHandshake } from "lucide-react";

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

  const isSignup = mode === "signup";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={
        isSignup
          ? { background: "linear-gradient(168deg,#3E7FC2 0%,#2E63A8 50%,#21477E 100%)" }
          : { background: "#FAF8F4" }
      }
    >
      {isSignup ? (
        <CapsuleField />
      ) : (
        <>
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-tide-200/30 rounded-full blur-[140px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-apricot-200/25 rounded-full blur-[140px]" />
        </>
      )}

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center gap-4 mb-8">
          <AttuneLogo onDark={isSignup} />
          {isSignup && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/25 font-mono text-[10px] tracking-[0.16em] uppercase text-white backdrop-blur">
              Welcome to attune
            </span>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-[var(--shadow-lg)]">
          <h1 className="text-2xl font-bold text-stone-900 mb-1 tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-stone-500 mb-6 text-sm">
            {mode === "signup"
              ? role === "patient"
                ? "Sign up to start keeping time with your medication."
                : "Sign up to support someone you care for."
              : "Log in to continue."}
          </p>

          {mode === "signup" && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-stone-700 mb-2">I am a…</label>
              <div className="grid grid-cols-2 gap-3">
                <RoleCard
                  active={role === "patient"}
                  onClick={() => setRole("patient")}
                  icon={<User className="w-5 h-5" />}
                  title="Member"
                  subtitle="Keep time with my doses"
                />
                <RoleCard
                  active={role === "caregiver"}
                  onClick={() => setRole("caregiver")}
                  icon={<HeartHandshake className="w-5 h-5" />}
                  title="Caregiver"
                  subtitle="Support someone I care for"
                />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-stone-50 border border-stone-200 rounded-[14px] pl-10 pr-4 py-3 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  className="w-full bg-stone-50 border border-stone-200 rounded-[14px] pl-10 pr-4 py-3 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-tide-500/40 focus:border-tide-400 transition-all"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-danger bg-danger-subtle border border-danger/20 rounded-[14px] px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-tide-500 hover:bg-tide-600 px-6 py-3 rounded-[14px] font-semibold text-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-brand)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{submitting ? "Working…" : mode === "signup" ? "Create account" : "Log in"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {mode === "signup" && role === "caregiver" && (
            <p className="mt-4 text-xs text-stone-500 leading-relaxed">
              After signing up, you&apos;ll enter a connection code shared by your member to
              link your accounts.
            </p>
          )}

          <div className="mt-6 text-center text-sm text-stone-500">
            {mode === "signup" ? "Already have an account?" : "New to attune?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError(null);
              }}
              className="text-tide-700 hover:text-tide-600 font-medium"
            >
              {mode === "signup" ? "Log in" : "Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Decorative drifting capsules behind the sign-up card — the showcase's
 * onboarding-hero motif, re-tinted for the blue background. Purely cosmetic.
 */
function CapsuleField() {
  // [left%, top%, width, height, rotate(deg), tintHalf]
  const pills: [string, string, number, number, number, string][] = [
    ["6%", "14%", 132, 46, -22, "#BFE0FF"],
    ["72%", "10%", 150, 50, 17, "#E4F1FF"],
    ["18%", "70%", 122, 44, 33, "#BFE0FF"],
    ["68%", "64%", 128, 46, -14, "#FCE6D6"],
    ["44%", "26%", 112, 40, 9, "#E4F1FF"],
  ];
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {pills.map(([left, top, w, h, rot, tint], i) => (
        <div
          key={i}
          className="absolute flex overflow-hidden rounded-full border border-white/30"
          style={{
            left,
            top,
            width: w,
            height: h,
            transform: `rotate(${rot}deg)`,
            boxShadow: "0 14px 26px -8px rgba(15,40,80,.45)",
          }}
        >
          <div className="flex-1 bg-white" />
          <div className="w-[2px] bg-black/10" />
          <div className="flex-1" style={{ background: tint }} />
        </div>
      ))}
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
          ? "bg-tide-50 border-tide-300 shadow-[var(--shadow-sm)]"
          : "bg-stone-50 border-stone-200 hover:border-stone-300 hover:bg-stone-100"
      }`}
    >
      <span className={active ? "text-tide-600" : "text-stone-400"}>{icon}</span>
      <span className="text-stone-900 font-semibold text-sm">{title}</span>
      <span className="text-xs text-stone-500">{subtitle}</span>
    </button>
  );
}
