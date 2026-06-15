# ATTUNE — Running it locally

ATTUNE has two parts — a **Python/FastAPI backend** and a **Next.js frontend** — and you need both running at the same time, in two separate terminal tabs. Then open localhost in your browser.

### 1. Backend (API) — http://localhost:8000

Requires a `backend/.env` (see `backend/.env.example`). Run it from inside `backend/` so it loads `.env`.

```bash
cd /Users/sallonigill/Attune-de9bc2d9/backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (the app you open) — http://localhost:3000

```bash
cd /Users/sallonigill/Attune-de9bc2d9/frontend
npm run dev
```

Open **http://localhost:3000** in your browser.
