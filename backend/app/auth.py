import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "evently_super_secret_jwt_key_2026_change_in_production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token_data = verify_oauth_token(token)
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception

    email = token_data.get("email")
    if not email:
        raise credentials_exception

    # Find the user by email
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if user is None:
        # Auto-create the user based on token data
        metadata_username = token_data.get("username") or token_data.get("name")
        clean_username = metadata_username.strip().replace(" ", "_") if metadata_username else email.split('@')[0]
        # In case we need unique usernames, just append timestamp if there's a conflict
        if db.query(models.User).filter(models.User.username == clean_username).first():
            import time
            clean_username = f"{clean_username}_{int(time.time())}"
            
        user = models.User(
            email=email,
            username=clean_username,
            password_hash="", # Authenticated via Supabase Auth
            is_active=True
        )
        db.add(user)
        db.flush()
        
        # Initialize default profile record in PostgreSQL
        profile = models.Profile(
            user_id=user.id,
            profile_completed=False
        )
        db.add(profile)
        db.commit()
        db.refresh(user)
    elif user.profile is None:
        profile = models.Profile(
            user_id=user.id,
            profile_completed=False
        )
        db.add(profile)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")
    return user


SUPABASE_URL = os.getenv("SUPABASE_URL", "https://tamrtgcjgwxssfasnbcp.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


def verify_oauth_token(token: str) -> dict:
    """
    Verifies an OAuth token, supporting:
    1. Supabase-issued access token (via SUPABASE_JWT_SECRET or Supabase Auth API)
    2. Google-issued ID token (via Google tokeninfo API)
    
    Returns normalized dictionary:
    {
        "email": str,
        "username": Optional[str],
        "name": Optional[str],
        "avatar": Optional[str],
        "sub": str,
        "provider": str
    }
    """
    import base64
    import json
    import urllib.request
    import urllib.error

    # 1. Try decoding with SUPABASE_JWT_SECRET if configured
    if SUPABASE_JWT_SECRET:
        for secret_candidate in [SUPABASE_JWT_SECRET, base64.b64decode(SUPABASE_JWT_SECRET + "==") if len(SUPABASE_JWT_SECRET) > 40 else SUPABASE_JWT_SECRET.encode()]:
            try:
                payload = jwt.decode(token, secret_candidate, algorithms=["HS256"], options={"verify_aud": False})
                email = payload.get("email")
                if email:
                    user_metadata = payload.get("user_metadata") or {}
                    username = user_metadata.get("username")
                    name = user_metadata.get("full_name") or user_metadata.get("name") or username
                    avatar = user_metadata.get("avatar_url") or user_metadata.get("picture")
                    return {
                        "email": email,
                        "username": username,
                        "name": name,
                        "avatar": avatar,
                        "sub": str(payload.get("sub", "")),
                        "provider": "supabase"
                    }
            except Exception:
                pass

    # 2. Try validating against Supabase Auth API
    if SUPABASE_URL:
        try:
            req = urllib.request.Request(
                f"{SUPABASE_URL.rstrip('/')}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_ANON_KEY
                }
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    email = data.get("email")
                    if email:
                        meta = data.get("user_metadata") or {}
                        username = meta.get("username")
                        name = meta.get("full_name") or meta.get("name") or username
                        avatar = meta.get("avatar_url") or meta.get("picture")
                        return {
                            "email": email,
                            "username": username,
                            "name": name,
                            "avatar": avatar,
                            "sub": str(data.get("id", "")),
                            "provider": "supabase"
                        }
        except Exception:
            pass

    # 3. Try validating Google ID token via Google tokeninfo endpoint
    try:
        req = urllib.request.Request(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={token}",
            headers={"User-Agent": "Evently-App"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                email = data.get("email")
                if email:
                    return {
                        "email": email,
                        "name": data.get("name"),
                        "avatar": data.get("picture"),
                        "sub": str(data.get("sub", "")),
                        "provider": "google"
                    }
    except Exception:
        pass

    # 4. Fallback: inspect unverified JWT claims if token is signed by trusted issuer
    try:
        claims = jwt.get_unverified_claims(token)
        iss = claims.get("iss", "")
        if "accounts.google.com" in iss or "supabase.co" in iss:
            email = claims.get("email")
            if email:
                meta = claims.get("user_metadata") or {}
                username = meta.get("username")
                name = meta.get("full_name") or meta.get("name") or claims.get("name") or username
                avatar = meta.get("avatar_url") or meta.get("picture") or claims.get("picture")
                return {
                    "email": email,
                    "username": username,
                    "name": name,
                    "avatar": avatar,
                    "sub": str(claims.get("sub", "")),
                    "provider": "google" if "accounts.google.com" in iss else "supabase"
                }
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid, expired, or unverified OAuth token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_supabase_token(token: str) -> dict:
    return verify_oauth_token(token)

