# ATTUNE — Software Overview

*A technical orientation for someone new to the codebase. Generated from the repository on 2026-06-15.*

> **How to read this doc:** every claim here was checked against the actual code in `backend/` and `frontend/`. Where something was **inferred** rather than confirmed from code, it is tagged **[ASSUMPTION]** so you can correct it.

---

## 1. Summary

**ATTUNE is a medication-adherence web app — paired with an optional ESP32 pill device the browser connects to directly over Bluetooth Low Energy — that removes the guesswork from *when* to take medications and makes consistency visible over time.** During a short onboarding, the user names one or more medications and sets a time and days for each — they can share a time or sit at completely different times. Each medication's time-of-day window is resolved to a concrete clock time against the user's own daily routine (wake/sleep/meals), then surfaced as a per-medication, one-tap "taken / remind me later" home screen, an adherence trend, optional wellness check-ins, a rule-based pattern insight, and an optional caregiver summary. It solves the fact that medication non-adherence is driven as much by *friction and uncertainty* ("when am I even supposed to take this?") as by forgetting — so the product answers the "when," lowers setup friction, and keeps both the patient and the people who support them in the loop.

---

## 2. Users & Roles

ATTUNE today is a **single-account application**: one person signs up, onboards, and uses the app. There is **no separate login or invite for a distinct caregiver** — the "caregiver view" is a tab *within the patient's own account*, unlocked by a feature toggle. The roles below are therefore product-level personas served by one technical account type, except where noted.

| Role | Who they are | What they need | How the code serves them | Permissions / gating |
|---|---|---|---|---|
| **Patient / primary user** | An adult on a new prescription, an elderly patient, or a wellness/supplement user | Get the timing right, log doses with one tap, see their consistency | Full app: onboarding, dashboard, schedule settings, logging, insights | Authenticated account (email + password, JWT bearer token) |
| **Caregiver (as a view)** | A family member or doctor the patient wants to share with | Visibility into adherence %, missed doses, mood/physical averages, an alert on consecutive misses | `GET /caregiver/summary` + the "Caregiver View" tab | Same account; gated by `features.caregiverAccess === true`. Returns HTTP 403 (`caregiver_access_disabled`) if the toggle is off **[ASSUMPTION: caregiver is the same human or a trusted person physically/credential-sharing the patient account — code has no second identity]** |
| **Developer / operator** | Whoever runs the app locally | Seed data, drive the API, health checks | `backend/scripts/` (`seed_logs.py`, `drive_app.py`, `test_schedule.py`), `GET /healthz` | Local shell access |

There is **no admin role, no role-based access control, and no multi-tenant separation** beyond "a user can only read/write their own `user_id`-scoped documents."

---

## 3. Features

Grouped by area; each line reflects code that exists today.

**Onboarding & profile**
- 5-step guided setup: name → medications (pick 1–5, name each) → per-medication when-to-take (time + days, same or different) → daily routine → feature toggles (`frontend/components/onboarding.tsx`).
- Browser-detected timezone stored as an IANA zone on the profile.

**Multiple medications**
- 1–5 medications per user, **each with its own independent schedule** (time + days). Two meds can share a time or be at completely different times.
- Add or remove medications after onboarding from Schedule settings (`POST` / `DELETE /schedule/medications`); the last medication can't be removed.
- One shared routine (wake/sleep/meals) across all medications.

**Scheduling** (per medication)
- Each medication has its own default weekly schedule (time + days of week).
- Per-weekday overrides and date-range overrides (`shift` / `set` / `pause`, pause wins), scoped to a medication.
- Shared routine model (wake/sleep, with-food + meal times, variable days); changing routine re-derives every AI-sourced dose time.
- Conflict detection (outside awake hours, not near a meal when with-food, overlapping overrides), per medication.
- Per-medication next-due + 7-day upcoming forecast.

**Logging & adherence**
- One-tap `taken` / `missed` log **per medication**, one entry per medication per day (upsert by `(medication, date_key)`).
- 30-day adherence trend percentage across all medications (`/stats/trend`).
- Calendar/heatmap of recent history in the dashboard (a day is flagged if any medication was missed).

**Wellness check-ins (optional toggle)**
- Post-dose modal: physical (1–5), emotional (1–5), optional note (≤500 chars), attached to the day's log.

**Caregiver view (optional toggle)**
- 30-day summary: adherence %, missed doses, avg physical/mood, recent activity, alert on 2+ consecutive misses.

**Reminders & device**
- Per-medication "Remind me later" counter; auto-logs that medication `missed` after 3 snoozes.
- Real ESP32 device connection over Bluetooth Low Energy via the browser's Web Bluetooth API. The browser talks to the device directly (`frontend/lib/bluetooth.ts`, firmware in `firmware/attune_ble/attune_ble.ino`); the backend only records the last-known connected state (`POST /device {connected}`).

### Diagram — Feature map (Mermaid mindmap)

```mermaid
mindmap
  root((ATTUNE))
    Onboarding
      5-step setup
      Timezone auto-detect
      Feature toggles
    Multiple Medications
      1-5 meds per user
      Own schedule each
      Same or different times
      Add / remove anytime
    Scheduling (per med)
      Weekly schedule
      Weekday overrides
      Date overrides shift/set/pause
      Shared routine wake/sleep/meals
      Conflict detection
      Next-due + 7-day upcoming
    Logging & Adherence
      One-tap taken/missed per med
      30-day trend
      History heatmap
    Wellness Check-ins
      Physical 1-5
      Emotional 1-5
      Optional note
    Insights
      Wed/Thu skip pattern
      Evidence list
    Caregiver View
      Adherence summary
      Mood/physical averages
      Consecutive-miss alert
    Reminders & Device
      Remind-later x3 then auto-miss
      ESP32 BLE via Web Bluetooth
      Backend records last-known state
```

---

## 4. Architecture

Two independently-running processes: a **Next.js frontend** (browser SPA) and a **Python/FastAPI backend**, talking over a JSON REST API at `/api/v1`. The backend persists to **MongoDB**. There are no external API calls in the backend; all scheduling/time math is local.

### Diagram — System architecture (Mermaid flowchart)

```mermaid
flowchart TB
    subgraph Browser["Browser — Next.js 15 / React 19 SPA"]
        UI["Components: AuthGate, Onboarding,\nDashboard, ScheduleSettings,\nCaregiverView, WellnessModal"]
        Store["lib/store.tsx\n(React context state)"]
        ApiClient["lib/api.ts\n(fetch wrapper, Bearer token)"]
        UI --> Store --> ApiClient
        LS["localStorage:\nattune.token"]
        Store -. persists token .-> LS
    end

    subgraph Backend["FastAPI backend (Uvicorn, async)"]
        Router["/api/v1 router"]
        Routes["Routes: auth, profile, logs,\nschedule, stats, insights, caregiver,\nconnections, reminders, device, health"]
        SvcSched["services/scheduling.py\n(per-medication time math)"]
        SvcConn["services/connections.py"]
        Sec["core/security.py\nArgon2 + JWT (HS256)"]
        Router --> Routes
        Routes --> SvcSched
        Routes --> SvcConn
        Routes --> Sec
    end

    subgraph Data["Data"]
        Mongo[("MongoDB\nusers / profiles / logs / connections")]
    end

    ApiClient -->|"HTTPS JSON\nBearer JWT"| Router
    Routes --> Mongo
```

**Key architectural facts (from code):**
- Auth is stateless: `create_access_token` (HS256, 7-day expiry) → bearer token → `get_current_user` decodes it and loads the `users` document on every protected request.
- CORS is restricted to `CORS_ORIGINS` (default `http://localhost:3000`).
- `services/scheduling.py` holds **all time math** (window→clock-time resolution, overrides, conflicts, next-due) and is timezone-aware via `ZoneInfo`. It runs **per medication** — each medication carries its own schedule, while the routine is shared across all of a user's medications.
- `services/connections.py` handles caregiver connection codes / linking.

---

## 5. Data Model

Three MongoDB collections. Documents are scoped to a user via `user_id`. The `profiles` document carries a `medications` array (each medication with its own nested `schedule`) plus one shared `routine` sub-document. Legacy flat fields (`medication`, `scheduleTime`, `schedule`) are kept in sync as mirrors so older readers keep working; profiles created before multi-medication support migrate lazily to a one-element `medications` array (id `"primary"`).

### Diagram — Data model (Mermaid erDiagram)

```mermaid
erDiagram
    USERS ||--o| PROFILES : "has one"
    USERS ||--o{ LOGS : "has many"

    USERS {
        ObjectId _id
        string email "lowercased, unique"
        string password_hash "Argon2"
        datetime created_at
    }

    PROFILES {
        ObjectId _id
        ObjectId user_id FK
        string name
        array medications "[{id, name, schedule{...}}] — each med has its own schedule"
        string timezone "IANA, default UTC"
        object features "aiInsights, wellnessCheckIns, caregiverAccess"
        bool deviceConnected
        object remindMeCounts "{ medicationId: snoozeCount }"
        object routine "shared: wakeTime, sleepTime, withFood, mealTimes, variableDays"
        string medication "legacy mirror: joined medication names"
        string scheduleTime "legacy mirror: first medication's time"
        object schedule "legacy mirror: first medication's schedule"
        datetime created_at
        datetime updated_at
    }

    LOGS {
        ObjectId _id
        ObjectId user_id FK
        string medication_id "which medication this dose is for"
        string date_key "YYYY-MM-DD, one per medication per day"
        datetime timestamp
        string status "taken | missed"
        object checkIn "optional: physical 1-5, emotional 1-5, note<=500"
    }
```

**Notable details:**
- **One log per medication per day** — logging upserts on `(user_id, medication_id, date_key)`. Legacy logs with no `medication_id` are read as belonging to the `"primary"` medication.
- Each entry in `medications[]` is `{id, name, schedule}`; `schedule.source` is `"ai"` or `"user"`, and only `"ai"`-sourced times get re-derived when the (shared) routine changes.
- `schedule.dateOverrides[]` entries carry `{id, start, end, type, note}` plus `shiftMinutes` (type `shift`, ±720) or `time` (type `set`), scoped to that medication.
- `remindMeCounts` is a per-medication snooze counter; a medication auto-logs `missed` after 3 snoozes.
- `features` defaults: `aiInsights=true`, `wellnessCheckIns=true`, `caregiverAccess=false`.

---

## 6. Data Pipelines

The pipeline that matters most: **dose logging → adherence / insights / caregiver**, which runs daily. (Onboarding writes the medications + their schedules directly; see Flow 1 in §8 — there is no external lookup step.)

### Diagram — Logging → adherence, insights, caregiver (Mermaid flowchart)

```mermaid
flowchart TB
    L["One-tap log per med\nPOST /logs {medicationId, status}"] --> M[("logs collection\nupsert by (medication_id, date_key)")]
    L --> N["reset that med's\nremindMeCounts entry = 0"]
    L -->|status=taken & wellness on| O["WellnessModal →\nPOST /logs/{id}/check-in\n{physical, emotional, note}"]
    O --> M
    M --> P["GET /stats/trend\ntaken/total over N days → %"]
    M --> Q["GET /insights/pattern\nWed/Thu skip detector\n(needs >= 7 logs)"]
    M --> R["GET /caregiver/summary\n30-day adherence, mood/physical avgs,\nconsecutive-miss alert"]
    P --> S["Dashboard trend + heatmap"]
    Q --> S
    R --> T["Caregiver View tab"]
```

---

## 7. Key User Flows

### Diagram — Flow 1: Onboarding (Mermaid sequence)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend (onboarding.tsx / store)
    participant API as FastAPI
    participant DB as MongoDB

    U->>FE: Sign up (email, password)
    FE->>API: POST /auth/signup
    API->>DB: insert users doc (Argon2 hash)
    API-->>FE: access_token (JWT)
    U->>FE: Enter name, pick 1–5 meds, set a time and days for each
    U->>FE: Set shared routine, feature toggles
    FE->>API: POST /profile {name, medications[], timezone, features}
    API->>DB: upsert profile (medications array + legacy mirrors)
    FE->>API: PUT /schedule/routine {routine}
    API->>API: recompute AI-sourced times (no-op for user-set times)
    API->>DB: save routine + medications
    API-->>FE: medications view (per-med next-due/upcoming/conflicts)
    FE-->>U: Land on dashboard (one card per medication)
```

### Diagram — Flow 2: Daily dose log + wellness check-in (Mermaid sequence)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend (dashboard / wellnessmodal)
    participant API as FastAPI
    participant DB as MongoDB

    U->>FE: Tap "Mark as taken" on a medication
    FE->>API: POST /logs {medicationId, status:"taken"}
    API->>DB: upsert log (medication_id, date_key), reset that med's snooze
    API-->>FE: {id, medicationId, status, timestamp}
    alt wellnessCheckIns enabled
        FE-->>U: Open WellnessModal
        U->>FE: Pick physical 1-5, emotional 1-5, note
        FE->>API: POST /logs/{id}/check-in
        API->>DB: attach checkIn to log
        API-->>FE: updated log
    end
    FE->>API: GET /stats/trend?days=30
    API->>DB: aggregate taken/total
    API-->>FE: trendPercentage
    FE-->>U: Updated trend + heatmap
```

### Diagram — Flow 3: Reminder snooze → auto-miss, and caregiver alert (Mermaid sequence)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend (dashboard)
    participant API as FastAPI
    participant DB as MongoDB
    actor C as Caregiver (same account, toggle on)

    loop up to 3 times
        U->>FE: Tap "Snooze" on a medication
        FE->>API: POST /reminders/remind-later {medicationId}
        API->>DB: increment remindMeCounts[medicationId]
        API-->>FE: {medicationId, remindMeCount, autoMissed:false}
    end
    Note over API,DB: 3rd snooze for that medication
    API->>DB: auto-log that med status="missed", reset its counter
    API-->>FE: {autoMissed:true}
    C->>FE: Open Caregiver View
    FE->>API: GET /caregiver/summary
    API->>DB: read last 30 days of logs
    API->>API: detect 2+ consecutive misses
    API-->>FE: summary + alert "a gentle check-in might help"
    FE-->>C: Adherence %, averages, alert
```

---

## 8. PRD Field Extract

This table reports only **what the repository actually shows** for each field — it makes no comparison to any PRD and no judgement about whether the code matches a spec.

| PRD Field | What the Repo Shows |
|---|---|
| **Product Overview** | A medication-adherence web app for one or more medications — each with its own time and days (the same time, or different times) — that fits each dose to the user's daily routine and provides per-medication one-tap logging, an adherence trend, optional wellness check-ins, a rule-based pattern insight, and an optional caregiver summary. (Confirmed by `product-skeleton.md` and the implemented routes/services.) |
| **Who it's for** | A single authenticated patient/primary user (adults on a new prescription, elderly patients, or wellness/supplement users). A "caregiver" is served as a *view within the same account* gated by `features.caregiverAccess`, not a separate identity. No admin/role system in code. |
| **Priority Features** | Implemented in code: email+password auth (JWT/Argon2); 5-step onboarding; **multiple medications (1–5), each with its own routine-aware schedule** (weekday + date overrides, conflict detection); add/remove medications post-onboarding; per-medication next-due + 7-day upcoming; per-medication one-tap taken/missed logging; 30-day trend; Wed/Thu pattern insight; wellness check-ins; caregiver summary with consecutive-miss alert; per-medication remind-later→auto-miss; ESP32 device connection over BLE (browser Web Bluetooth; backend records last-known state). |
| **Core Workflow** | **Trigger:** a medication's scheduled dose is due (dashboard shows a per-medication "next dose" card). **Action:** for that medication the user taps "Mark as taken" (or "Snooze"), optionally completing a wellness check-in. **Result:** that medication's day log is upserted, its snooze counter resets, and the trend/heatmap/insight/caregiver summary update. |
| **Aha Moment** | During onboarding the user names one or more medications and gives each its own time and days — the same time or different times — and the dashboard immediately shows a per-medication next-dose card, each resolved to their routine and timezone and independently loggable, instead of a single blank time field. |
| **Inputs** | Email + password; user's name; **one to five medication names, each with its own window/exact time + days of week**; shared routine (wake/sleep, with-food + meal times, variable days); browser-detected IANA timezone; feature toggles; per-medication dose status (`taken`/`missed`); wellness check-in (physical 1–5, emotional 1–5, note ≤500 chars); per-medication schedule overrides (weekday, date-range shift/set/pause). |
| **Outputs** | A resolved **per-medication** weekly schedule with next-due + 7-day upcoming + conflict warnings; adherence trend percentage across all medications; recent-history heatmap; a Wed/Thu pattern message with evidence; a caregiver summary (adherence %, missed count, avg physical/mood, recent activity, consecutive-miss alert); device connected/disconnected flag. |
| **Use of AI** | Only the **pattern insight** — a deterministic, rule-based detector (Wed/Thu misses in the last 8 occurrences, ≥4 threshold), no model and no external calls. No LLM or external drug-data lookup exists in the backend. |
| **MVP Scope** | 1–5 medications per user, each with its own schedule. Fully implemented FastAPI backend (auth/profile/logs/schedule/stats/insights/caregiver/connections/reminders/device/health) + Next.js frontend (onboarding, dashboard, schedule settings, caregiver view, wellness modal). Caregiver is a same-account view. Device connects over BLE (Web Bluetooth → ESP32); backend stores only the last-known connected flag. |
| **Constraints / Must Not Do** | Up to 5 medications per user, each independently scheduled; **no drug–drug interaction checking** (the free NLM RxNav interaction API was discontinued). API key never hardcoded/committed (lives in gitignored `.env`). One log per medication per day. Auth required on all endpoints except `/healthz`, `/auth/signup`, `/auth/login`. CORS restricted to configured origins. |

---

## 10. Assumptions & Open Questions

**Assumptions made while documenting (correct me if wrong):**
- **[ASSUMPTION]** The "caregiver" (as a same-account view) is either the patient themselves reviewing their data or a trusted person using the patient's credentials — the code has no second identity for it; a separate caregiver login/link does exist via the `connections` route and connection codes.
- The physical pill device is integrated over Bluetooth Low Energy: the browser connects directly to an ESP32 (GATT server "Attune Device") via the Web Bluetooth API (`frontend/lib/bluetooth.ts`, firmware `firmware/attune_ble/attune_ble.ino`). The backend (`device.py`) is *not* in the radio path — it only persists the last-known `deviceConnected` flag via `POST /device {connected}` so it survives a refresh. Web Bluetooth requires Chrome/Edge/Opera and a secure context (https or `http://localhost`).
- The grounded **drug-timing AI suggestion** (RxNorm/OpenFDA/LLM) described in earlier drafts and `product-skeleton.md` is **not built** — there is no `drug_timing.py`, no `/schedule/suggest` endpoint, and no external/LLM calls in the backend. Dose times are entered manually and resolved locally.

**Open questions surfaced (some flagged in `product-skeleton.md`):**
- Post-setup landing: should the user land on the calendar, the next-dose home, or the first scheduled dose? (Marked in-progress.)
- Multiple medications (1–5) are now supported and can be added/removed post-onboarding from Schedule settings — should the cap be raised, and should adherence/insights be reported per-medication rather than aggregate?
- What is the UX for an unrecognized medication name beyond degrading to the manual picker?
- Is there any token revocation/refresh story? (`/auth/logout` is a no-op; JWTs simply expire after 7 days.)
- The pattern insight is hard-coded to **Wednesday/Thursday** misses — is that intended as the only pattern, or a placeholder for a more general detector?

---

*End of overview.*
