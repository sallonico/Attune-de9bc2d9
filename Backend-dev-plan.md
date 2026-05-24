# ATTUNE — Backend Development Plan

## 1. Executive Summary

- Build a backend for **ATTUNE**, a medication adherence + wellness app currently running with dummy in-memory data on a Next.js frontend.
- Backend powers user onboarding, medication tracking (taken/missed/remind), wellness check-ins, 30-day adherence trends, AI pattern insight, caregiver dashboard, and device-connection toggle.
- Constraints:
  - FastAPI on Python 3.13 (async)
  - MongoDB Atlas via Motor + Pydantic v2
  - No Docker, no Celery, no queues
  - Background work only via FastAPI `BackgroundTasks` if strictly needed
  - Manual UI testing after every task
  - Single git branch `main`
  - API base path `/api/v1`
- Sprint plan: **S0 → S5** (Environment, Auth, Onboarding/Profile, Dose Logging + Reminders, Wellness Check-ins + Trends/Insight, Caregiver View + Device).

---

## 2. In-Scope & Success Criteria

- In-scope features (derived from frontend):
  - User signup / login / logout (JWT)
  - 3-step onboarding (name, medication name, daily schedule time, feature flags: aiInsights, wellnessCheckIns, caregiverAccess)
  - Dose log create (taken/missed) and list (last 30 days)
  - "Remind me later" counter (auto-miss after 3)
  - Wellness check-in (physical 1–5, emotional 1–5, optional note) attached to a log
  - 30-day adherence trend + 28-day history heatmap data
  - AI pattern insight (Wed/Thu skip detection from logs)
  - Caregiver dashboard read-only stats + recent activity
  - Device-connection toggle state persisted per user
- Success Criteria:
  - All frontend features functional end-to-end against live backend
  - All task-level manual tests pass via UI
  - Each sprint's code pushed to `main` after verification

---

## 3. API Design

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <jwt>` on all protected routes
- Error envelope: `{ "error": "message" }`
- Endpoints:
  - **POST `/api/v1/auth/signup`**
    - Purpose: register new user
    - Req: `{ "email": str, "password": str }`
    - Res: `{ "user_id": str, "email": str, "access_token": str }`
    - Validation: email format, password ≥ 8 chars, unique email
  - **POST `/api/v1/auth/login`**
    - Purpose: authenticate user
    - Req: `{ "email": str, "password": str }`
    - Res: `{ "access_token": str, "user_id": str }`
  - **POST `/api/v1/auth/logout`**
    - Purpose: client-side discard (server is stateless)
    - Res: `{ "ok": true }`
  - **GET `/api/v1/auth/me`**
    - Purpose: fetch current user + profile
    - Res: `{ "user_id": str, "email": str, "profile": UserProfile | null }`
  - **POST `/api/v1/profile`**
    - Purpose: complete onboarding (upsert profile)
    - Req: `{ "name": str, "medication": str, "scheduleTime": "HH:mm", "features": { "aiInsights": bool, "wellnessCheckIns": bool, "caregiverAccess": bool } }`
    - Res: `UserProfile`
    - Validation: `scheduleTime` matches `^[0-2][0-9]:[0-5][0-9]$`, name & medication non-empty
  - **GET `/api/v1/profile`**
    - Purpose: read current profile
    - Res: `UserProfile`
  - **PATCH `/api/v1/profile`**
    - Purpose: update feature flags or schedule (used by reset/settings)
    - Req: partial profile fields
    - Res: `UserProfile`
  - **POST `/api/v1/logs`**
    - Purpose: log a dose
    - Req: `{ "status": "taken" | "missed" }`
    - Res: `Log` (id, timestamp, status, checkIn=null)
    - Validation: only one log allowed per UTC calendar day per user (overwrite if exists)
  - **GET `/api/v1/logs?days=30`**
    - Purpose: list recent logs
    - Res: `{ "logs": [Log] }`
    - Validation: `days` int 1–90, default 30
  - **POST `/api/v1/logs/{log_id}/check-in`**
    - Purpose: attach wellness check-in to a log
    - Req: `{ "physical": int 1-5, "emotional": int 1-5, "note": str? }`
    - Res: `Log`
  - **POST `/api/v1/reminders/remind-later`**
    - Purpose: increment remind-me counter; auto-creates "missed" log when count reaches 3
    - Res: `{ "remindMeCount": int, "autoMissed": bool }`
  - **POST `/api/v1/reminders/reset`**
    - Purpose: reset counter when a dose is logged
    - Res: `{ "remindMeCount": 0 }`
  - **GET `/api/v1/stats/trend?days=30`**
    - Purpose: trend percentage for dashboard
    - Res: `{ "days": int, "takenCount": int, "totalCount": int, "trendPercentage": int }`
  - **GET `/api/v1/insights/pattern`**
    - Purpose: AI pattern insight payload (Wed/Thu skip detection)
    - Res: `{ "detected": bool, "message": str, "evidence": [ { "date": "YYYY-MM-DD", "status": "taken"|"missed" } ] }`
  - **GET `/api/v1/caregiver/summary`**
    - Purpose: caregiver dashboard data
    - Res: `{ "patientName": str, "adherence": int, "missedDoses": int, "avgPhysical": float, "avgMood": float, "alert": { "title": str, "body": str } | null, "recentActivity": [ { "title": str, "time": str, "status": "good"|"bad"|"neutral", "note": str? } ] }`
  - **POST `/api/v1/device/toggle`**
    - Purpose: toggle simulated device-connected state
    - Res: `{ "deviceConnected": bool }`
  - **GET `/api/v1/device`**
    - Purpose: read device state
    - Res: `{ "deviceConnected": bool }`

---

## 4. Data Model (MongoDB Atlas)

- **users**
  - `_id`: ObjectId
  - `email`: str (required, unique)
  - `password_hash`: str (Argon2, required)
  - `created_at`: datetime (default now)
  - Example:
    - `{ "_id": "...", "email": "margaret@example.com", "password_hash": "$argon2id$...", "created_at": "2026-05-24T10:00:00Z" }`
- **profiles** (one per user)
  - `_id`: ObjectId
  - `user_id`: ObjectId (ref users, required, unique)
  - `name`: str (required)
  - `medication`: str (required)
  - `scheduleTime`: str (HH:mm, required)
  - `features`: embedded `{ aiInsights: bool, wellnessCheckIns: bool, caregiverAccess: bool }`
  - `deviceConnected`: bool (default false)
  - `remindMeCount`: int (default 0)
  - `updated_at`: datetime
  - Example:
    - `{ "user_id": "...", "name": "Margaret", "medication": "Levothyroxine", "scheduleTime": "08:00", "features": { "aiInsights": true, "wellnessCheckIns": true, "caregiverAccess": false }, "deviceConnected": false, "remindMeCount": 0 }`
- **logs**
  - `_id`: ObjectId
  - `user_id`: ObjectId (ref users, required)
  - `timestamp`: datetime (required)
  - `date_key`: str (YYYY-MM-DD UTC, required, used for one-per-day rule)
  - `status`: str (`taken` | `missed`, required)
  - `checkIn`: embedded `{ physical: int, emotional: int, note: str? } | null`
  - Example:
    - `{ "user_id": "...", "timestamp": "2026-05-24T08:05:00Z", "date_key": "2026-05-24", "status": "taken", "checkIn": { "physical": 5, "emotional": 4, "note": "Feeling great" } }`

---

## 5. Frontend Audit & Feature Map

- **`app/page.tsx` (MainApp shell)**
  - Reads: `isOnboarded`, `userProfile`, `features.caregiverAccess`
  - Endpoints: `GET /auth/me`, `GET /profile`
  - Auth: required after signup
- **`components/onboarding.tsx`**
  - Captures name, medication, scheduleTime, features
  - Endpoint: `POST /profile`
  - Auth: required (signup first, then onboarding)
- **`components/dashboard.tsx`**
  - Greeting (name, medication, scheduleTime) → `GET /profile`
  - "Log as Taken" → `POST /logs {status:"taken"}` (auto opens wellness modal if `features.wellnessCheckIns`)
  - "Remind me later" → `POST /reminders/remind-later`
  - 30-day trend → `GET /stats/trend?days=30`
  - 28-day heatmap → `GET /logs?days=28`
  - AI insight card → `GET /insights/pattern` (only when `features.aiInsights` & ≥7 logs)
  - Device toggle → `POST /device/toggle`, `GET /device`
  - Auth: required
- **`components/wellnessmodal.tsx`** (file not read, derived from store)
  - Submits check-in for pending log → `POST /logs/{log_id}/check-in`
  - Skip → no backend call
  - Auth: required
- **`components/caregiverview.tsx`**
  - All data → `GET /caregiver/summary`
  - Auth: required + `features.caregiverAccess == true`
- **Reset button (LogOut icon in nav)**
  - Client-side state wipe; server logout via `POST /auth/logout`

---

## 6. Configuration & ENV Vars

- `APP_ENV` — `development` or `production`
- `PORT` — HTTP port (default `8000`)
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — token signing key
- `JWT_EXPIRES_IN` — seconds before JWT expiry (default `604800` = 7 days)
- `CORS_ORIGINS` — allowed frontend URL(s), e.g. `http://localhost:3000`

---

## 7. Background Work

- Not required for MVP. All operations are synchronous request/response.
- "Remind me later" is stateful (counter on profile) but not scheduled — frontend handles timing of next prompt; backend just tracks counter and auto-creates missed log at threshold.

---

## 8. Integrations

- None required for MVP. No file uploads, no payments, no third-party APIs.
- "AI Insight" is a deterministic pattern detector over user's own logs (no LLM/external call).

---

## 9. Testing Strategy (Manual via Frontend)

- All validation is performed by exercising the Next.js frontend against the running FastAPI backend.
- Each task in sprints below carries:
  - **Manual Test Step** — precise UI action + expected outcome
  - **User Test Prompt** — copy/paste instruction to hand to the tester
- Sprint completion rule:
  - All task tests pass → `git add -A && git commit -m "<sprint>" && git push origin main`
  - Any failure → fix, retest, then push

---

## 10. Sprint Plan & Backlog

### S0 — Environment Setup & Frontend Connection

- **Objectives:**
  - Scaffold FastAPI project (`backend/`) on Python 3.13 (async)
  - `/api/v1` router + `GET /healthz` (pings MongoDB Atlas)
  - Motor client wired with `MONGODB_URI`
  - Pydantic v2 settings loader for env vars
  - CORS middleware reading `CORS_ORIGINS`
  - Replace any frontend dummy URLs / add `NEXT_PUBLIC_API_BASE_URL` and a thin API client in `frontend/lib/api.ts`
  - Initialize git at repo root, default branch `main`, single root `.gitignore` (`__pycache__`, `*.pyc`, `.env`, `node_modules`, `.next`), push to GitHub
- **User Stories:**
  - As a developer, I can run `uvicorn` and see the backend reachable from the frontend.
- **Tasks:**
  - Create `backend/` skeleton (`main.py`, `core/config.py`, `core/db.py`, `api/v1/__init__.py`, `requirements.txt`)
    - Manual Test Step: Run `uvicorn backend.main:app --reload`, open `http://localhost:8000/api/v1/healthz` → JSON `{ "status": "ok", "db": "ok" }`
    - User Test Prompt: "Start the backend with `uvicorn backend.main:app --reload` and open `/api/v1/healthz`. Confirm you see `db: ok`."
  - Add CORS for `http://localhost:3000`
    - Manual Test Step: Open frontend → DevTools → Network shows successful `OPTIONS` + `GET /healthz`
    - User Test Prompt: "Open the frontend at `localhost:3000` with backend running. Verify Network shows `/healthz` 200 OK with no CORS error."
  - Add `frontend/lib/api.ts` exporting `apiFetch(path, opts)` and `NEXT_PUBLIC_API_BASE_URL`
    - Manual Test Step: From browser console call `window.fetch('http://localhost:8000/api/v1/healthz')` → 200
    - User Test Prompt: "From the browser console hit `/api/v1/healthz`. Confirm status 200."
  - Init git, `.gitignore`, push to GitHub `main`
    - Manual Test Step: `git status` clean; remote `main` shows commits on GitHub UI
    - User Test Prompt: "Open the GitHub repo. Confirm the initial backend skeleton appears on `main`."
- **Definition of Done:** Backend runs locally, `/healthz` returns DB-ok, frontend can reach backend without CORS errors, repo live on `main`.
- **Post-sprint:** `git commit -m "S0: backend skeleton + atlas connection" && git push origin main`

---

### S1 — Basic Auth (Signup / Login / Logout)

- **Objectives:**
  - Implement JWT signup, login, logout, `me`
  - Frontend gains a minimal email/password screen *before* onboarding (small new component or extend `Onboarding`)
  - Protect all `/api/v1/*` routes except `/healthz` and `/auth/*`
- **User Stories:**
  - As a new user, I can create an account and stay logged in across reloads.
- **Tasks:**
  - Implement `POST /auth/signup` with Argon2 hashing
    - Manual Test Step: Use signup screen → success → token stored in `localStorage`
    - User Test Prompt: "Create an account with a new email. Confirm you're logged in and onboarding appears."
  - Implement `POST /auth/login`
    - Manual Test Step: Log out, log back in → token reissued, onboarding/dashboard restored
    - User Test Prompt: "Log out and log back in with the same credentials. Confirm dashboard returns."
  - Implement `POST /auth/logout` + frontend clears token; `GET /auth/me` returns current user
    - Manual Test Step: After logout, refreshing the app shows the login screen
    - User Test Prompt: "Click logout. Refresh the page. Confirm you're sent back to login."
  - Protect a sample route (`/profile`) and confirm 401 without token
    - Manual Test Step: From console, fetch `/api/v1/profile` with no token → 401
    - User Test Prompt: "Without logging in, hit `/api/v1/profile` from console. Confirm 401."
- **Definition of Done:** Auth flow works end-to-end; token persisted client-side; protected routes 401 anonymously.
- **Post-sprint:** push to `main`.

---

### S2 — Onboarding & Profile

- **Objectives:**
  - Persist 3-step onboarding output to MongoDB
  - `GET /auth/me` returns profile so `isOnboarded` is server-driven
  - Frontend `store.tsx` updated: `completeOnboarding` now calls `POST /profile`; `useEffect` on app load calls `GET /auth/me`
- **User Stories:**
  - As a user, my onboarding answers persist after refresh.
- **Tasks:**
  - Implement `POST /profile` (upsert)
    - Manual Test Step: Complete onboarding with name="Margaret", medication="Levothyroxine", time="08:00", all features on → reload → dashboard greets "Hello, Margaret"
    - User Test Prompt: "Finish onboarding then refresh the page. Confirm your name still appears."
  - Implement `GET /profile` and wire `MainApp` to hydrate `userProfile` from server
    - Manual Test Step: After reload, `userProfile.medication` matches what was entered
    - User Test Prompt: "Refresh after onboarding. Confirm the medication name matches what you entered."
  - Implement `PATCH /profile` and hook frontend "reset" / settings to clear feature flags (e.g., turning off caregiverAccess hides the tab)
    - Manual Test Step: Disable caregiverAccess via a temporary toggle (or PATCH from console) → "Caregiver View" tab disappears
    - User Test Prompt: "Disable caregiver access. Confirm the Caregiver View tab disappears immediately."
- **Definition of Done:** Profile persists, hydrates on load, feature flags drive UI.
- **Post-sprint:** push to `main`.

---

### S3 — Dose Logging & Remind-Me-Later

- **Objectives:**
  - Persist dose logs in MongoDB
  - Enforce one log per day per user (later writes overwrite the day's record)
  - Implement remind-me-later counter and auto-miss at 3
  - Replace mock 30-day generator in frontend store with API-driven logs
- **User Stories:**
  - As a user, when I tap "Log as Taken", that fact persists and the heatmap updates.
- **Tasks:**
  - Implement `POST /logs` (one-per-day upsert)
    - Manual Test Step: Click "Log as Taken" → today's heatmap cell turns teal → refresh page → still teal
    - User Test Prompt: "Tap 'Log as Taken'. Refresh the page. Confirm today is still marked taken."
  - Implement `GET /logs?days=28` and wire dashboard heatmap + trend to it
    - Manual Test Step: Heatmap shows real (currently empty) state for new users with only today logged
    - User Test Prompt: "As a fresh user, log today's dose. Confirm exactly one cell is filled in the heatmap."
  - Implement `POST /reminders/remind-later` and `POST /reminders/reset`
    - Manual Test Step: Tap "Remind me later" 3 times → button counter shows `(3/3)` then today's card flips to "Dose Missed"
    - User Test Prompt: "Tap 'Remind me later' three times. Confirm the third tap marks today as missed."
  - Reset remindMeCount on a successful log
    - Manual Test Step: After tapping remind twice, then "Log as Taken" → reset; counter no longer shown
    - User Test Prompt: "Tap remind-later twice, then log as taken. Confirm the counter resets."
- **Definition of Done:** Dose logs persist, heatmap and trend reflect real data, remind-me-later behaves as in store.
- **Post-sprint:** push to `main`.

---

### S4 — Wellness Check-ins, Trend Stats & AI Insight

- **Objectives:**
  - Persist wellness check-ins onto the most recent log
  - Server-computed 30-day trend
  - Deterministic AI pattern endpoint (Wed/Thu skip detection over last 8 such weekdays)
- **User Stories:**
  - As a user with check-ins enabled, after logging a dose I can record how I feel and see it stored.
  - As a user with AI insights on, after enough logs I see a relevant pattern card.
- **Tasks:**
  - Implement `POST /logs/{log_id}/check-in` and wire `WellnessModal` submit
    - Manual Test Step: Log a dose → modal opens → submit physical=4, emotional=3, note="ok" → close → reopen via dev tools view of log → check-in present
    - User Test Prompt: "Log a dose, fill in the wellness modal, submit. Confirm no errors and the modal closes."
  - Implement `GET /stats/trend?days=30` and replace client-side calc
    - Manual Test Step: Trend percentage on dashboard matches manual count of taken/total over last 30 days
    - User Test Prompt: "Log a couple of doses. Confirm the 30-Day Trend percentage updates accordingly."
  - Implement `GET /insights/pattern`: look back ≤8 most recent Wed/Thu entries; if ≥4 missed, return `detected:true` with that count and evidence list
    - Manual Test Step: Seed a few Wed/Thu missed logs (via repeated `POST /logs` with past dates from console if helper added, or simply log "missed" several Wed/Thu) → AI Insight card appears with evidence bars
    - User Test Prompt: "Once you have several Wed/Thu logs, confirm the 'Pattern Detected' card appears with evidence bars."
  - Hide AI Insight card when `detected:false` or fewer than 7 logs
    - Manual Test Step: Fresh user with <7 logs → no insight card
    - User Test Prompt: "As a brand new user, confirm no AI Insight card is shown."
- **Definition of Done:** Check-ins persist, trend is server-driven, insight card shows only when warranted.
- **Post-sprint:** push to `main`.

---

### S5 — Caregiver Summary & Device Toggle

- **Objectives:**
  - Server-computed caregiver summary endpoint
  - Persisted device-connected toggle
- **User Stories:**
  - As a caregiver-enabled user, the Caregiver View shows my real stats and a recent activity feed.
  - As a user, toggling "Connect Device" persists across reloads.
- **Tasks:**
  - Implement `GET /caregiver/summary` computing adherence%, missed count, avg physical, avg mood (from check-ins), and last 4 activity items
    - Manual Test Step: Switch to "Caregiver View" tab → numbers match real logs; recent activity lists last 4 events
    - User Test Prompt: "Open Caregiver View. Confirm adherence and stats match what you logged."
  - Generate AI alert ("Attention Needed") on summary when ≥2 consecutive missed evening doses
    - Manual Test Step: Log 2 consecutive missed days → alert box appears; otherwise hidden
    - User Test Prompt: "Log two consecutive missed days, then open Caregiver View. Confirm the alert card appears."
  - Implement `POST /device/toggle` and `GET /device`; wire `toggleDeviceConnection` to server
    - Manual Test Step: Click "Connect Device" → spinner → "ATTUNE Connected"; refresh page → still connected
    - User Test Prompt: "Tap 'Connect Device' then refresh. Confirm the device still shows connected."
  - Enforce `features.caregiverAccess` server-side: 403 on `/caregiver/summary` if disabled
    - Manual Test Step: Disable caregiverAccess via PATCH → frontend hides tab; direct fetch returns 403
    - User Test Prompt: "Turn caregiver access off, then call `/api/v1/caregiver/summary` from console. Confirm 403."
- **Definition of Done:** Caregiver dashboard fully dynamic; device toggle persisted; access guard enforced.
- **Post-sprint:** push to `main`.

---

## Compliance Checklist

- Bullets only — done
- Frontend-visible features only — done (no email verification, no settings page beyond toggles, no notifications backend, no real Bluetooth)
- Minimal APIs/models aligned to UI — done
- MongoDB Atlas only — done
- Python 3.13 runtime — done
- Per-task manual tests — done
- Push to `main` after each sprint — included in each DoD
