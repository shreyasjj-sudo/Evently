import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import auth, users, events, registrations

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))
load_dotenv()

# Ensure database tables exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Evently College Event Management System API",
    description="Cloud-based Event Management REST API supporting student authentication, profiles, calendar events, and registrations.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(events.router)
app.include_router(registrations.router)


@app.get("/", tags=["Health"])
def root_health_check():
    return {
        "status": "online",
        "app": "Evently College Event Management System API",
        "version": "1.0.0",
        "docs": "/docs"
    }
