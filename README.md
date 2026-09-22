# Evently

A cloud-based college event platform. Students sign in, complete a campus profile, browse a date-indexed calendar, and register for events without hunting through group chats and noticeboards.

The frontend is a Vite SPA. The API is FastAPI with SQLAlchemy. Auth is handled by Supabase (email/password and Google), then synced into Evently’s own user and profile tables.

---

## What it does

- **Discover by date.** Open the calendar, pick a day, and see everything scheduled that day.
- **Filter by interest.** Coding competitions, hackathons, career sessions, workshops, sports, and cultural events.
- **Register in one step.** Capacity, deadlines, and completed events are enforced on the server.
- **Student profiles.** Degree, college, branch, graduation year, country, and interest tags gate the calendar until onboarding is done.
- **Google sign-in.** Supabase OAuth plus optional OTP verification for Google accounts.

The seeded catalog is **761 events** spanning late 2025 through mid-2027, mixing real competitive programming contests (Codeforces, CodeChef, LeetCode, AtCoder, HackerRank) with campus fests, placements, and club activities.

Statuses are computed against a simulated “today” of **19 September 2026**, so open, in-progress, closed, and completed events all appear in a realistic mix.

---

## Architecture

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Vite SPA (index.html +     │     │  FastAPI  (uvicorn :8000)    │
│  src/main.js, style.css)    │────▶│  /auth  /users  /events      │
│  Client router + AuthService│     │  /registrations              │
└──────────────┬──────────────┘     └──────────────┬───────────────┘
               │                                   │
               │  Supabase Auth JWT                │  SQLAlchemy
               ▼                                   ▼
        ┌──────────────┐                 PostgreSQL (prod)
        │   Supabase   │                 SQLite fallback (local)
        └──────────────┘
```

**Frontend** talks to Supabase for sessions, then calls `POST /auth/sync` so the same student exists in Evently’s database.

**Backend** verifies the Supabase JWT (or a local JWT), auto-creates users on first sync, and owns events, profiles, interests, registrations, and OTP records.

**Deploy shape:** the SPA is set up for Vercel (`vercel.json` rewrites all paths to `index.html`). The API Dockerfile runs Uvicorn on Cloud Run (`PORT`, PostgreSQL required when `K_SERVICE` is set).

---

## Project layout

```
Evently/
├── index.html                 # All views (landing, login, calendar, events, profile, about)
├── src/
│   ├── main.js                # SPA router, auth, calendar, registrations, profile
│   ├── style.css
│   └── eventsData.js          # 761-event catalog (also used by the seeder)
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, routers
│   │   ├── auth.py            # JWT / Supabase token verification
│   │   ├── models.py          # User, Profile, Event, Registration, OTP
│   │   ├── schemas.py
│   │   ├── database.py        # Postgres, with local SQLite fallback
│   │   ├── email_service.py   # OTP email (Supabase function / SMTP)
│   │   └── routers/           # auth, users, events, registrations
│   ├── seed.py                # Load events + demo student
│   ├── Dockerfile
│   └── requirements.txt
├── .env.development.example   # Frontend env template
└── vercel.json
```

---

## Prerequisites

- Node.js 18+ (Vite 8)
- Python 3.11+
- PostgreSQL (optional locally; SQLite is used if Postgres is unreachable)

---

## Local setup

### 1. Frontend

```bash
npm install
cp .env.development.example .env.development
```

Edit `.env.development`:

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

```bash
npm run dev
```

Vite serves the app at [http://localhost:5173](http://localhost:5173).

Without a local API, the SPA falls back to the deployed backend URL in `src/main.js`. For real local work, keep `VITE_API_URL=http://localhost:8000`.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evently
SECRET_KEY=change-me-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

If PostgreSQL is not running, the app logs a warning and uses `sqlite:///./evently.db`. You can also set that URL yourself.

```bash
# optional: create the Postgres database
createdb evently   # or: CREATE DATABASE evently; in psql

python seed.py
uvicorn app.main:app --reload --port 8000
```

- API: [http://localhost:8000](http://localhost:8000)
- Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

Seed creates:

- All events from `src/eventsData.js`
- Demo user `student@college.edu` / `pass1234` with a completed profile

That demo login is a **backend** account. The live UI signs in through **Supabase**, so create a user in your Supabase project (or use Google OAuth) for the browser flow.

---

## App routes

| Path | Access | Purpose |
|------|--------|---------|
| `/` | Public | Landing page |
| `/login` | Public | Email/password and Google sign-in |
| `/complete-profile` | Signed in | Required before calendar/events |
| `/calendar` | Signed in + profile | Month calendar, day drill-down |
| `/events` | Signed in + profile | Month list, search, category filters |
| `/event` | Signed in | Event detail |
| `/profile` | Signed in + profile | Student profile and stats |
| `/about` | Public | About |

Light/dark theme is stored in the client and can be toggled from the header.

---

## Event catalog

| Category | Count |
|----------|------:|
| Coding Competitions | 268 |
| Technical & Hackathons | 186 |
| Career & Placement | 131 |
| Academic & Workshops | 94 |
| Sports & Fitness | 42 |
| Cultural & Arts | 40 |

Each event has title, description, venue, organizer, capacity, times, and a registration deadline. The API derives:

| Status | Meaning |
|--------|---------|
| `REGISTRATION_OPEN` | Future event, seats and deadline remaining |
| `IN_PROGRESS` | Event date is the simulated today |
| `REGISTRATION_CLOSED` | Deadline passed or at capacity |
| `COMPLETED` | Event date is in the past |

Registrations are unique per `(user, event)` and rejected when the event cannot be registered.

---

## API surface

Base URL locally: `http://localhost:8000`

### Auth

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/auth/me` | Current user (Bearer token) |
| `POST` | `/auth/sync` | Upsert Supabase user into Postgres |

### Users

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/users/me` | Profile and interests |
| `PUT` | `/users/me/profile` | Complete or update profile |

### Events

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/events` | Filters: `start_date`, `end_date`, `date`, `category`, `search` |
| `GET` | `/events/search?q=` | Title / description search |
| `GET` | `/events/date/{YYYY-MM-DD}` | Events on one day |
| `GET` | `/events/category/{category}` | Category listing |
| `GET` | `/events/{event_id}` | Detail plus computed status |

Example calendar query:

```http
GET /events?start_date=2026-09-01&end_date=2026-09-30
```

### Registrations

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/registrations` | Body: `{ "event_id": "..." }` |
| `GET` | `/registrations/me` | Current student’s tickets |
| `GET` | `/events/{event_id}/registrations` | Attendance for an event |
| `DELETE` | `/registrations/{event_id}` | Cancel |

Send `Authorization: Bearer <access_token>` on authenticated routes. More detail lives in [`backend/README.md`](backend/README.md).

---

## Scripts

| Command | Where | What |
|---------|-------|------|
| `npm run dev` | repo root | Vite dev server |
| `npm run build` | repo root | Production SPA build |
| `npm run preview` | repo root | Preview the build |
| `python seed.py` | `backend/` | Load events and demo user |
| `uvicorn app.main:app --reload --port 8000` | `backend/` | API with reload |

---

## Environment reference

**Frontend** (`VITE_*` must be present at build time):

| Variable | Role |
|----------|------|
| `VITE_API_URL` | FastAPI origin |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services client ID |

**Backend:**

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Postgres or SQLite connection string |
| `SECRET_KEY` | Local JWT signing (change in production) |
| `ALGORITHM` | Default `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Default `1440` (24h) |
| `ALLOWED_ORIGINS` | CORS allowlist (comma-separated) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | OTP / email helpers |
| `SUPABASE_JWT_SECRET` | Verify Supabase access tokens |
| `SMTP_*` | Optional SMTP fallback for OTP mail |

Do not commit `.env` files. `.gitignore` already excludes them; only `.env.development.example` is tracked.

---

## Data model (short)

- **User** — username, email, password hash (empty when auth is Supabase-only)
- **Profile** — academic fields; `profile_completed` when all required fields are set
- **EventInterest** — category tags per user
- **Event** — catalog row; string primary keys from the dataset
- **Registration** — unique user + event
- **OTPVerification** — Google verification and password-reset codes

---

## Stack

| Layer | Choice |
|-------|--------|
| UI | HTML, CSS, vanilla JS (Vite) |
| Auth | Supabase Auth, Google Identity Services |
| API | FastAPI, Pydantic v2, Uvicorn |
| ORM | SQLAlchemy 2 |
| Database | PostgreSQL / SQLite |
| Hosting | Vercel (SPA), Cloud Run (API) |

---

## License

Private project (`"private": true` in `package.json`). All rights reserved unless the owners add a license.
