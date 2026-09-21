from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    """
    Returns the currently authenticated user details, automatically synchronizing
    the Supabase authenticated user with the PostgreSQL database.
    """
    return current_user


@router.post("/sync", response_model=schemas.UserOut)
def sync_user(current_user: models.User = Depends(auth.get_current_user)):
    """
    Explicitly synchronizes the authenticated Supabase user session with Evently PostgreSQL.
    """
    return current_user
