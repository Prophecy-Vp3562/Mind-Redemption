from pathlib import Path
import json
import tempfile
import os
import shutil
import secrets
import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Canonical Storage Directory Contract
STORAGE_DIR = Path.home() / "Documents" / "Mind Redemption Data"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Decoy Partition (Public)
DATA_FILE = STORAGE_DIR / "mind-redemption-data.json"
DECOY_DATA_FILE = DATA_FILE
TIMELINE_DIR = STORAGE_DIR / "timeline"
TIMELINE_DIR.mkdir(parents=True, exist_ok=True)
DECOY_TIMELINE_DIR = TIMELINE_DIR
DECOY_HISTORY_DIR = STORAGE_DIR / "history"
DECOY_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

# Admin Vault Partition (Strictly Isolated on Disk)
ADMIN_DATA_FILE = STORAGE_DIR / "mind-redemption-admin-data.json"
ADMIN_TIMELINE_DIR = STORAGE_DIR / "timeline-admin"
ADMIN_TIMELINE_DIR.mkdir(parents=True, exist_ok=True)
ADMIN_HISTORY_DIR = STORAGE_DIR / "history-admin"
ADMIN_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

# Administrative Security Credentials & In-Memory Active Session Registry
ADMIN_VAULT_PASSWORD = os.environ.get("ADMIN_VAULT_PASSWORD", "relife")
ACTIVE_ADMIN_SESSIONS: set = set()

# Seamless Legacy Data Migration (Thought Redemption -> Mind Redemption)
def migrate_legacy_data():
    legacy_dir = Path.home() / "Documents" / "Thought Redemption Data"
    if not DECOY_DATA_FILE.exists():
        legacy_file = legacy_dir / "thought-redemption-data.json" if legacy_dir.exists() else None
        local_legacy_file = STORAGE_DIR / "thought-redemption-data.json"
        source_file = legacy_file if (legacy_file and legacy_file.exists()) else (local_legacy_file if local_legacy_file.exists() else None)
        if source_file:
            try:
                shutil.copy2(source_file, DECOY_DATA_FILE)
            except Exception as e:
                print(f"Legacy data file copy notice: {e}")

    if legacy_dir.exists():
        legacy_timeline = legacy_dir / "timeline"
        if legacy_timeline.exists() and not any(DECOY_TIMELINE_DIR.iterdir()):
            try:
                for item in legacy_timeline.iterdir():
                    dest = DECOY_TIMELINE_DIR / item.name
                    if item.is_dir() and not dest.exists():
                        shutil.copytree(item, dest)
                    elif item.is_file() and not dest.exists():
                        shutil.copy2(item, dest)
            except Exception as e:
                print(f"Legacy timeline folder copy notice: {e}")

migrate_legacy_data()

DEFAULT_SCHEMA: Dict[str, Any] = {
    "version": "1.0.0",
    "activeWorkspace": {"currentTab": "mindflow", "activeBookId": None, "activePageId": None},
    "mindFlow": {
        "books": [
            {
                "id": "starter-book-1",
                "title": "Metacognitive Thinking: Welcome & Guide",
                "createdAt": "2026-09-20T00:00:00.000Z",
                "updatedAt": "2026-09-20T00:00:00.000Z",
                "pages": [
                    {
                        "id": "page-1",
                        "sideBlockCount": 4,
                        "blocks": {
                            "main": {
                                "id": "main",
                                "title": "Core Thesis & Central Thought",
                                "content": "Welcome to Mind Flow.\n\nThe central block is your Main Branch ¹. This is where your primary argument, stream-of-consciousness, or core problem statement develops continuously.\n\nNotice the footnote marker ¹ right above? You can insert footnote markers using the \"+ Marker\" button in the toolbar. The surrounding side blocks can reference these markers (like \"re: ¹\") to create parallel metacognitive tracks without fragmenting your central flow ².\n\nDouble-click any block to enter Fullscreen Deep Focus mode. Double-click again or press Esc to return to this overview.",
                                "markers": ["¹", "²"]
                            },
                            "side1": {
                                "id": "side1",
                                "title": "Assumptions & Biases (Top)",
                                "content": "Side Block 1 (Top):\nWhat implicit assumptions am I making in the main thesis? Am I anchoring to early conclusions?",
                                "reference": "¹"
                            },
                            "side2": {
                                "id": "side2",
                                "title": "Counter-Arguments (Right)",
                                "content": "Side Block 2 (Right):\nWhat would someone who completely disagrees with my thesis say? How might this fail?",
                                "reference": "²"
                            },
                            "side3": {
                                "id": "side3",
                                "title": "Emotional Context (Bottom)",
                                "content": "Side Block 3 (Bottom):\nHow do I feel while writing this? Is there anxiety, impatience, or cognitive dissonance?",
                                "reference": ""
                            },
                            "side4": {
                                "id": "side4",
                                "title": "Alternative Hypotheses (Left)",
                                "content": "Side Block 4 (Left):\nWhat is the simplest explanation I have not considered yet?",
                                "reference": ""
                            }
                        }
                    }
                ]
            }
        ]
    },
    "notes": {
        "items": [
            {
                "id": "starter-note-1",
                "title": "Welcome to Notes",
                "content": "This is the Notes tab — a traditional single-flow note-taking space inspired by Google Keep.\n\nEach note here is a single continuous writing space. It is completely isolated from your Mind Flow workspace.\n\nPin notes, color-code them, search instantly, and let your thoughts autosave straight to your local companion server.",
                "color": "var(--card-bg)",
                "pinned": True,
                "createdAt": "2026-09-20T00:00:00.000Z",
                "updatedAt": "2026-09-20T00:00:00.000Z"
            }
        ]
    },
    "diary": {"entries": {}},
    "trash": []
}

ADMIN_DEFAULT_SCHEMA: Dict[str, Any] = {
    "version": "1.0.0",
    "activeWorkspace": {"currentTab": "mindflow", "activeBookId": None, "activePageId": None},
    "mindFlow": {
        "books": [
            {
                "id": "admin-book-1",
                "title": "Confidential Intelligence & Strategic Analysis",
                "createdAt": "2026-09-22T00:00:00.000Z",
                "updatedAt": "2026-09-22T00:00:00.000Z",
                "pages": [
                    {
                        "id": "admin-page-1",
                        "sideBlockCount": 4,
                        "blocks": {
                            "main": {
                                "id": "main",
                                "title": "Operational Thesis & Classified Directive",
                                "content": "Administrative Vault Mounted Successfully.\n\nThis partition is strictly isolated on disk from public decoy storage. All changes made in this session are written directly to mind-redemption-admin-data.json and timeline-admin/.\n\nExiting this session immediately reverts to the public decoy profile without leaving memory traces.",
                                "markers": ["¹"]
                            },
                            "side1": {
                                "id": "side1",
                                "title": "Risk Assessment (Top)",
                                "content": "Side Block 1 (Top):\nIdentify exposure vectors and protocol safeguards.",
                                "reference": "¹"
                            },
                            "side2": {
                                "id": "side2",
                                "title": "Contingencies (Right)",
                                "content": "Side Block 2 (Right):\nDuress trap rules and decoy corruption feedback.",
                                "reference": ""
                            },
                            "side3": {
                                "id": "side3",
                                "title": "Audit Logs (Bottom)",
                                "content": "Side Block 3 (Bottom):\nSecure activity telemetry is dispatched to timeline-admin/.",
                                "reference": ""
                            },
                            "side4": {
                                "id": "side4",
                                "title": "Safeguards (Left)",
                                "content": "Side Block 4 (Left):\nVolatile session keys purged upon trigger or exit.",
                                "reference": ""
                            }
                        }
                    }
                ]
            }
        ]
    },
    "notes": {
        "items": [
            {
                "id": "admin-note-1",
                "title": "Admin Classified Notes",
                "content": "This note exists solely within the isolated admin vault partition.\nUnauthorized users entering the public app will never see this record.",
                "color": "var(--card-bg)",
                "pinned": True,
                "createdAt": "2026-09-22T00:00:00.000Z",
                "updatedAt": "2026-09-22T00:00:00.000Z"
            }
        ]
    },
    "diary": {"entries": {}},
    "trash": []
}

app = FastAPI(title="Mind Redemption Local Companion Server")

# CORS Middleware for local web frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://localhost:8085",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8085",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def purge_old_history_files():
    """
    48-Hour Rolling Purge:
    Parses file names {DD}-{MM}-{YYYY}.json via datetime.strptime(filename.stem, "%d-%m-%Y").
    Compares against datetime.now() - timedelta(hours=48).
    Deletes any daily JSON files older than 48 hours. Never touches active workspace files.
    """
    cutoff = datetime.now() - timedelta(hours=48)
    for h_dir in [DECOY_HISTORY_DIR, ADMIN_HISTORY_DIR]:
        if not h_dir.exists():
            continue
        for file_path in h_dir.glob("*.json"):
            # Never touch active workspace files
            if file_path.name in ["mind-redemption-data.json", "mind-redemption-admin-data.json"]:
                continue
            try:
                file_date = datetime.strptime(file_path.stem, "%d-%m-%Y")
                if file_date < cutoff:
                    try:
                        file_path.unlink()
                        print(f"Purged expired 48h history file: {file_path.name}")
                    except Exception as ue:
                        print(f"Failed to delete {file_path}: {ue}")
            except ValueError:
                # Filename does not match %d-%m-%Y, ignore
                continue
            except Exception as e:
                print(f"Error purging history file {file_path}: {e}")

# Run initial maintenance sweep on server startup
purge_old_history_files()


async def scheduled_history_purge():
    """
    Background maintenance task running every 6 hours.
    """
    while True:
        try:
            await asyncio.sleep(6 * 3600)
            purge_old_history_files()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Periodic history purge error: {e}")


@app.on_event("startup")
async def on_startup():
    purge_old_history_files()
    asyncio.create_task(scheduled_history_purge())


def atomic_write(target_path: Path, data: Any):
    """
    Performs an atomic write to prevent corruption:
    Writes JSON to a temporary file in the same directory, then atomically replaces target.
    """
    temp_file = None
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target_path.parent,
            delete=False,
            suffix=".tmp",
        ) as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            temp_file = Path(f.name)

        # Atomic replacement on POSIX and Windows (Python 3.3+)
        os.replace(temp_file, target_path)
    except Exception:
        if temp_file and temp_file.exists():
            try:
                temp_file.unlink()
            except OSError:
                pass
        raise


def resolve_vault(request: Request) -> Tuple[bool, Path, Path]:
    """
    Inspects X-Vault-Profile header and Authorization bearer token.
    Returns (is_admin, data_file, timeline_dir).
    """
    profile = request.headers.get("X-Vault-Profile", "default").strip().lower()
    auth_header = request.headers.get("Authorization", "").strip()
    token = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
    elif request.headers.get("X-Admin-Token"):
        token = request.headers.get("X-Admin-Token").strip()

    is_admin = (profile == "admin" and bool(token) and (token in ACTIVE_ADMIN_SESSIONS))
    data_file = ADMIN_DATA_FILE if is_admin else DECOY_DATA_FILE
    timeline_dir = ADMIN_TIMELINE_DIR if is_admin else DECOY_TIMELINE_DIR
    return is_admin, data_file, timeline_dir


def get_day_file_path(date_str: str, timeline_dir: Path) -> Path:
    """
    Parses "YYYY-MM-DD" into Year, Month, Day, creates parent folders if missing,
    and returns Path to timeline/{YYYY}/{MM}/{DD}.json within given timeline directory.
    """
    cleaned = date_str.strip().split("T")[0]
    parts = cleaned.split("-")
    if len(parts) != 3:
        raise ValueError(f"Invalid date format: '{date_str}'. Expected YYYY-MM-DD.")

    year = f"{int(parts[0]):04d}"
    month = f"{int(parts[1]):02d}"
    day = f"{int(parts[2]):02d}"

    target_dir = timeline_dir / year / month
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / f"{day}.json"


def get_default_day_schema(date_str: str) -> Dict[str, Any]:
    """
    Default schema for an individual day timeline document.
    """
    cleaned = date_str.strip().split("T")[0]
    return {
        "date": cleaned,
        "totalDurationSeconds": 0,
        "sessions": [],
        "events": []
    }


def load_day_file(date_str: str, timeline_dir: Path) -> Dict[str, Any]:
    """
    Reads an individual day file or returns default schema.
    """
    cleaned = date_str.strip().split("T")[0]
    try:
        file_path = get_day_file_path(cleaned, timeline_dir)
        if not file_path.exists():
            return get_default_day_schema(cleaned)
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("date", cleaned)
        data.setdefault("totalDurationSeconds", 0)
        data.setdefault("sessions", [])
        data.setdefault("events", [])
        return data
    except Exception:
        return get_default_day_schema(cleaned)


def migrate_legacy_timeline():
    """
    Migrates legacy flat timeline file into the hierarchical timeline/{YYYY}/{MM}/{DD}.json structure if present.
    """
    legacy_files = [
        STORAGE_DIR / "mind-redemption-timeline.json",
        Path.home() / "Documents" / "Thought Redemption Data" / "thought-redemption-timeline.json",
    ]
    for leg_file in legacy_files:
        if leg_file.exists():
            try:
                with open(leg_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                by_date = data.get("byDate", {})
                for date_str, day_content in by_date.items():
                    try:
                        file_path = get_day_file_path(date_str, DECOY_TIMELINE_DIR)
                        if not file_path.exists():
                            day_data = get_default_day_schema(date_str)
                            day_data["totalDurationSeconds"] = int(day_content.get("totalDurationSeconds", 0))
                            day_data["sessions"] = day_content.get("sessions", [])
                            day_data["events"] = day_content.get("events", [])
                            atomic_write(file_path, day_data)
                    except Exception as me:
                        print(f"Migration error for {date_str}: {me}")
            except Exception as e:
                print(f"Legacy timeline migration error for {leg_file}: {e}")

migrate_legacy_timeline()


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "mind-redemption"}


# ==========================================================
# Administrative Vault Authentication & Session Endpoints
# ==========================================================

@app.post("/api/admin/verify")
async def verify_admin(payload: Dict[str, Any] = Body(...)):
    """
    Validates provided password against administrator secret key.
    On success, generates a cryptographically random session bearer token.
    """
    password = str(payload.get("password", ""))
    if password == ADMIN_VAULT_PASSWORD:
        token = secrets.token_hex(32)
        ACTIVE_ADMIN_SESSIONS.add(token)
        return {"success": True, "token": token}
    raise HTTPException(status_code=401, detail="Invalid administrative password")


@app.post("/api/admin/logout")
async def logout_admin(request: Request):
    """
    Revokes the provided admin session bearer token from memory.
    """
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
    elif request.headers.get("X-Admin-Token"):
        token = request.headers.get("X-Admin-Token").strip()

    if token and token in ACTIVE_ADMIN_SESSIONS:
        ACTIVE_ADMIN_SESSIONS.remove(token)
    return {"success": True, "message": "Admin session revoked"}


# ==========================================================
# Data Partition Persistence Endpoints (/api/load, /api/save, /api/data)
# ==========================================================

@app.get("/api/load")
@app.get("/api/data")
async def load_data(request: Request):
    """
    Loads workspace data from either the isolated Admin vault or public Decoy profile.
    """
    is_admin, data_file, _ = resolve_vault(request)
    try:
        if not data_file.exists():
            schema = ADMIN_DEFAULT_SCHEMA if is_admin else DEFAULT_SCHEMA
            atomic_write(data_file, schema)
            return schema

        with open(data_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            data.setdefault("trash", [])
            return data
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read data file: {str(e)}"
        )


@app.post("/api/save")
@app.post("/api/data")
async def save_data(request: Request, payload: Dict[str, Any] = Body(...)):
    """
    Saves workspace data to either the isolated Admin vault or public Decoy profile.
    """
    is_admin, data_file, _ = resolve_vault(request)
    try:
        atomic_write(data_file, payload)
        return {
            "status": "success",
            "message": "Data saved successfully",
            "vault": "admin" if is_admin else "default"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save data file: {str(e)}"
        )


# ==========================================================
# Hierarchical Timeline Endpoints (Year/Month/Day Structure)
# ==========================================================

@app.get("/api/timeline/day/{date_str}")
async def get_timeline_day(date_str: str, request: Request):
    """
    Directly reads and returns the contents of timeline/{YYYY}/{MM}/{DD}.json
    from the active vault profile.
    """
    _, _, timeline_dir = resolve_vault(request)
    try:
        return load_day_file(date_str, timeline_dir)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read day timeline for {date_str}: {str(e)}"
        )


@app.get("/api/timeline/month/{year}/{month}")
async def get_timeline_month(year: str, month: str, request: Request):
    """
    Scans timeline/{year}/{month}/*.json in the active vault profile
    and returns a summary map of all recorded days in that month.
    """
    _, _, timeline_dir = resolve_vault(request)
    try:
        year_str = f"{int(year):04d}"
        month_str = f"{int(month):02d}"
        month_dir = timeline_dir / year_str / month_str

        if not month_dir.exists():
            return {}

        summary: Dict[str, Any] = {}
        for json_file in sorted(month_dir.glob("*.json")):
            try:
                day_num = f"{int(json_file.stem):02d}"
                date_key = f"{year_str}-{month_str}-{day_num}"
                with open(json_file, "r", encoding="utf-8") as f:
                    day_data = json.load(f)

                sessions = day_data.get("sessions", [])
                events = day_data.get("events", [])
                duration = int(day_data.get("totalDurationSeconds", 0))

                modules_set = set()
                for s in sessions:
                    if s.get("module"):
                        modules_set.add(s["module"])
                for e in events:
                    if e.get("module"):
                        modules_set.add(e["module"])

                summary[date_key] = {
                    "date": date_key,
                    "totalDuration": duration,
                    "totalDurationSeconds": duration,
                    "eventCount": len(events),
                    "sessionCount": len(sessions),
                    "modules": sorted(list(modules_set))
                }
            except Exception as fe:
                print(f"Error reading timeline file {json_file}: {fe}")
                continue

        return summary
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read month timeline: {str(e)}"
        )


@app.post("/api/timeline/event")
async def record_timeline_event(request: Request, payload: Dict[str, Any] = Body(...)):
    """
    Appends session/event telemetry to the active vault partition's timeline.
    """
    _, _, timeline_dir = resolve_vault(request)
    try:
        events: List[Dict[str, Any]] = []
        sessions: List[Dict[str, Any]] = []

        if "events" in payload and isinstance(payload["events"], list):
            events.extend(payload["events"])
        elif "event" in payload and isinstance(payload["event"], dict):
            events.append(payload["event"])

        if "sessions" in payload and isinstance(payload["sessions"], list):
            sessions.extend(payload["sessions"])
        elif "session" in payload and isinstance(payload["session"], dict):
            sessions.append(payload["session"])

        # Fallback if payload itself is a single event or session object
        if not events and not sessions:
            if "durationSeconds" in payload or "startTime" in payload:
                sessions.append(payload)
            elif "action" in payload or "module" in payload or "id" in payload:
                events.append(payload)

        # Determine target date (YYYY-MM-DD)
        target_date = payload.get("date")
        if not target_date:
            if events and events[0].get("timestamp"):
                target_date = str(events[0]["timestamp"]).split("T")[0]
            elif sessions and sessions[0].get("startTime"):
                target_date = str(sessions[0]["startTime"]).split("T")[0]
            else:
                target_date = datetime.now().strftime("%Y-%m-%d")

        target_date = target_date.strip().split("T")[0]
        day_data = load_day_file(target_date, timeline_dir)

        # Ensure unique IDs for new items
        now_ms = int(datetime.now().timestamp() * 1000)
        for idx, s in enumerate(sessions):
            if not s.get("id"):
                s["id"] = f"ses_{now_ms}_{idx}"
            day_data["sessions"].append(s)

        for idx, e in enumerate(events):
            if not e.get("id"):
                e["id"] = f"evt_{now_ms}_{idx}"
            day_data["events"].append(e)

        # Recalculate total duration in seconds for this day
        day_data["totalDurationSeconds"] = sum(
            int(s.get("durationSeconds", 0)) for s in day_data.get("sessions", [])
        )

        file_path = get_day_file_path(target_date, timeline_dir)
        atomic_write(file_path, day_data)

        return {
            "status": "success",
            "message": "Timeline telemetry recorded successfully",
            "date": target_date,
            "totalDurationSeconds": day_data["totalDurationSeconds"],
            "recordedEvents": len(events),
            "recordedSessions": len(sessions)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to record timeline event: {str(e)}"
        )


# Backward-compatible alias for day lookup
@app.get("/api/timeline/{date_str}")
async def get_timeline_by_date_alias(date_str: str, request: Request):
    return await get_timeline_day(date_str, request)


# ==========================================================
# Day-Partitioned Event History Endpoints (/api/history/append, /api/history/recent)
# ==========================================================

@app.post("/api/history/append")
async def append_history_event(request: Request, payload: Dict[str, Any] = Body(...)):
    """
    Appends an atomic action to today's history log. Validates payload, injects
    server timestamp if absent, and routes to history-admin/ if authenticated
    with X-Vault-Profile: admin and valid session token, otherwise history/.
    """
    is_admin, _, _ = resolve_vault(request)
    history_dir = ADMIN_HISTORY_DIR if is_admin else DECOY_HISTORY_DIR
    history_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    today_filename = f"{now.strftime('%d-%m-%Y')}.json"
    target_path = history_dir / today_filename

    event = dict(payload)
    now_ms = int(now.timestamp() * 1000)

    if not event.get("timestamp"):
        event["timestamp"] = now_ms
    if not event.get("formattedDate"):
        event["formattedDate"] = now.strftime("%d:%m:%Y")
    if not event.get("formattedTime"):
        event["formattedTime"] = now.strftime("%H:%M:%S")
    if not event.get("id"):
        event["id"] = f"evt_{now_ms}_{secrets.token_hex(4)}"

    # Load today's existing events array
    current_events: List[Dict[str, Any]] = []
    if target_path.exists():
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    current_events = loaded
        except Exception as e:
            print(f"Notice reading existing history log {target_path}: {e}")
            current_events = []

    current_events.append(event)
    atomic_write(target_path, current_events)

    return {
        "status": "success",
        "event": event,
        "vault": "admin" if is_admin else "default"
    }


@app.get("/api/history/recent")
async def get_recent_history(request: Request):
    """
    Returns all history events from today and yesterday (the active 48-hour window)
    combined in chronological order.
    """
    is_admin, _, _ = resolve_vault(request)
    history_dir = ADMIN_HISTORY_DIR if is_admin else DECOY_HISTORY_DIR
    history_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    yesterday = now - timedelta(days=1)

    today_filename = f"{now.strftime('%d-%m-%Y')}.json"
    yesterday_filename = f"{yesterday.strftime('%d-%m-%Y')}.json"

    events: List[Dict[str, Any]] = []

    # Read yesterday's partition if exists
    yesterday_path = history_dir / yesterday_filename
    if yesterday_path.exists():
        try:
            with open(yesterday_path, "r", encoding="utf-8") as f:
                y_events = json.load(f)
                if isinstance(y_events, list):
                    events.extend(y_events)
        except Exception as e:
            print(f"Error reading yesterday history log {yesterday_path}: {e}")

    # Read today's partition if exists
    today_path = history_dir / today_filename
    if today_path.exists():
        try:
            with open(today_path, "r", encoding="utf-8") as f:
                t_events = json.load(f)
                if isinstance(t_events, list):
                    events.extend(t_events)
        except Exception as e:
            print(f"Error reading today history log {today_path}: {e}")

    # Sort combined events chronologically by timestamp
    events.sort(key=lambda x: x.get("timestamp", 0))
    return events


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
