/**
 * Statistics computation from status events.
 */

/**
 * Format milliseconds into a human-readable duration string.
 */
export function formatDuration(ms) {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const m = minutes % 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const s = seconds % 60;
    return s > 0 ? `${minutes}m ${s}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Compute online sessions from a list of chronologically sorted events.
 * A session = Online event -> next Offline event.
 * Returns array of { start, end, durationMs }.
 */
export function computeSessions(events) {
  const sessions = [];
  let onlineStart = null;

  for (const ev of events) {
    if (ev.status === "Online") {
      // Only set start if not already in an online session.
      // Telegram sends multiple Online pings during a single session;
      // we want the FIRST one as the true session start.
      if (!onlineStart) {
        onlineStart = new Date(ev.created_at);
      }
    } else if (ev.status === "Offline" && onlineStart) {
      const end = new Date(ev.created_at);
      sessions.push({
        start: onlineStart,
        end: end,
        durationMs: end - onlineStart,
      });
      onlineStart = null;
    }
  }

  // If currently online (no closing Offline), count until now
  if (onlineStart) {
    const now = new Date();
    sessions.push({
      start: onlineStart,
      end: now,
      durationMs: now - onlineStart,
      isActive: true,
    });
  }

  return sessions;
}

/**
 * Calculate statistics from sessions.
 */
export function computeStats(sessions) {
  if (sessions.length === 0) {
    return {
      totalOnlineMs: 0,
      sessionCount: 0,
      avgSessionMs: 0,
      longestSessionMs: 0,
    };
  }

  const totalOnlineMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  const longestSessionMs = Math.max(...sessions.map((s) => s.durationMs));

  return {
    totalOnlineMs,
    sessionCount: sessions.length,
    avgSessionMs: totalOnlineMs / sessions.length,
    longestSessionMs,
  };
}

/**
 * Build an hourly activity map (0-23) with total online minutes per hour.
 */
export function computeHourlyActivity(sessions) {
  const hours = new Array(24).fill(0);

  for (const session of sessions) {
    const start = session.start;
    const end = session.end;

    // For each hour this session spans, add the minutes
    let cursor = new Date(start);
    while (cursor < end) {
      const hour = cursor.getHours();
      const hourEnd = new Date(cursor);
      hourEnd.setMinutes(59, 59, 999);

      const segmentEnd = end < hourEnd ? end : hourEnd;
      const minutes = (segmentEnd - cursor) / 60000;
      hours[hour] += Math.max(0, minutes);

      // Move to next hour
      cursor = new Date(hourEnd);
      cursor.setMilliseconds(cursor.getMilliseconds() + 1);
    }
  }

  return hours;
}

/**
 * Compute duration for an event.
 * - Online events:  how long they stayed/have been online
 *     → gap from this Online to the next event, or "still online" = now - this
 * - Offline events: how long they stayed/have been offline
 *     → gap from this Offline to the next event, or "still offline" = now - this
 */
export function computeEventDuration(event, nextEvent) {
  const start = new Date(event.created_at);
  if (!nextEvent) {
    // Latest event — still in this state right now
    return Date.now() - start.getTime();
  }
  const end = new Date(nextEvent.created_at);
  return Math.abs(end - start);
}
