from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    username_or_email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class ProfileUpdate(BaseModel):
    degree: Optional[str] = None
    college: Optional[str] = None
    branch: Optional[str] = None
    graduation_year: Optional[int] = None
    country: Optional[str] = None
    interests: Optional[List[str]] = []

    @field_validator("graduation_year")
    @classmethod
    def validate_grad_year(cls, v):
        if v is not None and (v < 2000 or v > 2040):
            raise ValueError("Graduation year must be between 2000 and 2040")
        return v


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    degree: Optional[str] = None
    college: Optional[str] = None
    branch: Optional[str] = None
    graduation_year: Optional[int] = None
    country: Optional[str] = None
    profile_completed: bool
    interests: List[str] = []


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    created_at: datetime
    is_active: bool
    profile: Optional[ProfileOut] = None


class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    date: date
    start_time: str
    end_time: str
    venue: str
    organizer: str
    capacity: int = 500
    registration_deadline: datetime


class EventOut(EventBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    registered_count: int = 0
    created_at: datetime

    # Calculated status fields
    status: str = "REGISTRATION_OPEN"
    status_text: str = "Registration open"
    status_badge_class: str = "badge-open"
    can_register: bool = True


class RegistrationCreate(BaseModel):
    event_id: str


class RegistrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    event_id: str
    registered_at: datetime
    event: Optional[EventOut] = None


class OAuthLogin(BaseModel):
    token: str
    provider: Optional[str] = "google"


class OAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool = False
    user: UserOut


class OTPSendRequest(BaseModel):
    email: EmailStr
    purpose: str = "password_reset"  # 'password_reset', 'google_verification'


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=4, max_length=10)
    purpose: str = "password_reset"


class PasswordResetRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=4, max_length=10)
    new_password: str = Field(..., min_length=6)


class GoogleVerifyRequest(BaseModel):
    token: str
    verification_type: str = "otp"  # "otp" or "password"
    otp: Optional[str] = None
    password: Optional[str] = None


