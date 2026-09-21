from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/users", tags=["Users & Profiles"])


@router.get("/me", response_model=schemas.UserOut)
def get_user_profile(current_user: models.User = Depends(auth.get_current_user)):
    """
    Returns full profile details for the currently logged-in user.
    """
    # Build list of interest string categories
    interests_list = [interest.category for interest in current_user.interests]

    profile_out = None
    if current_user.profile:
        profile_out = schemas.ProfileOut(
            id=current_user.profile.id,
            user_id=current_user.profile.user_id,
            degree=current_user.profile.degree,
            college=current_user.profile.college,
            branch=current_user.profile.branch,
            graduation_year=current_user.profile.graduation_year,
            country=current_user.profile.country,
            profile_completed=current_user.profile.profile_completed,
            interests=interests_list
        )

    return schemas.UserOut(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at,
        is_active=current_user.is_active,
        profile=profile_out
    )


@router.put("/me/profile", response_model=schemas.ProfileOut)
def update_user_profile(
    profile_in: schemas.ProfileUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates profile details and event interests for the authenticated user.
    Automatically sets profile_completed to True if all required profile fields are submitted.
    """
    profile = current_user.profile
    if not profile:
        profile = models.Profile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    # Update profile fields if provided
    if profile_in.degree is not None:
        profile.degree = profile_in.degree
    if profile_in.college is not None:
        profile.college = profile_in.college
    if profile_in.branch is not None:
        profile.branch = profile_in.branch
    if profile_in.graduation_year is not None:
        profile.graduation_year = profile_in.graduation_year
    if profile_in.country is not None:
        profile.country = profile_in.country

    # Check completeness
    is_complete = bool(
        profile.degree and
        profile.college and
        profile.branch and
        profile.graduation_year and
        profile.country
    )
    profile.profile_completed = is_complete

    # Update interests if provided
    if profile_in.interests is not None:
        # Clear existing
        db.query(models.EventInterest).filter(models.EventInterest.user_id == current_user.id).delete()
        for cat in profile_in.interests:
            new_interest = models.EventInterest(user_id=current_user.id, category=cat)
            db.add(new_interest)

    db.commit()
    db.refresh(profile)

    # Fetch updated interests
    updated_interests = [i.category for i in db.query(models.EventInterest).filter(models.EventInterest.user_id == current_user.id).all()]

    return schemas.ProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        degree=profile.degree,
        college=profile.college,
        branch=profile.branch,
        graduation_year=profile.graduation_year,
        country=profile.country,
        profile_completed=profile.profile_completed,
        interests=updated_interests
    )
