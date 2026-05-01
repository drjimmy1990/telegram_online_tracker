/**
 * Components — DOM builders for sidebar cards, stat cards, heatmap, and history table.
 */

import { formatDuration, computeEventDuration } from "./stats.js";

// ── Avatar color palette ────────────────────────────────
const AVATAR_COLORS = [
  { bg: "rgba(139, 92, 246, 0.12)", fg: "#8b5cf6" },
  { bg: "rgba(6, 182, 212, 0.12)", fg: "#06b6d4" },
  { bg: "rgba(16, 185, 129, 0.12)", fg: "#10b981" },
  { bg: "rgba(245, 158, 11, 0.12)", fg: "#f59e0b" },
  { bg: "rgba(239, 68, 68, 0.12)", fg: "#ef4444" },
  { bg: "rgba(236, 72, 153, 0.12)", fg: "#ec4899" },
];

function getAvatarColor(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getInitial(name) {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

// ── Sidebar User Cards ─────────────────────────────────
/**
 * Render user cards in the sidebar.
 * @param {HTMLElement} container — #user-list
 * @param {Array} users — [{ user_id, display_name }]
 * @param {number|null} activeUserId — currently selected user
 * @param {object} statusMap — { user_id: { status, last_seen } }
 * @param {function} onSelect — callback(userId)
 */
export function renderUserCards(container, users, activeUserId, statusMap, onSelect, onDelete) {
  container.innerHTML = "";

  if (users.length === 0) {
    container.innerHTML = `
      <div class="empty-sidebar">
        <p>No users tracked yet</p>
        <span>Data will appear once the tracker starts</span>
      </div>
    `;
    return;
  }

  // Add "All Users" option
  const allCard = createUserCardEl(
    { user_id: null, display_name: "All Users" },
    0,
    activeUserId === null,
    { status: null },
    true
  );
  allCard.addEventListener("click", () => onSelect(null));
  container.appendChild(allCard);

  users.forEach((user, i) => {
    const info = statusMap[user.user_id] || {};
    const card = createUserCardEl(user, i + 1, user.user_id === activeUserId, info, false);
    card.addEventListener("click", (e) => {
      // Don't select if clicking the delete button
      if (e.target.closest(".user-card-delete")) return;
      onSelect(user.user_id);
    });

    // Add delete button
    if (onDelete) {
      const delBtn = document.createElement("button");
      delBtn.className = "user-card-delete";
      delBtn.title = "Remove user data";
      delBtn.innerHTML = "✕";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onDelete(user.user_id, user.display_name || user.user_id);
      });
      card.appendChild(delBtn);
    }

    container.appendChild(card);
  });
}

function createUserCardEl(user, colorIndex, isActive, statusInfo, isAll) {
  const card = document.createElement("div");
  card.className = `user-card${isActive ? " active" : ""}`;
  card.dataset.userId = user.user_id || "all";

  const color = getAvatarColor(colorIndex);
  const initial = isAll ? "★" : getInitial(user.display_name);
  const isOnline = statusInfo.status === "Online";

  card.innerHTML = `
    <div class="user-avatar" style="background:${color.bg}; color:${color.fg}">
      ${initial}
      ${!isAll ? `<span class="status-indicator ${isOnline ? "online" : ""}"></span>` : ""}
    </div>
    <div class="user-info">
      <div class="user-name">${user.display_name || user.user_id || "Unknown"}</div>
      <div class="user-last-seen">${
        isAll ? "View combined data" :
        isOnline ? "Online now" :
        statusInfo.last_seen ? `Last seen ${formatTimeAgo(statusInfo.last_seen)}` :
        "No data yet"
      }</div>
    </div>
  `;
  return card;
}

/**
 * Update the status dot of a specific user card in the sidebar.
 */
export function updateUserCardStatus(container, userId, status) {
  const card = container.querySelector(`[data-user-id="${userId}"]`);
  if (!card) return;
  const dot = card.querySelector(".status-indicator");
  const isPrivacy = ["Recently", "Last Week", "Last Month", "Hidden"].includes(status);
  if (dot) {
    dot.classList.remove("online", "privacy");
    if (status === "Online") dot.classList.add("online");
    if (isPrivacy) dot.classList.add("privacy");
  }
  const lastSeen = card.querySelector(".user-last-seen");
  if (lastSeen) {
    if (status === "Online") lastSeen.textContent = "Online now";
    else if (isPrivacy) lastSeen.textContent = `🔒 ${status}`;
    else lastSeen.textContent = "Last seen just now";
  }
}

// ── Stats Cards ─────────────────────────────────────────
const STAT_CARDS = [
  {
    id: "online-today",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>`,
    iconClass: "online-icon",
    label: "Total Online",
  },
  {
    id: "sessions",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    iconClass: "sessions-icon",
    label: "Sessions",
  },
  {
    id: "avg-session",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
    iconClass: "avg-icon",
    label: "Avg Session",
  },
  {
    id: "longest",
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
    iconClass: "longest-icon",
    label: "Longest Session",
  },
];

export function renderStatCards(container) {
  container.innerHTML = "";
  for (const card of STAT_CARDS) {
    const el = document.createElement("div");
    el.className = "stat-card";
    el.id = `stat-${card.id}`;
    el.innerHTML = `
      <div class="stat-icon ${card.iconClass}">${card.icon}</div>
      <div class="stat-content">
        <span class="stat-value" data-stat="${card.id}">--</span>
        <span class="stat-label">${card.label}</span>
      </div>
    `;
    container.appendChild(el);
  }
}

export function updateStats(stats) {
  setValue("online-today", formatDuration(stats.totalOnlineMs));
  setValue("sessions", stats.sessionCount.toString());
  setValue("avg-session", formatDuration(stats.avgSessionMs));
  setValue("longest", formatDuration(stats.longestSessionMs));
}

function setValue(id, value) {
  const el = document.querySelector(`[data-stat="${id}"]`);
  if (el) el.textContent = value;
}

// ── Heatmap ─────────────────────────────────────────────
export function renderHeatmap(container, hourlyMinutes) {
  container.innerHTML = "";
  const maxMinutes = Math.max(...hourlyMinutes, 1);

  for (let h = 0; h < 24; h++) {
    const minutes = hourlyMinutes[h];
    const intensity = minutes / maxMinutes;

    const cell = document.createElement("div");
    cell.className = "heatmap-cell";

    if (intensity > 0) {
      const alpha = 0.15 + intensity * 0.65;
      cell.style.background = `rgba(16, 185, 129, ${alpha})`;
      if (intensity > 0.7) {
        cell.style.boxShadow = `0 0 12px rgba(16, 185, 129, ${intensity * 0.4})`;
      }
    }

    const tooltip = document.createElement("span");
    tooltip.className = "heatmap-tooltip";
    tooltip.textContent = `${h.toString().padStart(2, "0")}:00 — ${Math.round(minutes)}m online`;
    cell.appendChild(tooltip);

    const label = document.createElement("div");
    label.className = "heatmap-label";
    label.textContent = h.toString().padStart(2, "0");
    cell.appendChild(label);

    container.appendChild(cell);
  }
}

// ── Session History Table ───────────────────────────────
/**
 * Render the event history table.
 * @param {HTMLElement} tbody
 * @param {Array} events — the events to display (DESC order)
 * @param {Array} allEvents — optional full event list for duration lookup
 */
export function renderHistory(tbody, events, allEvents = null) {
  tbody.innerHTML = "";

  if (events.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row"><td colspan="5">
        <div class="empty-state">
          <p>No events recorded yet</p>
          <span>Events appear when the tracker detects status changes</span>
        </div>
      </td></tr>
    `;
    return;
  }

  // If allEvents provided, use it to find duration (for filtered views)
  const fullList = allEvents || events;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const row = createEventRow(ev, fullList);
    tbody.appendChild(row);
  }
}

function getStatusClass(status) {
  switch (status) {
    case "Online": return "online";
    case "Offline": return "offline";
    case "Recently": return "privacy";
    case "Last Week": return "privacy";
    case "Last Month": return "privacy";
    case "Hidden": return "privacy";
    default: return "offline";
  }
}

function createEventRow(event, fullList) {
  const row = document.createElement("tr");
  const isOnline = event.status === "Online";
  const isOffline = event.status === "Offline";
  const isPrivacy = ["Recently", "Last Week", "Last Month", "Hidden"].includes(event.status);
  const time = new Date(event.created_at);
  const displayName = event.display_name || event.user_id || "Unknown";
  const initial = getInitial(displayName.toString());
  const statusClass = getStatusClass(event.status);

  // Compute duration: find the matching "end" event in the full list (DESC order)
  // For an Online event  → find the next Offline/non-Online event (= session end)
  // For an Offline event → find the next Online event (= how long they were away)
  let durationHtml = '<span class="duration-text">—</span>';
  let durationMs = null;
  let isLive = false;

  if (!isPrivacy) {
    const idx = fullList.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      // Scan toward NEWER events (lower indices in DESC list)
      let endEvent = null;
      for (let j = idx - 1; j >= 0; j--) {
        const candidate = fullList[j];
        if (isOnline && candidate.status !== "Online") {
          endEvent = candidate;
          break;
        }
        if (isOffline && candidate.status !== "Offline") {
          endEvent = candidate;
          break;
        }
      }
      durationMs = computeEventDuration(event, endEvent);
      
      // If no end event and this is the most recent status, it's live
      if (!endEvent && idx === 0) {
        isLive = true;
      }
    }
  }

  if (isLive) {
    durationHtml = `<span class="duration-text live-duration" data-start="${time.toISOString()}">${formatDuration(durationMs)}</span>`;
  } else if (durationMs !== null) {
    durationHtml = `<span class="duration-text">${formatDuration(durationMs)}</span>`;
  }

  row.innerHTML = `
    <td>
      <span class="status-badge ${statusClass}">
        <span class="status-badge-dot"></span>
        ${event.status}
      </span>
    </td>
    <td>
      <div class="user-cell">
        <span class="user-cell-avatar">${initial}</span>
        <span class="user-cell-name">${displayName}</span>
      </div>
    </td>
    <td><span class="time-text">${formatTime(time)}</span></td>
    <td>${durationHtml}</td>
    <td><span class="last-seen-text">${event.was_last_seen ? formatTime(new Date(event.was_last_seen)) : "—"}</span></td>
  `;
  return row;
}

export function prependEventRow(tbody, event, existingFirst) {
  // Build a mini-list: [newEvent, previousFirst] so duration can be computed
  const miniList = existingFirst ? [event, existingFirst] : [event];
  const row = createEventRow(event, miniList);
  row.classList.add("event-flash");

  const emptyRow = tbody.querySelector(".empty-row");
  if (emptyRow) emptyRow.remove();

  tbody.insertBefore(row, tbody.firstChild);
}

// ── Connection Status ───────────────────────────────────
export function updateConnectionStatus(badgeEl, connected) {
  const text = badgeEl.querySelector(".connection-text");
  if (connected) {
    badgeEl.classList.remove("disconnected");
    text.textContent = "Connected";
  } else {
    badgeEl.classList.add("disconnected");
    text.textContent = "Disconnected";
  }
}

// ── Helpers ─────────────────────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTimeAgo(dateStr) {
  const then = new Date(dateStr);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}
