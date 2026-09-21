# Evently College Event Management System - FastAPI Backend

This directory contains the FastAPI backend for **Evently**, providing user authentication, student profile completion, event management with calendar range querying, dynamic event status calculations, and event registrations.

---

## Technical Stack
- **Framework**: FastAPI + Uvicorn
- **Database**: PostgreSQL (SQLAlchemy ORM)
- **Security**: JWT (`python-jose`) + `passlib` (bcrypt password hashing)
- **Configuration**: `python-dotenv`, Pydantic v2

---

## Quickstart Instructions

### 1. Create the Database & Start PostgreSQL
Ensure PostgreSQL is installed and running on your system.
Create the `evently` database using `psql` or PostgreSQL CLI:

```bash
# Connect to PostgreSQL shell
psql -U postgres

# Create the evently database
CREATE DATABASE evently;

# Exit psql
\q
```

### 2. Configure Environment Variables
Verify `.env` in the `backend/` directory:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evently
SECRET_KEY=evently_super_secret_jwt_key_2026_change_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

*(If testing locally without PostgreSQL running, setting `DATABASE_URL=sqlite:///./evently.db` uses SQLite automatically).*

### 3. Install Dependencies
Set up a Python virtual environment and install backend requirements:

```bash
cd backend
python -m venv venv

# Activate virtual environment
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 4. Seed the Database
Populate the database with all 760+ realistic competitive coding & college campus events:

```bash
python seed.py
```

### 5. Start FastAPI Server
Launch Uvicorn development server:

```bash
uvicorn app.main:app --reload --port 8000
```

---

## API Documentation & Testing

Once running, access the interactive OpenAPI documentation in your browser:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Core Endpoints Overview

#### Authentication (`/auth`)
- `POST /auth/signup` - Register a student account
- `POST /auth/login` - Obtain JWT access token
- `GET /auth/me` - Get current user info

#### Profiles (`/users`)
- `GET /users/me` - Get profile details & interests
- `PUT /users/me/profile` - Complete/update profile & interests

#### Events (`/events`)
- `GET /events?start_date=2026-09-01&end_date=2026-09-30` - Date range query for calendar
- `GET /events?category=Coding%20Competitions` - Filter by category
- `GET /events/search?q=Codeforces` - Search events
- `GET /events/{event_id}` - Single event detail with calculated status

#### Registrations (`/registrations`)
- `POST /registrations` - Register for an event
- `GET /registrations/me` - View user's tickets & registered events
- `DELETE /registrations/{event_id}` - Cancel event registration
