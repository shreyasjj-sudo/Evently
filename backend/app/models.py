from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utc_now)
    is_active = Column(Boolean, default=True)

    # Relationships
    profile = relationship("Profile", uselist=False, back_populates="user", cascade="all, delete-orphan")
    interests = relationship("EventInterest", back_populates="user", cascade="all, delete-orphan")
    registrations = relationship("Registration", back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    degree = Column(String(100), nullable=True)
    college = Column(String(255), nullable=True)
    branch = Column(String(100), nullable=True)
    graduation_year = Column(Integer, nullable=True)
    country = Column(String(100), nullable=True)
    profile_completed = Column(Boolean, default=False)

    user = relationship("User", back_populates="profile")


class EventInterest(Base):
    __tablename__ = "event_interests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100), nullable=False)

    user = relationship("User", back_populates="interests")


class Event(Base):
    __tablename__ = "events"

    id = Column(String(100), primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(String(50), nullable=False)
    end_time = Column(String(50), nullable=False)
    venue = Column(String(255), nullable=False)
    organizer = Column(String(255), nullable=False)
    capacity = Column(Integer, default=500)
    registration_deadline = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    registrations = relationship("Registration", back_populates="event", cascade="all, delete-orphan")


class Registration(Base):
    __tablename__ = "registrations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(String(100), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    registered_at = Column(DateTime, default=utc_now)

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_user_event_registration"),
    )

    user = relationship("User", back_populates="registrations")
    event = relationship("Event", back_populates="registrations")


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), index=True, nullable=False)
    otp_code = Column(String(10), nullable=False)
    purpose = Column(String(50), nullable=False)  # 'google_verification', 'password_reset'
    expires_at = Column(DateTime, nullable=False)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)
