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
} from "./api.js";
import { computeSessions, computeStats, computeHourlyActivity } from "./stats.js";
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

    // Prepend to history
    const firstExisting = recentEvents.length > 0 ? recentEvents[0] : null;
    recentEvents.unshift(newEvent);
    prependEventRow(historyBody, newEvent, firstExisting);
    eventCountEl.textContent = `${recentEvents.length} events`;
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
//  BOOT
// ═══════════════════════════════════════════════════════
checkAuth();
