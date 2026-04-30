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
from supabase import create_client
from telethon import TelegramClient, events
from telethon.tl.types import UserStatusOnline, UserStatusOffline

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

    elif isinstance(event.status, UserStatusOffline):
        await record_event(
            event.user_id,
            "Offline",
            was_last_seen=getattr(event.status, "was_online", None),
        )


# ── Main ─────────────────────────────────────────────────────────
async def main():
    log.info("═══════════════════════════════════════════")
    log.info("   Telegram Online Tracker — Starting...   ")
    log.info("═══════════════════════════════════════════")
    log.info("Supabase:  %s", config.SUPABASE_URL)
    log.info("Webhook:   %s", config.WEBHOOK_URL or "Disabled")

    await resolve_targets()

    log.info("═══════════════════════════════════════════")
    log.info("   Listening for status updates...         ")
    log.info("   Polling for target changes every 60s    ")
    log.info("═══════════════════════════════════════════")

    # Start polling for target changes in the background
    asyncio.create_task(poll_for_target_changes())

    await client.run_until_disconnected()


with client:
    client.loop.run_until_complete(main())
