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
  prependEventRow,
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

// ── State ───────────────────────────────────────────────
let selectedDateFrom = new Date();
let selectedDateTo = new Date();
let selectedUserId = null; // null = All Users
let statusFilter = "online"; // "online" or "all"
let currentEvents = [];
let recentEvents = [];
let trackedUsers = [];
let statusMap = {}; // { user_id: { status, last_seen } }

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
  dateFromInput.addEventListener("change", onDateChange);
  dateToInput.addEventListener("change", onDateChange);

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

  // Target management form
  addTargetForm.addEventListener("submit", onAddTarget);

  // Page navigation
  navManageBtn.addEventListener("click", () => showPage("manage"));
  navBackBtn.addEventListener("click", () => showPage("dashboard"));

  // Load targets and render management panel
  await loadTargets();

  // Load users
  trackedUsers = await fetchTrackedUsers();
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
      renderTimeline(timelineCanvas, sessions, selectedDateFrom);
    }
  });
}

// ═══════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════

function renderSidebar() {
  renderUserCards(userListEl, trackedUsers, selectedUserId, statusMap, onUserSelect);
}

function onUserSelect(userId) {
  selectedUserId = userId;
  renderSidebar();
  loadAllData();
  loadWeeklyChart();
}

// ═══════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════

async function loadAllData() {
  await Promise.all([loadDayData(), loadHistoryData()]);
}

async function loadDayData() {
  currentEvents = await fetchEventsForDateRange(
    selectedDateFrom,
    selectedDateTo,
    selectedUserId
  );
  renderDayView(currentEvents);
}

async function loadHistoryData() {
  recentEvents = await fetchRecentEvents(200, selectedUserId);
  renderFilteredHistory();
}

function renderFilteredHistory() {
  const filtered = statusFilter === "online"
    ? recentEvents.filter((e) => e.status === "Online")
    : recentEvents;
  // Pass full list as allEvents so durations are computed correctly in filtered view
  renderHistory(historyBody, filtered, statusFilter === "online" ? recentEvents : null);
  eventCountEl.textContent = `${filtered.length} events`;
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
  renderTimeline(timelineCanvas, sessions, selectedDateFrom);
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

  loadDayData();
}

// ═══════════════════════════════════════════════════════
//  REALTIME
// ═══════════════════════════════════════════════════════

function setupRealtime() {
  subscribeToEvents((newEvent) => {
    console.log("[Realtime] New event:", newEvent);

    // Update sidebar status dot for this user
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
//  TARGET MANAGEMENT
// ═══════════════════════════════════════════════════════

let managedTargets = [];

function showPage(page) {
  if (page === "manage") {
    dashboardBody.style.display = "none";
    managePage.style.display = "block";
    loadTargets();
  } else {
    managePage.style.display = "none";
    dashboardBody.style.display = "flex";
  }
}

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
