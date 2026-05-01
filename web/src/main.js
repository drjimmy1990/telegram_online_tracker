/**
 * TeleTracker v2 — Main Entry Point
 * Auth gate → Load users → Render sidebar → Load data → Realtime
 */

import "./style.css";
import { isAuthenticated, login, logout } from "./auth.js";
import {
  fetchEventsForDateRange,
  fetchRecentEvents,
  fetchCurrentStatus,
  fetchAllUserStatuses,
  fetchWeeklyData,
  subscribeToEvents,
  fetchTrackedUsers,
  fetchTargets,
  addTarget,
  removeTarget,
  toggleTarget,
  deleteUserEvents,
} from "./api.js";
import { computeSessions, computeStats, computeHourlyActivity, formatDuration } from "./stats.js";
import { renderTimeline, renderTimelineHours } from "./timeline.js";
import { renderActivityChart, renderWeeklyChart } from "./charts.js";
import {
  renderUserCards,
  updateUserCardStatus,
  renderStatCards,
  updateStats,
  renderHeatmap,
  renderHistory,
  updateConnectionStatus,
} from "./components.js";

// ── DOM Elements ────────────────────────────────────────
const loginScreen = document.getElementById("login-screen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const statsGrid = document.getElementById("stats-grid");
const activityCanvas = document.getElementById("activity-chart");
const weeklyCanvas = document.getElementById("weekly-chart");
const timelineCanvas = document.getElementById("timeline-canvas");
const timelineHours = document.getElementById("timeline-hours");
const heatmapContainer = document.getElementById("heatmap-container");
const historyBody = document.getElementById("history-body");
const eventCountEl = document.getElementById("event-count");
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const connectionBadge = document.getElementById("connection-status");
const userListEl = document.getElementById("user-list");
const userCountEl = document.getElementById("user-count");
const statusFilterEl = document.getElementById("status-filter");
const targetsListEl = document.getElementById("targets-list");
const addTargetForm = document.getElementById("add-target-form");
const targetPhoneInput = document.getElementById("target-phone");
const targetNameInput = document.getElementById("target-name");
const managePage = document.getElementById("manage-page");
const dashboardBody = document.querySelector(".dashboard-body");
const navManageBtn = document.getElementById("nav-manage-btn");
const navBackBtn = document.getElementById("nav-back-btn");
const targetsCountEl = document.getElementById("targets-count");
const timelineDateLabel = document.getElementById("timeline-date-label");

// New DOM elements
const quickDatesEl = document.getElementById("quick-dates");
const quickDatesMobileEl = document.getElementById("quick-dates-mobile");
const mobileFilterToggle = document.getElementById("mobile-filter-toggle");
const mobileFilterBar = document.getElementById("mobile-filter-bar");
const dateFromMobile = document.getElementById("date-from-mobile");
const dateToMobile = document.getElementById("date-to-mobile");
const apiDocsPage = document.getElementById("api-docs-page");
const navApiDocsBtn = document.getElementById("nav-api-docs-btn");
const navBackApiBtn = document.getElementById("nav-back-api-btn");

// ── State ───────────────────────────────────────────────
let selectedDateFrom = new Date();
let selectedDateTo = new Date();
let selectedUserId = null; // null = All Users
let statusFilter = "online"; // "online" or "all"
let currentEvents = [];
let recentEvents = [];
let trackedUsers = [];
let statusMap = {}; // { user_id: { status, last_seen } }
let mobileFilterOpen = false;

// Hidden users (persisted in localStorage so deleted users stay hidden after refresh)
function getHiddenUsers() {
  try { return JSON.parse(localStorage.getItem("tt_hidden_users") || "[]"); } catch { return []; }
}
function addHiddenUser(userId) {
  const list = getHiddenUsers();
  if (!list.includes(String(userId))) {
    list.push(String(userId));
    localStorage.setItem("tt_hidden_users", JSON.stringify(list));
  }
}
function isUserHidden(userId) {
  return getHiddenUsers().includes(String(userId));
}

// ═══════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════

function checkAuth() {
  if (isAuthenticated()) {
    loginScreen.style.display = "none";
    dashboard.style.display = "flex";
    initDashboard();
  } else {
    loginScreen.style.display = "flex";
    dashboard.style.display = "none";
    passwordInput.focus();
  }
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pw = passwordInput.value.trim();
  if (login(pw)) {
    loginError.style.display = "none";
    loginScreen.style.display = "none";
    dashboard.style.display = "flex";
    initDashboard();
  } else {
    loginError.style.display = "block";
    passwordInput.value = "";
    passwordInput.focus();
  }
});

logoutBtn.addEventListener("click", () => {
  logout();
  dashboard.style.display = "none";
  loginScreen.style.display = "flex";
  passwordInput.value = "";
  passwordInput.focus();
});

// ═══════════════════════════════════════════════════════
//  DASHBOARD INIT
// ═══════════════════════════════════════════════════════

let initialized = false;

async function initDashboard() {
  if (initialized) return;
  initialized = true;

  // Render static components
  renderStatCards(statsGrid);
  renderTimelineHours(timelineHours);

  // Set date pickers to today
  const today = formatDateForInput(new Date());
  dateFromInput.value = today;
  dateToInput.value = today;
  if (dateFromMobile) dateFromMobile.value = today;
  if (dateToMobile) dateToMobile.value = today;
  dateFromInput.addEventListener("change", onDateChange);
  dateToInput.addEventListener("change", onDateChange);
  if (dateFromMobile) dateFromMobile.addEventListener("change", onMobileDateChange);
  if (dateToMobile) dateToMobile.addEventListener("change", onMobileDateChange);

  // Status filter toggle
  statusFilterEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn) return;
    statusFilterEl.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    statusFilter = btn.dataset.filter;
    renderFilteredHistory();
  });

  // Setup live duration ticker
  setInterval(() => {
    document.querySelectorAll(".live-duration").forEach((el) => {
      const startIso = el.getAttribute("data-start");
      if (startIso) {
        const ms = Date.now() - new Date(startIso).getTime();
        el.textContent = formatDuration(ms);
      }
    });
  }, 1000);

  // Quick date presets
  setupQuickDates(quickDatesEl);
  setupQuickDates(quickDatesMobileEl);

  // Mobile filter toggle
  if (mobileFilterToggle) {
    mobileFilterToggle.addEventListener("click", () => {
      mobileFilterOpen = !mobileFilterOpen;
      mobileFilterBar.style.display = mobileFilterOpen ? "block" : "none";
    });
  }

  // Target management form
  addTargetForm.addEventListener("submit", onAddTarget);

  // Page navigation
  navManageBtn.addEventListener("click", () => showPage("manage"));
  navBackBtn.addEventListener("click", () => showPage("dashboard"));
  if (navApiDocsBtn) navApiDocsBtn.addEventListener("click", () => showPage("api-docs"));
  if (navBackApiBtn) navBackApiBtn.addEventListener("click", () => showPage("dashboard"));

  // Copy buttons in API docs
  document.querySelectorAll(".api-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const codeEl = document.getElementById(targetId);
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent.trim());
        btn.innerHTML = "✓";
        setTimeout(() => {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
        }, 1500);
      }
    });
  });

  // Load targets and render management panel
  await loadTargets();

  // Load users (filter out hidden ones)
  const allUsers = await fetchTrackedUsers();
  trackedUsers = allUsers.filter((u) => !isUserHidden(u.user_id));
  userCountEl.textContent = trackedUsers.length;

  // Get all user statuses
  if (trackedUsers.length > 0) {
    statusMap = await fetchAllUserStatuses(trackedUsers);
  }

  // Render sidebar
  renderSidebar();

  // Load initial data
  await loadAllData();

  // Weekly chart
  await loadWeeklyChart();

  // Subscribe to realtime updates
  setupRealtime();

  // Handle resize
  window.addEventListener("resize", () => {
    if (currentEvents.length > 0) {
      const sessions = computeSessions(currentEvents);
      renderTimeline(timelineCanvas, sessions, selectedDateFrom, selectedDateTo);
    }
  });

  // Infinite scroll on history table
  const historyWrapper = document.querySelector(".history-table-wrapper");
  if (historyWrapper) {
    historyWrapper.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = historyWrapper;
      if (scrollTop + clientHeight >= scrollHeight - 100 && historyHasMore && !historyLoading) {
        loadHistoryData(false);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════
//  QUICK DATE PRESETS
// ═══════════════════════════════════════════════════════

function setupQuickDates(container) {
  if (!container) return;
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".quick-date-btn");
    if (!btn) return;

    // Update active state on BOTH desktop and mobile groups
    [quickDatesEl, quickDatesMobileEl].forEach((group) => {
      if (!group) return;
      group.querySelectorAll(".quick-date-btn").forEach((b) => b.classList.remove("active"));
      const match = group.querySelector(`[data-range="${btn.dataset.range}"]`);
      if (match) match.classList.add("active");
    });

    const now = new Date();
    let from, to;

    switch (btn.dataset.range) {
      case "today":
        from = to = now;
        break;
      case "yesterday":
        from = to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case "week":
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        to = now;
        break;
      default:
        return;
    }

    const fromStr = formatDateForInput(from);
    const toStr = formatDateForInput(to);

    dateFromInput.value = fromStr;
    dateToInput.value = toStr;
    if (dateFromMobile) dateFromMobile.value = fromStr;
    if (dateToMobile) dateToMobile.value = toStr;

    selectedDateFrom = new Date(fromStr + "T00:00:00");
    selectedDateTo = new Date(toStr + "T00:00:00");
    updateTimelineLabel();
    loadDayData();
  });
}

// ═══════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════

function renderSidebar() {
  renderUserCards(userListEl, trackedUsers, selectedUserId, statusMap, onUserSelect, onUserDelete);
}

function onUserSelect(userId) {
  selectedUserId = userId;
  renderSidebar();
  loadAllData();
  loadWeeklyChart();
}

async function onUserDelete(userId, displayName) {
  if (!confirm(`Remove "${displayName}" from the dashboard?\n\nTheir historical data will be deleted and they will be hidden from the sidebar.`)) return;

  // Add to persistent hidden list FIRST (so even if DB delete fails, they stay hidden)
  addHiddenUser(userId);

  // Try to delete their events from the DB (best-effort)
  await deleteUserEvents(userId);

  // Remove from local state
  trackedUsers = trackedUsers.filter((u) => u.user_id !== userId);
  delete statusMap[userId];
  userCountEl.textContent = trackedUsers.length;

  // Reset selection if deleted user was selected
  if (selectedUserId === userId) {
    selectedUserId = null;
  }

  renderSidebar();
  await loadAllData();
  await loadWeeklyChart();
}

// ═══════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════

const HISTORY_PAGE_SIZE = 50;
let historyOffset = 0;
let historyHasMore = true;
let historyLoading = false;

async function loadAllData() {
  await Promise.all([loadDayData(), loadHistoryData(true)]);
}

async function loadDayData() {
  currentEvents = await fetchEventsForDateRange(
    selectedDateFrom,
    selectedDateTo,
    selectedUserId
  );
  renderDayView(currentEvents);
}

async function loadHistoryData(reset = false) {
  if (reset) {
    historyOffset = 0;
    historyHasMore = true;
    recentEvents = [];
  }
  if (!historyHasMore || historyLoading) return;

  historyLoading = true;
  const batch = await fetchRecentEvents(
    HISTORY_PAGE_SIZE,
    selectedUserId,
    selectedDateFrom,
    selectedDateTo,
    historyOffset
  );
  historyLoading = false;

  if (batch.length < HISTORY_PAGE_SIZE) {
    historyHasMore = false;
  }

  recentEvents = reset ? batch : [...recentEvents, ...batch];
  historyOffset += batch.length;
  renderFilteredHistory(reset);
}

function renderFilteredHistory(fullReplace = true) {
  const filtered = statusFilter === "online"
    ? recentEvents.filter((e) => e.status === "Online")
    : recentEvents;
  // Pass full list as allEvents so durations are computed correctly in filtered view
  renderHistory(historyBody, filtered, statusFilter === "online" ? recentEvents : null);
  eventCountEl.textContent = `${filtered.length} events${historyHasMore ? "+" : ""}`;
}

async function loadWeeklyChart() {
  const weeklyData = await fetchWeeklyData(7, selectedUserId);
  renderWeeklyChart(weeklyCanvas, weeklyData);
}

// ═══════════════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════════════

function renderDayView(events) {
  const sessions = computeSessions(events);
  const stats = computeStats(sessions);
  const hourly = computeHourlyActivity(sessions);

  updateStats(stats);
  renderTimeline(timelineCanvas, sessions, selectedDateFrom, selectedDateTo);
  renderHeatmap(heatmapContainer, hourly);
  renderActivityChart(activityCanvas, hourly);
}

// ═══════════════════════════════════════════════════════
//  EVENT HANDLERS
// ═══════════════════════════════════════════════════════

function onDateChange() {
  selectedDateFrom = new Date(dateFromInput.value + "T00:00:00");
  selectedDateTo = new Date(dateToInput.value + "T00:00:00");

  // Ensure from <= to
  if (selectedDateFrom > selectedDateTo) {
    selectedDateTo = new Date(selectedDateFrom);
    dateToInput.value = dateFromInput.value;
  }

  // Sync mobile inputs
  if (dateFromMobile) dateFromMobile.value = dateFromInput.value;
  if (dateToMobile) dateToMobile.value = dateToInput.value;

  // Clear quick-date active state (user manually picked a date)
  clearQuickDateActive();
  updateTimelineLabel();
  loadDayData();
}

function onMobileDateChange() {
  dateFromInput.value = dateFromMobile.value;
  dateToInput.value = dateToMobile.value;
  onDateChange();
}

function clearQuickDateActive() {
  [quickDatesEl, quickDatesMobileEl].forEach((group) => {
    if (!group) return;
    group.querySelectorAll(".quick-date-btn").forEach((b) => b.classList.remove("active"));
  });
}

function updateTimelineLabel() {
  if (!timelineDateLabel) return;
  const now = new Date();
  const isToday = isSameDay(selectedDateFrom, now) && isSameDay(selectedDateTo, now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday = isSameDay(selectedDateFrom, yesterday) && isSameDay(selectedDateTo, yesterday);

  if (isToday) {
    timelineDateLabel.textContent = "Today's";
  } else if (isYesterday) {
    timelineDateLabel.textContent = "Yesterday's";
  } else if (isSameDay(selectedDateFrom, selectedDateTo)) {
    timelineDateLabel.textContent = selectedDateFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } else {
    const f = selectedDateFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const t = selectedDateTo.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    timelineDateLabel.textContent = `${f} – ${t}`;
  }
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ═══════════════════════════════════════════════════════
//  REALTIME
// ═══════════════════════════════════════════════════════

function setupRealtime() {
  subscribeToEvents((newEvent) => {
    // Skip events from hidden/deleted users
    if (isUserHidden(newEvent.user_id)) return;

    console.log("[Realtime] New event:", newEvent);
    updateUserCardStatus(userListEl, newEvent.user_id, newEvent.status);

    // Update statusMap
    statusMap[newEvent.user_id] = {
      status: newEvent.status,
      last_seen: newEvent.created_at,
    };

    // Dynamically add new users to the sidebar if unknown
    const isKnown = trackedUsers.some((u) => u.user_id === newEvent.user_id);
    if (!isKnown) {
      trackedUsers.push({
        user_id: newEvent.user_id,
        display_name: newEvent.display_name,
      });
      userCountEl.textContent = trackedUsers.length;
      renderSidebar();
    }

    // Only update charts/table if this event belongs to the selected user (or "All Users")
    if (selectedUserId !== null && newEvent.user_id !== selectedUserId) {
      return;
    }

    updateConnectionStatus(connectionBadge, true);

    // If the event falls within the selected date range, add to day view
    const eventDate = new Date(newEvent.created_at);
    if (eventDate >= selectedDateFrom && eventDate <= new Date(selectedDateTo.getTime() + 86400000)) {
      currentEvents.push(newEvent);
      renderDayView(currentEvents);
    }

    // Update recent events and re-render history to respect current filters
    recentEvents.unshift(newEvent);
    if (recentEvents.length > 200) recentEvents.pop();
    renderFilteredHistory();
  });

  // Mark connected after a short delay
  setTimeout(() => {
    updateConnectionStatus(connectionBadge, true);
  }, 1500);
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════

function formatDateForInput(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ═══════════════════════════════════════════════════════
//  PAGE NAVIGATION
// ═══════════════════════════════════════════════════════

function showPage(page) {
  // Hide all pages
  dashboardBody.style.display = "none";
  managePage.style.display = "none";
  if (apiDocsPage) apiDocsPage.style.display = "none";

  if (page === "manage") {
    managePage.style.display = "block";
    loadTargets();
  } else if (page === "api-docs") {
    apiDocsPage.style.display = "block";
  } else {
    dashboardBody.style.display = "flex";
  }
}

// ═══════════════════════════════════════════════════════
//  TARGET MANAGEMENT
// ═══════════════════════════════════════════════════════

let managedTargets = [];

async function loadTargets() {
  managedTargets = await fetchTargets();
  renderTargetsList();
}

function renderTargetsList() {
  targetsListEl.innerHTML = "";
  targetsCountEl.textContent = managedTargets.length;

  if (managedTargets.length === 0) {
    targetsListEl.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted)">No targets configured yet. Add one above.</td></tr>`;
    return;
  }

  for (const target of managedTargets) {
    const row = document.createElement("tr");
    if (!target.is_active) row.style.opacity = "0.45";
    const addedDate = new Date(target.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    row.innerHTML = `
      <td><strong>${target.display_name || "Unnamed"}</strong></td>
      <td><span class="phone-mono">${target.phone_number}</span></td>
      <td><span class="${target.is_active ? 'status-active' : 'status-paused'}">${target.is_active ? '● Active' : '⏸ Paused'}</span></td>
      <td><span class="date-text">${addedDate}</span></td>
      <td>
        <div class="manage-actions">
          <button class="btn-icon" data-action="toggle" data-id="${target.id}" data-active="${target.is_active}" title="${target.is_active ? 'Pause' : 'Resume'}">
            ${target.is_active
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
              : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>`
            }
          </button>
          <button class="btn-icon danger" data-action="delete" data-id="${target.id}" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg>
          </button>
        </div>
      </td>
    `;
    targetsListEl.appendChild(row);
  }

  // Attach event listeners (use event delegation on tbody)
  targetsListEl.onclick = async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = Number(btn.dataset.id);

    if (action === "delete") {
      if (confirm("Remove this target?")) {
        await removeTarget(id);
        await loadTargets();
      }
    } else if (action === "toggle") {
      const currentlyActive = btn.dataset.active === "true";
      await toggleTarget(id, !currentlyActive);
      await loadTargets();
    }
  };
}

async function onAddTarget(e) {
  e.preventDefault();
  const phone = targetPhoneInput.value.trim();
  const name = targetNameInput.value.trim();

  if (!phone) return;

  const result = await addTarget(phone, name);
  if (result) {
    targetPhoneInput.value = "";
    targetNameInput.value = "";
    await loadTargets();
  } else {
    alert("Failed to add target. Make sure the number is in international format (e.g. +201234567890) and not a duplicate.");
  }
}

// ═══════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════
checkAuth();
