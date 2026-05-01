/**
 * Timeline chart — renders online/offline intervals on a canvas.
 * Single day: 24-hour horizontal bar with green (online) segments.
 * Multi-day: stacked rows, one per day (like a Gantt chart).
 */

const COLORS = {
  bg: "#111827",
  gridLine: "rgba(255,255,255,0.04)",
  online: "#10b981",
  onlineGlow: "rgba(16, 185, 129, 0.3)",
  offline: "rgba(239, 68, 68, 0.12)",
  nowLine: "#06b6d4",
  text: "#475569",
  dayLabel: "#94a3b8",
};

/**
 * Render the timeline on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} sessions - from computeSessions()
 * @param {Date} dateFrom - start date
 * @param {Date} dateTo - end date (if same as dateFrom, single-day view)
 */
export function renderTimeline(canvas, sessions, dateFrom, dateTo) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Determine if multi-day
  const from = new Date(dateFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dateTo || dateFrom);
  to.setHours(0, 0, 0, 0);

  const dayCount = Math.round((to - from) / 86400000) + 1;

  if (dayCount <= 1) {
    renderSingleDay(canvas, ctx, dpr, rect, sessions, from);
    return 0; // no label offset
  } else {
    renderMultiDay(canvas, ctx, dpr, rect, sessions, from, dayCount);
    return 52; // labelWidth offset in px
  }
}

/**
 * Single-day timeline (original behavior).
 */
function renderSingleDay(canvas, ctx, dpr, rect, sessions, date) {
  canvas.width = rect.width * dpr;
  canvas.height = 80 * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const barY = 16;
  const barH = 48;
  const radius = 6;

  ctx.clearRect(0, 0, width, 80);

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

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const dayMs = dayEnd - dayStart;

  drawSessions(ctx, sessions, dayStart, dayEnd, dayMs, 0, barY, barH, rect.width);
  drawNowIndicator(ctx, date, dayStart, dayMs, barY, barH, rect.width);
}

/**
 * Multi-day timeline — one row per day, stacked vertically.
 */
function renderMultiDay(canvas, ctx, dpr, rect, sessions, startDate, dayCount) {
  const rowHeight = 36;
  const labelWidth = 52;
  const barH = 22;
  const gap = 4;
  const topPad = 8;
  const totalHeight = topPad + dayCount * (rowHeight + gap);

  canvas.width = rect.width * dpr;
  canvas.height = totalHeight * dpr;
  canvas.style.height = totalHeight + "px";
  ctx.scale(dpr, dpr);

  const barAreaWidth = rect.width - labelWidth;

  ctx.clearRect(0, 0, rect.width, totalHeight);

  for (let d = 0; d < dayCount; d++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + d);

    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const dayMs = dayEnd - dayStart;

    const y = topPad + d * (rowHeight + gap);
    const barY = y + (rowHeight - barH) / 2;

    // Day label
    const now = new Date();
    const isToday = isSameDay(day, now);
    const isYesterday = isSameDay(day, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

    let label;
    if (isToday) label = "Today";
    else if (isYesterday) label = "Yest.";
    else label = day.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

    ctx.fillStyle = isToday ? COLORS.nowLine : COLORS.dayLabel;
    ctx.font = `${isToday ? "600" : "500"} 10px Inter, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, y + rowHeight / 2);

    // Background bar
    ctx.fillStyle = COLORS.bg;
    roundRect(ctx, labelWidth, barY, barAreaWidth, barH, 4);
    ctx.fill();

    // Grid lines every 3 hours (matches hour labels below)
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let h = 0; h <= 24; h += 3) {
      const x = labelWidth + (h / 24) * barAreaWidth;
      ctx.beginPath();
      ctx.moveTo(x, barY);
      ctx.lineTo(x, barY + barH);
      ctx.stroke();
    }

    // Draw sessions for this day
    drawSessions(ctx, sessions, dayStart, dayEnd, dayMs, labelWidth, barY, barH, barAreaWidth);

    // Now indicator for today
    if (isToday) {
      const nowX = labelWidth + ((now - dayStart) / dayMs) * barAreaWidth;
      ctx.strokeStyle = COLORS.nowLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(nowX, barY - 2);
      ctx.lineTo(nowX, barY + barH + 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/**
 * Draw session blocks within a single day row.
 */
function drawSessions(ctx, sessions, dayStart, dayEnd, dayMs, offsetX, barY, barH, barWidth) {
  for (const session of sessions) {
    const sStart = Math.max(session.start.getTime(), dayStart.getTime());
    const sEnd = Math.min(session.end.getTime(), dayEnd.getTime());

    if (sEnd <= sStart) continue;

    const x = offsetX + ((sStart - dayStart.getTime()) / dayMs) * barWidth;
    const w = ((sEnd - sStart) / dayMs) * barWidth;

    // Glow
    ctx.fillStyle = COLORS.onlineGlow;
    roundRect(ctx, x, barY - 1, Math.max(w, 2), barH + 2, 3);
    ctx.fill();

    // Bar
    ctx.fillStyle = COLORS.online;
    roundRect(ctx, x, barY + 2, Math.max(w, 2), barH - 4, 3);
    ctx.fill();
  }
}

/**
 * Draw "NOW" indicator line (single-day view only).
 */
function drawNowIndicator(ctx, date, dayStart, dayMs, barY, barH, width) {
  const now = new Date();
  if (!isSameDay(date, now)) return;

  const nowX = ((now - dayStart) / dayMs) * width;
  ctx.strokeStyle = COLORS.nowLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(nowX, barY - 4);
  ctx.lineTo(nowX, barY + barH + 4);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COLORS.nowLine;
  ctx.font = "600 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("NOW", nowX, barY - 6);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
