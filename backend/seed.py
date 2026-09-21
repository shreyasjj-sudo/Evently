import sys
import os
import json
import re
from datetime import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app import models

# Ensure tables exist
Base.metadata.create_all(bind=engine)


def seed_events():
    db = SessionLocal()
    try:
        events_js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "eventsData.js")
        if not os.path.exists(events_js_path):
            print(f"Warning: {events_js_path} not found.")
            return

        with open(events_js_path, "r", encoding="utf-8") as f:
            content = f.read()

        match = re.search(r'const CAMPUS_EVENTS_DATASET = (\[[\s\S]*?\]);', content)
        if not match:
            print("Could not find CAMPUS_EVENTS_DATASET in eventsData.js")
            return

        raw_json = match.group(1)
        dataset = json.loads(raw_json)

        print(f"Seeding {len(dataset)} events into database...")

        existing_ids = {e.id for e in db.query(models.Event.id).all()}

        new_events = []
        for item in dataset:
            evt_id = item["id"]
            if evt_id in existing_ids:
                continue

            date_obj = datetime.strptime(item["dateStr"], "%Y-%m-%d").date()
            deadline_dt = datetime.strptime(item["registrationDeadline"], "%Y-%m-%dT%H:%M:%S")

            evt = models.Event(
                id=evt_id,
                title=item["title"],
                description=item.get("description", ""),
                category=item["category"],
                date=date_obj,
                start_time=item["time"].split(" - ")[0] if " - " in item["time"] else item["time"],
                end_time=item["time"].split(" - ")[1] if " - " in item["time"] else item["time"],
                venue=item["venue"],
                organizer=item["organizer"],
                capacity=item.get("capacity", 500),
                registration_deadline=deadline_dt
            )
            new_events.append(evt)

        if new_events:
            db.bulk_save_objects(new_events)
            db.commit()
            print(f"Successfully seeded {len(new_events)} new events!")
        else:
            print("Database already up to date with events.")

        # Ensure default demo user student@college.edu exists
        demo_user = db.query(models.User).filter(models.User.email == "student@college.edu").first()
        if not demo_user:
            from app import auth
            hashed_pwd = auth.get_password_hash("pass1234")
            demo_user = models.User(
                username="student",
                email="student@college.edu",
                password_hash=hashed_pwd
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)

            demo_profile = models.Profile(
                user_id=demo_user.id,
                college="National Institute of Technology",
                branch="Computer Science",
                degree="B.Tech",
                graduation_year=2027,
                country="India",
                profile_completed=True
            )
            db.add(demo_profile)
            db.commit()
            print("Successfully seeded demo user: student@college.edu (password: pass1234)")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_events()

