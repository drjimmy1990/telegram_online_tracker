/**
 * Chart.js integration — Activity area chart + Weekly bar chart.
 * Uses the global Chart object loaded from CDN.
 */

let activityChartInstance = null;
let weeklyChartInstance = null;

/**
 * Render hourly activity area chart.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} hourlyMinutes — 24-element array of online minutes per hour
 */
export function renderActivityChart(canvas, hourlyMinutes) {
  if (activityChartInstance) {
    activityChartInstance.destroy();
    activityChartInstance = null;
  }

  const ctx = canvas.getContext("2d");

  // Create gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight);
  gradient.addColorStop(0, "rgba(16, 185, 129, 0.35)");
  gradient.addColorStop(0.5, "rgba(16, 185, 129, 0.08)");
  gradient.addColorStop(1, "rgba(16, 185, 129, 0)");

  const labels = Array.from({ length: 24 }, (_, i) =>
    `${i.toString().padStart(2, "0")}:00`
  );

  activityChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Online Minutes",
          data: hourlyMinutes,
          fill: true,
          backgroundColor: gradient,
          borderColor: "#10b981",
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#10b981",
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          titleColor: "#f1f5f9",
          bodyColor: "#94a3b8",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: "'Inter', sans-serif", weight: "600" },
          bodyFont: { family: "'JetBrains Mono', monospace" },
          callbacks: {
            label: (ctx) => `${Math.round(ctx.parsed.y)}m online`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
          ticks: {
            color: "#475569",
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            maxTicksLimit: 12,
          },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
          ticks: {
            color: "#475569",
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: (v) => `${v}m`,
          },
          beginAtZero: true,
        },
      },
    },
  });
}

/**
 * Render 7-day overview bar chart.
 * @param {HTMLCanvasElement} canvas
 * @param {{ label: string, hours: number }[]} dailyData — 7 items
 */
export function renderWeeklyChart(canvas, dailyData) {
  if (weeklyChartInstance) {
    weeklyChartInstance.destroy();
    weeklyChartInstance = null;
  }

  const ctx = canvas.getContext("2d");

  // Create gradient for bars
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight);
  gradient.addColorStop(0, "rgba(6, 182, 212, 0.6)");
  gradient.addColorStop(1, "rgba(6, 182, 212, 0.1)");

  weeklyChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dailyData.map((d) => d.label),
      datasets: [
        {
          label: "Online Hours",
          data: dailyData.map((d) => d.hours),
          backgroundColor: gradient,
          borderColor: "rgba(6, 182, 212, 0.5)",
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          titleColor: "#f1f5f9",
          bodyColor: "#94a3b8",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(1)}h online`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#475569",
            font: { family: "'Inter', sans-serif", size: 11 },
          },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.03)", drawBorder: false },
          ticks: {
            color: "#475569",
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: (v) => `${v}h`,
          },
          beginAtZero: true,
        },
      },
    },
  });
}
