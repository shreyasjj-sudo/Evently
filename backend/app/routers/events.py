from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/events", tags=["Events"])

# Simulated current datetime baseline (September 19, 2026)
SIMULATED_CURRENT_DT = datetime(2026, 9, 19, 12, 0, 0)


def parse_date_obj(val) -> Optional[date]:
    if not val:
        return None
    if isinstance(val, date):
        return val
    try:
        return datetime.strptime(str(val).strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def calculate_event_status(event: models.Event, registered_count: int, now_dt: datetime = SIMULATED_CURRENT_DT):
    today_date = now_dt.date()
    evt_date = parse_date_obj(event.date) or today_date
    deadline = event.registration_deadline

    is_past = evt_date < today_date
    is_today = evt_date == today_date
    is_deadline_passed = now_dt >= deadline or registered_count >= event.capacity

    if is_past:
        return "COMPLETED", "Event completed", "badge-completed", False
    elif is_today:
        if is_deadline_passed:
            return "REGISTRATION_CLOSED", "Registration deadline over", "badge-deadline-over", False
        else:
            return "IN_PROGRESS", "Event in progress / Today", "badge-today-open", True
    else:
        # Future event
        if is_deadline_passed:
            return "REGISTRATION_CLOSED", "Registration deadline over", "badge-deadline-over", False
        else:
            return "REGISTRATION_OPEN", "Registration open", "badge-open", True


from sqlalchemy import or_, and_, func


def get_event_reg_counts(db: Session, event_ids: Optional[List[str]] = None) -> dict:
    query = db.query(models.Registration.event_id, func.count(models.Registration.id))
    if event_ids is not None:
        if not event_ids:
            return {}
        query = query.filter(models.Registration.event_id.in_(event_ids))
    return dict(query.group_by(models.Registration.event_id).all())


def format_event_out(event: models.Event, db: Session, reg_count: Optional[int] = None) -> schemas.EventOut:
    if reg_count is None:
        reg_count = db.query(models.Registration).filter(models.Registration.event_id == event.id).count()
    status, status_text, badge_cls, can_reg = calculate_event_status(event, reg_count)

    evt_date_obj = parse_date_obj(event.date) or date(2026, 9, 19)

    return schemas.EventOut(
        id=event.id,
        title=event.title,
        description=event.description,
        category=event.category,
        date=evt_date_obj,
        start_time=event.start_time,
        end_time=event.end_time,
        venue=event.venue,
        organizer=event.organizer,
        capacity=event.capacity,
        registered_count=reg_count,
        registration_deadline=event.registration_deadline,
        created_at=event.created_at,
        status=status,
        status_text=status_text,
        status_badge_class=badge_cls,
        can_register=can_reg
    )


@router.get("", response_model=List[schemas.EventOut])
def list_events(
    start_date: Optional[str] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date filter (YYYY-MM-DD)"),
    date: Optional[str] = Query(None, description="Single date filter (YYYY-MM-DD)"),
    category: Optional[str] = Query(None, description="Category filter"),
    search: Optional[str] = Query(None, description="Search text in title or description"),
    db: Session = Depends(get_db)
):
    """
    Returns events matching optional filters (date range, single date, category, search query).
    Used by the main Evently Calendar and event lists.
    """
    query = db.query(models.Event)

    d_single = parse_date_obj(date)
    d_start = parse_date_obj(start_date)
    d_end = parse_date_obj(end_date)

    if d_single:
        query = query.filter(models.Event.date == str(d_single))

    if d_start and d_end:
        query = query.filter(models.Event.date >= str(d_start), models.Event.date <= str(d_end))
    elif d_start:
        query = query.filter(models.Event.date >= str(d_start))
    elif d_end:
        query = query.filter(models.Event.date <= str(d_end))

    if category and category != "All":
        query = query.filter(models.Event.category == category)

    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            or_(
                models.Event.title.ilike(search_fmt),
                models.Event.description.ilike(search_fmt),
                models.Event.organizer.ilike(search_fmt)
            )
        )

    events = query.order_by(models.Event.date.asc(), models.Event.start_time.asc()).all()
    event_ids = [e.id for e in events]
    counts_map = get_event_reg_counts(db, event_ids)
    return [format_event_out(evt, db, counts_map.get(evt.id, 0)) for evt in events]


@router.get("/search", response_model=List[schemas.EventOut])
def search_events(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """
    Search events by keyword query q.
    """
    search_fmt = f"%{q}%"
    events = db.query(models.Event).filter(
        or_(
            models.Event.title.ilike(search_fmt),
            models.Event.description.ilike(search_fmt),
            models.Event.organizer.ilike(search_fmt),
            models.Event.category.ilike(search_fmt)
        )
    ).order_by(models.Event.date.asc()).all()
    event_ids = [e.id for e in events]
    counts_map = get_event_reg_counts(db, event_ids)
    return [format_event_out(evt, db, counts_map.get(evt.id, 0)) for evt in events]


@router.get("/date/{event_date}", response_model=List[schemas.EventOut])
def get_events_by_date(event_date: str, db: Session = Depends(get_db)):
    """
    Shortcut endpoint to fetch all events on a given date.
    """
    d_obj = parse_date_obj(event_date)
    if not d_obj:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    events = db.query(models.Event).filter(models.Event.date == str(d_obj)).order_by(models.Event.start_time.asc()).all()
    event_ids = [e.id for e in events]
    counts_map = get_event_reg_counts(db, event_ids)
    return [format_event_out(evt, db, counts_map.get(evt.id, 0)) for evt in events]


@router.get("/category/{event_category}", response_model=List[schemas.EventOut])
def get_events_by_category(event_category: str, db: Session = Depends(get_db)):
    """
    Shortcut endpoint to fetch all events under a specific category.
    """
    events = db.query(models.Event).filter(models.Event.category.ilike(event_category)).order_by(models.Event.date.asc()).all()
    event_ids = [e.id for e in events]
    counts_map = get_event_reg_counts(db, event_ids)
    return [format_event_out(evt, db, counts_map.get(evt.id, 0)) for evt in events]


@router.get("/{event_id}", response_model=schemas.EventOut)
def get_event_detail(event_id: str, db: Session = Depends(get_db)):
    """
    Returns single event detail by event_id.
    """
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID '{event_id}' not found."
        )
    return format_event_out(event, db)
