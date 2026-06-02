# ATTUNE — Product Skeleton
*Internal document for team use. Last updated: June 2026.*

---

## Overview

> **ATTUNE is a medication-adherence web app, paired with an optional physical pill device, that helps people actually take what they're supposed to take.** You tell it your medication once; it looks up *when* the medication should be taken from the real FDA label, fits that around your daily routine, and then gives you a one-tap "taken / remind me" home screen, an adherence calendar, gentle wellness check-ins, and an optional caregiver view — so both the patient and the people who support them can see the full picture over time.

**The physical device is the hook. The software is the reason people stay.**

The hardware gets people in the door. Long-term retention comes from the software: it removes the *cognitive* work of figuring out when to take a dose, makes consistency visible, and lets a caregiver stay in the loop without nagging.

### The problem → why ATTUNE

Medication non-adherence is one of the largest, most expensive problems in healthcare — roughly half of doses for chronic conditions are taken incorrectly or not at all. But "forgetting" is only the surface. Underneath it:

| The real barrier | What it leads to | What ATTUNE does about it |
|---|---|---|
| "When am I even supposed to take this?" | A guessed schedule → wrong timing → it stops working | Looks up real timing guidance from the **FDA drug label** and proposes a time, grounded in a quote from that label |
| "Setting this up is a pain." | Drop-off before the habit forms | A 5-step setup that pre-fills the schedule for you — under a minute |
| "Did I take it today?" | Double doses or missed doses | One-tap daily logging + a visual adherence calendar |
| "Is my mom okay?" | Caregiver anxiety, helpless check-in calls | A caregiver view with adherence %, recent activity, and an alert on consecutive misses |

The direct line: **non-adherence is driven as much by friction and uncertainty as by forgetfulness — so ATTUNE removes the decision ("when?"), removes the setup friction, and makes the habit visible to the user and the people who care about them.**

### Who this is for

| User Type | Example | What they need most |
|---|---|---|
| Adults on a new prescription | Starting a daily medication | Getting the timing right, low-friction setup, habit formation |
| Elderly patients | Managing a regular medication | Simplicity, a caregiver connection, reassurance |
| Caregivers | Keeping an eye on a parent's adherence | Visibility, peace of mind, an alert when something slips |
| Wellness users | A daily vitamin or supplement | A low-stakes entry point, motivation, a streak to keep |

**Design implication:** the tone, prompts, and setup language must feel approachable for all of these users — never clinical or intimidating.

**Current scope (be honest about where we are):** the app today tracks **one medication per user**. Multi-medication regimens, polypharmacy, and true drug–drug interaction checking are explicitly *future* work, not built yet. Everything below describes the single-medication MVP that actually exists.

---

## Why this matters — Maslow's hierarchy of needs

Each core feature addresses a fundamental human need, not just a convenience.

| Feature | Maslow's need | Why it matters (one sentence) |
|---|---|---|
| Adherence Calendar | Esteem | Seeing your own consistency turns adherence into a visible personal achievement. |
| Caregiver View | Love & Belonging | It lets someone who cares stay connected and capable instead of anxious and helpless. |
| AI Timing Suggestion | Safety | Removing the "am I taking this at the wrong time?" worry makes the medication feel manageable and low-risk. |
| Routine-aware setup | Physiological | Anchoring doses to when you actually wake, eat, and sleep keeps the routine realistic enough that it sticks. |

---

## Tech stack

| Layer | What we use | Notes |
|---|---|---|
| **Frontend** | Next.js 15 (App Router, Turbopack) · React 19 · TypeScript | Single-page app; client state in a React context store (`lib/store.tsx`) |
| **UI** | Tailwind CSS v4 · shadcn/ui (Radix primitives) · lucide-react · recharts | Dark, calm aesthetic; charts for trends |
| **Backend** | Python · FastAPI · Uvicorn | OpenAI-compatible patterns, async throughout |
| **Database** | MongoDB (via Motor async driver) | Collections: `users`, `profiles`, `logs` |
| **Auth** | Email + password, JWT (PyJWT), Argon2 password hashing | Bearer token stored client-side; `/api/v1/auth/*` |
| **Drug timing data** | RxNorm/RxNav + OpenFDA drug-label API + a rule-based extractor | **All free, no API key, no budget impact** |
| **Optional LLM** | Duke AI Gateway (LiteLLM, OpenAI SDK) | **Off by default** (`DRUG_AI_ENABLED=false`); only ever used to summarize a real label, never to invent medical advice |

Backend and frontend run as two separate processes (see *Running it locally* at the end).

---

## Software features

### 1. AI Timing Suggestion (the differentiator) — ✅ Built

**What it does:** When you enter a medication during setup, ATTUNE figures out *when* you should take it, grounded in real data — not by asking you to guess into a blank time field.

**How it actually works** (`backend/app/services/drug_timing.py`):
1. **Normalize** the drug name via RxNorm/RxNav → canonical name + `rxcui`.
2. **Fetch** the real "dosage & administration" text from the OpenFDA drug-label API.
3. **Extract** a time-of-day window (morning/afternoon/evening/night) and a "why" using rule-based matching, with negation handling so *"do not take at bedtime"* never gets read as *"take at bedtime."*

It returns one of three confidence-gated tiers, and **it never surfaces an ungrounded "why":**
- **Grounded** — a timing phrase was found in the label → suggest a window **and** a reason that is a real sentence quoted from the label.
- **Unverified** — no clear timing in the label (only used if the optional LLM is on) → suggest a bare window with **no** medical justification, clearly flagged.
- **Manual** — nothing usable → drop to a plain time picker; setup is never blocked.

The chosen window is then resolved to a concrete clock time against the user's routine (e.g. "morning, with food" → their breakfast time).

> ⚠️ **Guardrail:** timing suggestions must stay free and grounded. We never show a "why" we can't trace to the label. The optional Duke Gateway LLM is off by default and, even when on, is forbidden from inventing a justification.

**Why it drives retention:** the anxiety of "picking wrong" is a real barrier. A bad schedule → missed/ineffective doses → guilt → abandonment. Grounding the suggestion removes that decision pressure *and* earns trust.

**Note:** this is **not** a free-text chatbot. It's a structured, label-grounded suggestion baked into onboarding. (A conversational assistant remains a possible future direction — see Open Items.)

---

### 2. Routine-aware Schedule — ✅ Built

**What it does:** Stores a weekly schedule and adapts it to real life, all server-side and timezone-aware (`backend/app/services/scheduling.py`).

- **Default weekly schedule** — a time + which days of the week.
- **Per-weekday overrides** — e.g. later on Saturdays.
- **Date-range overrides** — *shift* (travel / jet lag), *set* (a one-off fixed time), or *pause* (a break), with sensible precedence (a pause always wins).
- **Routine model** — wake time, sleep time, with-food flag, meal times, and "days my routine varies." Changing your routine automatically re-derives any AI-suggested dose time.
- **Conflict detection** — warns when a dose falls outside your awake hours, isn't near a meal when it should be taken with food, or when overrides overlap.
- **Next-due + 7-day upcoming** — drives the dashboard's in-app reminder.

**Maslow's need:** Safety — the schedule bends to the user's life instead of the other way around.

---

### 3. Adherence Calendar & Logging — ✅ Built

**What it does:** One-tap daily logging (`taken` / `missed`, one entry per day) plus a visual calendar and a trend chart, so the user gets ongoing feedback on their consistency.

**Why it drives retention:** the device brings users in; the calendar gives them a reason to open the app again tomorrow. Streaks and gaps make adherence feel real and personal.

**Maslow's need:** Esteem — visible progress reinforces competence and accountability.

---

### 4. Wellness Check-ins — ✅ Built (optional feature toggle)

**What it does:** A quick, 1-tap-ish check-in attached to a dose log — physical (1–5), emotional (1–5), and an optional short note. Averages feed the caregiver view.

**Why it matters:** turns "did you take it" into "how are you doing," and gives a caregiver a humane signal beyond raw adherence numbers.

---

### 5. Caregiver View — ✅ Built (optional feature toggle)

**What it does:** A dashboard tab (`backend/app/api/v1/routes/caregiver.py`) summarizing the user's last 30 days: adherence %, missed-dose count, average physical & mood scores, recent activity, and an **alert when there are 2+ consecutive missed doses** ("a gentle check-in might be helpful").

**Why it drives retention:** it gives the caregiver agency, which reduces pressure on the user and reinforces their motivation to stay consistent.

**Maslow's need:** Love & Belonging.

**Current scope:** it's a **view within the user's own account**, gated by the `caregiverAccess` feature toggle. A *separate caregiver login / invite flow* is not built yet — see Open Items.

---

### 6. AI Pattern Insights — ✅ Built (rule-based, free)

**What it does:** Looks at recent logs and surfaces a plain-language pattern when one is statistically present — e.g. *"You tend to skip your dose on Wednesdays and Thursdays — this has happened 4 of the last 8 occurrences."* (`backend/app/api/v1/routes/insights.py`)

Currently a focused, free, rule-based detector (no LLM, no budget impact). Honest about its limits: it only fires above a minimum log threshold.

---

### 7. Reminder snooze & device toggle — ✅ Built

- **Remind-me-later** counter: after 3 snoozes, the dose auto-logs as missed and the counter resets (`reminders.py`).
- **Device connection toggle**: a simple connected/disconnected flag standing in for the physical device (`device.py`).

---

## Setup / onboarding flow — ✅ Built (5 steps)

**Goal:** zero → a configured, routine-aware schedule in under a minute.

1. **Auth gate** — sign up or log in (email + password).
2. **Name** — "What should we call you?"
3. **Medication** — enter one medication; ATTUNE looks up timing (see feature 1).
4. **When to take it** — the suggestion banner (grounded / unverified / manual), a window picker, an exact-time field, and day-of-week selection. Timezone is auto-detected from the browser.
5. **Your daily routine** — wake/sleep, with-food + meal times, and any days that vary.
6. **Customize** — toggle AI Insights, Wellness Check-ins, and Caregiver View on/off.

**Status:** functional and reasonably polished. The biggest remaining gaps are post-setup landing polish and copy. (The "schedule formatting redesign" that used to live here is now **built** — the guided window/exact-time/days flow above is exactly it.)

**Open questions:**
- After setup, should users land on the calendar, the home/next-dose screen, or the first scheduled dose?
- Can users add a second medication post-onboarding? (Today: no — single-medication scope.)
- What does the error state look like for an unrecognized medication name? (Today: it degrades to the manual time picker.)

---

## Pitching the software

> For internal use when explaining why the software matters alongside the hardware.

**The device attracts. The software retains.**

The device solves "I forgot" in a tangible, satisfying way. But hardware alone can't touch the *behavioral* dimensions of adherence — the uncertainty of when to take a dose, the guilt of missing one, the anxiety of a caregiver who can't check in, the paralysis of setting up a new routine.

The software turns a useful gadget into a trusted daily health companion. And it isn't just for patients — it's for anyone who takes something on a schedule: a prescription, a vitamin, a supplement before bed. That's nearly everyone, so the addressable market is much larger than "medication."

Each feature maps to a real barrier:

- **AI Timing Suggestion** → *"When should I take this?"* — answered from the real FDA label, not a guess.
- **Adherence Calendar** → *"Am I actually doing this?"* — proof of the user's own effort.
- **Caregiver View** → *"Is my loved one okay?"* — peace of mind, with an alert when it's warranted.

These are the reasons users stay past the first week — and the reason a supplement user becomes as loyal as a patient.

---

## Open items & next steps

| Item | Status |
|---|---|
| Polish post-setup landing experience | 🔧 In progress |
| Write/refine copy for onboarding & suggestion banners | 🔧 In progress |
| Separate caregiver login / invite flow (today it's a same-account view) | ❓ Not started |
| Multi-medication support (regimens, polypharmacy) | ❓ Not started — current scope is one med |
| Drug–drug interaction checking | ⛔ Blocked — the free NLM RxNav interaction API was discontinued (Jan 2024); no quality free source |
| Optional conversational scheduling assistant (LLM, off by default) | 💡 Possible future direction |
| Real push notifications / device hardware integration | ❓ Not started — device is a toggle stub today |

---

## Running it locally

ATTUNE has two parts — a **Python/FastAPI backend** and a **Next.js frontend** — and you need both running at the same time, in two separate terminal tabs.

### 1. Backend (API)

Requires a `backend/.env` with at least `MONGODB_URI` (a MongoDB connection string) and `JWT_SECRET`. See `backend/.env.example`. The Duke Gateway key (`LITELLM_TOKEN`) is **optional** — leave it blank and the free drug-timing pipeline still works.

```bash
cd /Users/sallonigill/Attune-de9bc2d9/backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Starts the API on http://localhost:8000. Running it from inside `backend/` matters so it loads `.env`. Health check: http://localhost:8000/api/v1/healthz.

### 2. Frontend (the app you actually use)

```bash
cd /Users/sallonigill/Attune-de9bc2d9/frontend
npm install   # first time only
npm run dev
```

Next.js prints a local URL — usually http://localhost:3000. Open it in your browser. The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `frontend/.env.local` (defaults to `http://localhost:8000/api/v1`).

### Handy dev scripts

```bash
# Seed / reset adherence logs for an existing user (great for demoing the calendar & insights)
cd backend && .venv/bin/python -m scripts.seed_logs --email you@example.com --reset --seed-wed-thu
```
