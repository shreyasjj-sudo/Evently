from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db
from app.routers.events import calculate_event_status, format_event_out

router = APIRouter(tags=["Registrations"])


@router.post("/registrations", response_model=schemas.RegistrationOut, status_code=status.HTTP_201_CREATED)
def create_registration(
    reg_in: schemas.RegistrationCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Registers the authenticated user for an event after performing safety validations:
    1. Authenticated user
    2. Event existence
    3. Registration deadline check
    4. Capacity check
    5. Completed event check
    6. Duplicate registration check
    """
    event = db.query(models.Event).filter(models.Event.id == reg_in.event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{reg_in.event_id}' does not exist."
        )

    # Count existing registrations
    registered_count = db.query(models.Registration).filter(models.Registration.event_id == event.id).count()

    # Calculate status
    status_code, status_text, _, can_register = calculate_event_status(event, registered_count)

    if not can_register or status_code in ["COMPLETED", "REGISTRATION_CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot register for this event. Status: {status_text}."
        )

    # Capacity check
    if registered_count >= event.capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Event has reached maximum capacity."
        )

    # Duplicate registration check
    existing_reg = db.query(models.Registration).filter(
        models.Registration.user_id == current_user.id,
        models.Registration.event_id == event.id
    ).first()

    if existing_reg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already registered for this event."
        )

    # Create new registration
    new_reg = models.Registration(
        user_id=current_user.id,
        event_id=event.id
    )
    db.add(new_reg)
    db.commit()
    db.refresh(new_reg)

    event_out = format_event_out(event, db)

    return schemas.RegistrationOut(
        id=new_reg.id,
        user_id=new_reg.user_id,
        event_id=new_reg.event_id,
        registered_at=new_reg.registered_at,
        event=event_out
    )


@router.get("/registrations/me", response_model=List[schemas.RegistrationOut])
def get_my_registrations(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all event registrations for the currently authenticated user.
    """
    user_regs = db.query(models.Registration).filter(models.Registration.user_id == current_user.id).all()
    results = []
    for reg in user_regs:
        event_out = format_event_out(reg.event, db) if reg.event else None
        results.append(
            schemas.RegistrationOut(
                id=reg.id,
                user_id=reg.user_id,
                event_id=reg.event_id,
                registered_at=reg.registered_at,
                event=event_out
            )
        )
    return results


@router.get("/events/{event_id}/registrations")
def get_event_registrations(event_id: str, db: Session = Depends(get_db)):
    """
    Returns registered count and public student list for a specific event.
    """
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found."
        )

    regs = db.query(models.Registration).filter(models.Registration.event_id == event_id).all()
    registrants = [
        {
            "registration_id": r.id,
            "username": r.user.username,
            "registered_at": r.registered_at
        }
        for r in regs if r.user
    ]

    return {
        "event_id": event_id,
        "total_registered": len(registrants),
        "capacity": event.capacity,
        "registrants": registrants
    }


@router.delete("/registrations/{event_id}", status_code=status.HTTP_200_OK)
def cancel_registration(
    event_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cancels an existing registration for the authenticated user.
    """
    reg = db.query(models.Registration).filter(
        models.Registration.user_id == current_user.id,
        models.Registration.event_id == event_id
    ).first()

    if not reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found for this user and event."
        )

    db.delete(reg)
    db.commit()

    return {"message": "Registration successfully cancelled."}
