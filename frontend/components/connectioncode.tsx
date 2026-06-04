"use client";

import React, { useState } from "react";
import { useAppStore } from "../lib/store";
import { KeyRound, Copy, Check, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";

export default function ConnectionCode() {
  const { connectionCode, regenerateConnectionCode, userProfile } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const accessEnabled = userProfile?.features.caregiverAccess ?? false;

  const handleCopy = async () => {
    if (!connectionCode) return;
    try {
      await navigator.clipboard.writeText(connectionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to clipboard — please copy it manually.");
    }
  };

  const handleRegenerate = async () => {
    setError(null);
    setNotice(null);
    setRegenerating(true);
    try {
      await regenerateConnectionCode();
      setConfirming(false);
      setNotice("New code generated. Your old code no longer works.");
      setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setError((e as Error).message || "Couldn't regenerate the code.");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-teal-400" />
            Caregiver Connection Code
          </h3>
          <p className="text-slate-400 text-sm mt-1 max-w-md">
            Share this code with a family member or caregiver so they can connect to your
            account and follow your progress.
          </p>
        </div>
        <span
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
            accessEnabled
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {accessEnabled ? "Sharing on" : "Sharing off"}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 bg-black/30 border border-white/10 rounded-2xl px-5 py-4 flex items-center justify-between">
          <span className="text-2xl md:text-3xl font-bold tracking-[0.25em] text-white tabular-nums">
            {connectionCode ?? "————————"}
          </span>
          <button
            onClick={handleCopy}
            disabled={!connectionCode}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors disabled:opacity-40"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-teal-400" />
                <span className="text-teal-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Regenerate
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl font-medium text-white bg-rose-500/80 hover:bg-rose-500 transition-all disabled:opacity-50"
            >
              {regenerating ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Confirm
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={regenerating}
              className="px-5 py-4 rounded-2xl font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {confirming && !error && (
        <p className="mt-3 text-xs text-amber-300/90 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Regenerating will invalidate the current code. Already-connected caregivers stay
          connected.
        </p>
      )}

      {notice && (
        <p className="mt-3 text-sm text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {!accessEnabled && (
        <p className="mt-4 text-xs text-slate-500">
          Tip: enable <span className="text-slate-300">Caregiver Dashboard</span> sharing in your
          settings so connected caregivers can view your adherence data.
        </p>
      )}
    </div>
  );
}
