"""
Telegram Online Tracker — Event-Driven Status Monitor
======================================================
Listens for a target user's online/offline status changes via the
Telegram MTProto API and records events to Supabase + optional webhook.

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


async def resolve_targets() -> None:
    """Resolve all target users at startup and cache their IDs and names."""
    global TARGETS
    if TARGETS:
        return

    for target in config.TARGET_USERS:
        log.info("Resolving target user: %s", target)
        try:
            entity = await client.get_entity(target)
            display_name = getattr(entity, "first_name", target) or target
            if getattr(entity, "last_name", None):
                display_name += f" {entity.last_name}"
            
            TARGETS[entity.id] = display_name
            log.info("✓ Target resolved: %s (ID: %d)", display_name, entity.id)
        except Exception as e:
            log.error("✗ Failed to resolve target '%s': %s", target, e)

    if not TARGETS:
        log.error("No targets could be resolved. Exiting.")
        import sys
        sys.exit(1)


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
    log.info("═══════════════════════════════════════════")

    await client.run_until_disconnected()


with client:
    client.loop.run_until_complete(main())
