"""
Telegram Online Tracker — Event-Driven Status Monitor
======================================================
Listens for a target user's online/offline status changes via the
Telegram MTProto API and records events to Supabase + optional webhook.

Targets are managed dynamically via the `tracked_targets` table in Supabase.
The tracker polls for changes every 60 seconds.

Usage:
    1. Fill in your .env file
    2. Run: python tracker.py
    3. First run: enter phone + OTP when prompted
    4. The .session file is your auth token — keep it safe
"""

import asyncio
import logging
from datetime import datetime, timezone

import aiohttp
from fastapi import FastAPI, HTTPException, Depends, Header, Security
from fastapi.responses import JSONResponse
import uvicorn
from supabase import create_client
from telethon import TelegramClient, events
from telethon.tl.types import (
    UserStatusOnline,
    UserStatusOffline,
    UserStatusRecently,
    UserStatusLastWeek,
    UserStatusLastMonth,
    UserStatusEmpty,
)

import config

# ── Logging ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("tracker")

# ── Supabase Client ─────────────────────────────────────────────
supabase = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)

# ── Telegram Client ─────────────────────────────────────────────
client = TelegramClient("tracker_session", config.API_ID, config.API_HASH)

# ── Cached Targets ────────────────────────────────────────────
# Maps user_id -> display_name
TARGETS: dict[int, str] = {}

# Track which phone numbers we've already resolved
RESOLVED_PHONES: set[str] = set()


async def fetch_targets_from_db() -> list[dict]:
    """Fetch active targets from the tracked_targets table."""
    try:
        result = supabase.table("tracked_targets").select("*").eq("is_active", True).execute()
        return result.data or []
    except Exception as e:
        log.warning("Could not fetch targets from DB: %s", e)
        return []


async def resolve_targets() -> None:
    """Resolve targets from DB table. Falls back to .env if table is empty."""
    global TARGETS

    db_targets = await fetch_targets_from_db()

    # If DB table has targets, use those
    if db_targets:
        phone_numbers = [t["phone_number"] for t in db_targets]
        log.info("Found %d targets in database", len(phone_numbers))
    elif config.TARGET_USERS:
        # Fallback to .env
        phone_numbers = config.TARGET_USERS
        log.info("No DB targets found, using .env: %s", phone_numbers)
    else:
        log.error("No targets configured. Add targets via the dashboard or .env")
        import sys
        sys.exit(1)

    for phone in phone_numbers:
        if phone in RESOLVED_PHONES:
            continue  # Already resolved
        await _resolve_single_target(phone)

    if not TARGETS:
        log.error("No targets could be resolved. Exiting.")
        import sys
        sys.exit(1)


async def _resolve_single_target(phone: str) -> bool:
    """Resolve a single phone number to a Telegram user ID."""
    log.info("Resolving target user: %s", phone)
    try:
        entity = await client.get_entity(phone)
        display_name = getattr(entity, "first_name", phone) or phone
        if getattr(entity, "last_name", None):
            display_name += f" {entity.last_name}"

        TARGETS[entity.id] = display_name
        RESOLVED_PHONES.add(phone)
        log.info("✓ Target resolved: %s (ID: %d)", display_name, entity.id)

        # Update display_name in DB
        try:
            supabase.table("tracked_targets").update(
                {"display_name": display_name}
            ).eq("phone_number", phone).execute()
        except Exception:
            pass  # Non-critical

        return True
    except Exception as e:
        log.error("✗ Failed to resolve target '%s': %s", phone, e)
        return False


async def poll_for_target_changes() -> None:
    """Periodically check the DB for new/removed targets."""
    global RESOLVED_PHONES
    while True:
        await asyncio.sleep(60)  # Poll every 60 seconds
        try:
            db_targets = await fetch_targets_from_db()
            if not db_targets:
                continue

            db_phones = {t["phone_number"] for t in db_targets}

            # Check for NEW targets (in DB but not yet resolved)
            for phone in db_phones:
                if phone not in RESOLVED_PHONES:
                    log.info("🆕 New target detected: %s", phone)
                    await _resolve_single_target(phone)

            # Check for REMOVED targets (resolved but no longer in DB)
            removed_phones = RESOLVED_PHONES - db_phones
            if removed_phones:
                # Find user_ids to remove
                ids_to_remove = []
                for uid, name in list(TARGETS.items()):
                    for phone in removed_phones:
                        # We don't have a direct phone->uid mapping after resolution,
                        # so we just log it. The user won't be tracked anymore on next restart.
                        pass
                RESOLVED_PHONES -= removed_phones
                log.info("🗑️ Targets removed from monitoring: %s", removed_phones)

        except Exception as e:
            log.warning("Target poll error: %s", e)


async def write_to_supabase(payload: dict) -> None:
    """Insert a status event into the Supabase database."""
    try:
        supabase.table("status_events").insert(
            {
                "user_id": payload["user_id"],
                "display_name": payload["display_name"],
                "status": payload["status"],
                "was_last_seen": payload.get("was_last_seen"),
                "created_at": payload["timestamp"],
            },
            returning="minimal",
        ).execute()
        log.info("✓ Supabase insert: %s", payload["status"])
    except Exception as e:
        log.error("✗ Supabase insert failed: %s", e)


async def fire_webhook(payload: dict) -> None:
    """POST the payload to the configured webhook URL (non-blocking)."""
    if not config.WEBHOOK_URL:
        return

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.WEBHOOK_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                log.info("✓ Webhook fired: %d", resp.status)
    except Exception as e:
        log.warning("✗ Webhook failed: %s", e)


async def record_event(
    user_id: int,
    status: str,
    was_last_seen: datetime | None = None,
) -> None:
    """Record a status change to all configured outputs."""
    display_name = TARGETS.get(user_id, str(user_id))
    payload = {
        "user_id": user_id,
        "display_name": display_name,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "was_last_seen": was_last_seen.isoformat() if was_last_seen else None,
    }

    log.info(
        "─── Status Update [%s] ───  %s  │  was_last_seen=%s",
        display_name,
        status,
        payload["was_last_seen"] or "N/A",
    )

    # Fire both outputs concurrently
    await asyncio.gather(
        write_to_supabase(payload),
        fire_webhook(payload),
    )


# ── Event Handler ────────────────────────────────────────────────
@client.on(events.UserUpdate)
async def status_handler(event):
    """Handle UserUpdate events — only process the configured target users."""
    if not TARGETS:
        return

    # Ignore events from other users
    if event.user_id not in TARGETS:
        return

    # Only process actual status changes
    if not event.status:
        return

    if isinstance(event.status, UserStatusOnline):
        await record_event(event.user_id, "Online")
        await update_last_status(event.user_id, "Online")

    elif isinstance(event.status, UserStatusOffline):
        await record_event(
            event.user_id,
            "Offline",
            was_last_seen=getattr(event.status, "was_online", None),
        )
        await update_last_status(event.user_id, "Offline")

    elif isinstance(event.status, UserStatusRecently):
        await record_event(event.user_id, "Recently")
        await update_last_status(event.user_id, "Offline")

    elif isinstance(event.status, UserStatusLastWeek):
        await record_event(event.user_id, "Last Week")
        await update_last_status(event.user_id, "Offline")

    elif isinstance(event.status, UserStatusLastMonth):
        await record_event(event.user_id, "Last Month")
        await update_last_status(event.user_id, "Offline")

    elif isinstance(event.status, UserStatusEmpty):
        await record_event(event.user_id, "Hidden")
        await update_last_status(event.user_id, "Offline")


import os
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Ensure downloads directory exists
os.makedirs("downloads", exist_ok=True)

# ── API Server ───────────────────────────────────────────────────
app = FastAPI(title="Telegram Scraper API")

# Allow dashboard to call API from browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/api/v1/media", StaticFiles(directory="downloads"), name="media")

async def verify_api_key(x_api_key: str = Header(None)):
    if not x_api_key or x_api_key != config.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    return x_api_key

@app.get("/api/v1/messages", dependencies=[Depends(verify_api_key)])
async def get_messages(target: str, limit: int = 50, search: str = None, download_media: bool = False):
    try:
        messages = []
        async for msg in client.iter_messages(target, limit=limit, search=search):
            media_url = None
            if msg.media:
                media_url = "has_media" # default if not downloading
                if download_media:
                    # Download media to the downloads folder
                    file_path = await client.download_media(msg, file="downloads/")
                    if file_path:
                        # Convert local path to API URL
                        filename = os.path.basename(file_path)
                        media_url = f"/api/v1/media/{filename}"
                    else:
                        # Failed to download (e.g. WebPage preview), don't return 'has_media'
                        media_url = None

            messages.append({
                "id": msg.id,
                "text": msg.message or "",
                "date": msg.date.isoformat() if msg.date else None,
                "sender_id": msg.sender_id,
                "views": getattr(msg, "views", None),
                "media": media_url
            })
        return {"target": target, "count": len(messages), "messages": messages}
    except Exception as e:
        log.error("API error fetching messages for %s: %s", target, e)
        raise HTTPException(status_code=400, detail=str(e))


# ── Staleness Watchdog ───────────────────────────────────────────
# Track last known status per user to detect missed offline events
LAST_STATUS: dict[int, tuple[str, datetime]] = {}  # user_id -> (status, timestamp)

STALENESS_CHECK_INTERVAL = 300  # 5 minutes
STALENESS_THRESHOLD = 600       # 10 minutes — if online for longer, verify


async def update_last_status(user_id: int, status: str) -> None:
    """Track the last known status and when it was set."""
    LAST_STATUS[user_id] = (status, datetime.now(timezone.utc))


async def verify_all_statuses(threshold_seconds: int = 0) -> dict:
    """
    Check all tracked users' real status via Telegram API.
    If threshold_seconds > 0, only checks users who have been Online longer than that.
    If threshold_seconds == 0, checks ALL users unconditionally.
    Returns a summary dict.
    """
    now = datetime.now(timezone.utc)
    results = {"checked": 0, "corrected": 0, "still_online": 0, "details": []}

    for user_id, display_name in list(TARGETS.items()):
        # If threshold is set, only check users marked Online for too long
        if threshold_seconds > 0:
            status_entry = LAST_STATUS.get(user_id)
            if not status_entry or status_entry[0] != "Online":
                continue
            age = (now - status_entry[1]).total_seconds()
            if age < threshold_seconds:
                continue

        results["checked"] += 1
        try:
            entity = await client.get_entity(user_id)
            real_status = getattr(entity, "status", None)

            if isinstance(real_status, UserStatusOnline):
                LAST_STATUS[user_id] = ("Online", now)
                results["still_online"] += 1
                results["details"].append({"user": display_name, "result": "Online (confirmed)"})
                log.info("  ✓ [%s] confirmed Online", display_name)
            elif isinstance(real_status, UserStatusOffline):
                was_online = getattr(real_status, "was_online", None)
                # Only insert Offline if last known status was Online
                last = LAST_STATUS.get(user_id)
                if not last or last[0] == "Online":
                    await record_event(user_id, "Offline", was_last_seen=was_online)
                    results["corrected"] += 1
                    results["details"].append({"user": display_name, "result": "Corrected → Offline"})
                    log.warning("  ⚠ [%s] was phantom Online → corrected to Offline", display_name)
                else:
                    results["details"].append({"user": display_name, "result": "Offline (already known)"})
                LAST_STATUS[user_id] = ("Offline", now)
            else:
                status_name = type(real_status).__name__ if real_status else "Unknown"
                last = LAST_STATUS.get(user_id)
                if not last or last[0] == "Online":
                    await record_event(user_id, "Offline")
                    results["corrected"] += 1
                    results["details"].append({"user": display_name, "result": f"Corrected → {status_name}"})
                else:
                    results["details"].append({"user": display_name, "result": status_name})
                LAST_STATUS[user_id] = ("Offline", now)

        except Exception as e:
            log.warning("  ✗ Check failed for [%s]: %s", display_name, e)
            results["details"].append({"user": display_name, "result": f"Error: {e}"})

    return results


async def staleness_watchdog() -> None:
    """Periodically run staleness checks."""
    while True:
        await asyncio.sleep(STALENESS_CHECK_INTERVAL)
        log.info("🔍 Running staleness check...")
        results = await verify_all_statuses(threshold_seconds=STALENESS_THRESHOLD)
        if results["corrected"] > 0:
            log.warning("Staleness check: corrected %d phantom online user(s)", results["corrected"])


# API endpoint for manual status verification from dashboard
@app.post("/api/v1/verify-status", dependencies=[Depends(verify_api_key)])
async def api_verify_status():
    """Force-check all users' real status via Telegram."""
    log.info("🔍 Manual status verification triggered via API")
    results = await verify_all_statuses(threshold_seconds=0)
    return results


# ── Main ─────────────────────────────────────────────────────────
async def main():
    log.info("═══════════════════════════════════════════")
    log.info("   Telegram Online Tracker — Starting...   ")
    log.info("═══════════════════════════════════════════")
    log.info("Supabase:  %s", config.SUPABASE_URL)
    log.info("Webhook:   %s", config.WEBHOOK_URL or "Disabled")

    await resolve_targets()

    # Run initial status verification for all targets
    log.info("🔍 Running initial status verification...")
    results = await verify_all_statuses(threshold_seconds=0)
    log.info("   Initial check: %d checked, %d corrected", results["checked"], results["corrected"])

    log.info("═══════════════════════════════════════════")
    log.info("   Listening for status updates...         ")
    log.info("   Polling for target changes every 60s    ")
    log.info("   Staleness watchdog every %ds            ", STALENESS_CHECK_INTERVAL)
    log.info("═══════════════════════════════════════════")

    # Start background tasks
    asyncio.create_task(poll_for_target_changes())
    asyncio.create_task(staleness_watchdog())

    log.info("   Starting API Server on port 8000...     ")
    server_config = uvicorn.Config(app, host="0.0.0.0", port=8000, loop="asyncio")
    server = uvicorn.Server(server_config)
    await server.serve()


with client:
    client.loop.run_until_complete(main())

