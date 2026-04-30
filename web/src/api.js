/**
 * Supabase client + data access layer.
 * Handles all database reads and the realtime subscription.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn(
    "[TeleTracker] Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY in env."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Fetch status events for a given date range.
 * If only startDate is provided, fetches events for that single day.
 */
export async function fetchEventsForDateRange(startDate, endDate, userId = null) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate || startDate);
  end.setHours(23, 59, 59, 999);

  let query = supabase
    .from("status_events")
    .select("*")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[API] fetchEventsForDateRange error:", error);
    return [];
  }
  return data || [];
}

/**
 * Fetch the most recent N events (for session history).
 */
export async function fetchRecentEvents(limit = 200, userId = null) {
  let query = supabase
    .from("status_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[API] fetchRecentEvents error:", error);
    return [];
  }
  return data || [];
}

/**
 * Fetch the very latest event to determine current status.
 */
export async function fetchCurrentStatus(userId = null) {
  let query = supabase
    .from("status_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Fetch the latest status for ALL tracked users.
 * Returns an object: { user_id: { status, last_seen } }
 */
export async function fetchAllUserStatuses(users) {
  const statusMap = {};
  for (const user of users) {
    const latest = await fetchCurrentStatus(user.user_id);
    if (latest) {
      statusMap[user.user_id] = {
        status: latest.status,
        last_seen: latest.created_at,
      };
    }
  }
  return statusMap;
}

/**
 * Fetch events for the last N days to compute daily totals.
 * Returns [{ label: "Mon", hours: 3.5 }, ...]
 */
export async function fetchWeeklyData(days = 7, userId = null) {
  const results = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    let query = supabase
      .from("status_events")
      .select("*")
      .gte("created_at", date.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data } = await query;
    const events = data || [];

    // Compute total online time from events
    let totalMs = 0;
    let onlineStart = null;
    for (const ev of events) {
      if (ev.status === "Online") {
        onlineStart = new Date(ev.created_at);
      } else if (ev.status === "Offline" && onlineStart) {
        totalMs += new Date(ev.created_at) - onlineStart;
        onlineStart = null;
      }
    }
    // If still online at end of day
    if (onlineStart) {
      const cap = i === 0 ? new Date() : endDate;
      totalMs += cap - onlineStart;
    }

    results.push({
      label: dayNames[date.getDay()],
      hours: Math.round((totalMs / 3600000) * 10) / 10,
    });
  }

  return results;
}

/**
 * Subscribe to new inserts on status_events.
 */
export function subscribeToEvents(onInsert) {
  const channel = supabase
    .channel("status_events_realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "status_events" },
      (payload) => {
        onInsert(payload.new);
      }
    )
    .subscribe((status) => {
      console.log("[Realtime] Subscription status:", status);
    });

  return channel;
}

/**
 * Fetch unique tracked users from the database.
 */
export async function fetchTrackedUsers() {
  const { data, error } = await supabase
    .from("status_events")
    .select("user_id, display_name")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[API] fetchTrackedUsers error:", error);
    return [];
  }

  const unique = [];
  const seen = new Set();
  for (const row of data || []) {
    if (!seen.has(row.user_id)) {
      seen.add(row.user_id);
      unique.push({ user_id: row.user_id, display_name: row.display_name });
    }
  }
  return unique;
}
