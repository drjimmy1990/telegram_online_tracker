"""
Centralized configuration loader.
Reads from .env and validates required fields at startup.
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    """Get a required environment variable or exit with a clear error."""
    value = os.getenv(key, "").strip()
    if not value:
        print(f"[FATAL] Missing required environment variable: {key}")
        print(f"        Please set it in your .env file.")
        sys.exit(1)
    return value


# ── Telegram MTProto ──────────────────────────────────────────────
API_ID = int(_require("API_ID"))
API_HASH = _require("API_HASH")

# ── Target Users ──────────────────────────────────────────────────
# Accepts a comma-separated list of phone numbers (+1234567890) or usernames
TARGET_USERS = [u.strip() for u in _require("TARGET_USERS").split(",") if u.strip()]
if not TARGET_USERS:
    print("[FATAL] TARGET_USERS is empty after parsing.")
    sys.exit(1)

# ── Supabase ──────────────────────────────────────────────────────
SUPABASE_URL = _require("SUPABASE_URL")
SUPABASE_KEY = _require("SUPABASE_KEY")

# ── Optional Webhook ──────────────────────────────────────────────
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "").strip() or None

# ── API Security ──────────────────────────────────────────────────
API_KEY = _require("API_KEY")
