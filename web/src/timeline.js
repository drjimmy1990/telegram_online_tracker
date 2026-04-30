/**
 * Timeline chart — renders online/offline intervals on a canvas.
 * 24-hour horizontal bar with green (online) segments.
 */

const COLORS = {
  bg: "#111827",
  gridLine: "rgba(255,255,255,0.04)",
  online: "#10b981",
  onlineGlow: "rgba(16, 185, 129, 0.3)",
  offline: "rgba(239, 68, 68, 0.12)",
  nowLine: "#06b6d4",
  text: "#475569",
};

/**
 * Render the 24-hour timeline on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} sessions - from computeSessions()
 * @param {Date} date - the date being displayed
 */
export function renderTimeline(canvas, sessions, date) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  // Set canvas size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 80 * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 80;
  const barY = 16;
  const barH = 48;
  const radius = 6;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Background bar
  ctx.fillStyle = COLORS.bg;
  roundRect(ctx, 0, barY, width, barH, radius);
  ctx.fill();

  // Grid lines (every 3 hours)
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  for (let h = 0; h <= 24; h += 3) {
    const x = (h / 24) * width;
    ctx.beginPath();
    ctx.moveTo(x, barY);
    ctx.lineTo(x, barY + barH);
    ctx.stroke();
  }

  // Day boundaries
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const dayMs = dayEnd - dayStart;

  // Draw online sessions
  for (const session of sessions) {
    const sStart = Math.max(session.start.getTime(), dayStart.getTime());
    const sEnd = Math.min(session.end.getTime(), dayEnd.getTime());

    if (sEnd <= sStart) continue;

    const x = ((sStart - dayStart.getTime()) / dayMs) * width;
    const w = ((sEnd - sStart) / dayMs) * width;

    // Glow
    ctx.fillStyle = COLORS.onlineGlow;
    roundRect(ctx, x, barY - 2, Math.max(w, 2), barH + 4, 4);
    ctx.fill();

    // Bar
    ctx.fillStyle = COLORS.online;
    roundRect(ctx, x, barY + 4, Math.max(w, 2), barH - 8, 4);
    ctx.fill();
  }

  // "Now" indicator (if viewing today)
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    const nowX = ((now - dayStart) / dayMs) * width;
    ctx.strokeStyle = COLORS.nowLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nowX, barY - 4);
    ctx.lineTo(nowX, barY + barH + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // "Now" label
    ctx.fillStyle = COLORS.nowLine;
    ctx.font = "600 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NOW", nowX, barY - 6);
  }
}

/**
 * Render hour labels below the timeline.
 */
export function renderTimelineHours(container) {
  container.innerHTML = "";
  for (let h = 0; h <= 24; h += 3) {
    const span = document.createElement("span");
    span.textContent = `${h.toString().padStart(2, "0")}:00`;
    container.appendChild(span);
  }
}

/**
 * Helper — draw a rounded rectangle.
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
