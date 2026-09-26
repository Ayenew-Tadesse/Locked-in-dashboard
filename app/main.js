// Entry point for the productivity app. Runs only when the page has a
// Supabase config (config.js) or is a preview (?demo=1 for sample data,
// ?demo=history for the original dashboard's tracking history); otherwise
// the original dashboard runs exactly as before.
import { state, subscribe, loadAll, setToast, updateTask, saveTask } from "./state.js";
import { createSupabaseStore, createMemoryStore } from "./store.js";
import { demoSeed, emptySeed } from "./demo.js";
import { buildYearSetup } from "./plan/setup.js";
import { showAuth, hideAuth } from "./ui/auth.js";
import { showToast, esc, $ } from "./ui/dom.js";
import { openTaskForm } from "./ui/task-ui.js";
import { buildWarnings } from "./core/insights.js";
import { scoreDay, scorePeriod, scoreQuarter } from "./core/scoring.js";
import { weekRange, monthRange, quarterOf, dayOf, formatRange } from "./core/dates.js";
import { renderOverview } from "./views/overview.js";
import { renderToday } from "./views/today.js";
import { renderTasks } from "./views/tasks.js";
import { renderCalendar } from "./views/calendar.js";
import { renderWeek } from "./views/week.js";
import { renderQuarter } from "./views/quarter.js";
import { renderMilestones } from "./views/milestones.js";
import { renderAnalytics } from "./views/analytics.js";
import { renderSettings } from "./views/settings.js";
import { renderTasksCard } from "./views/tasks-card.js";
import { DEFAULT_REPOS, fetchCommits, buildDailyReport, renderDailyReportPdf } from "./report/daily-report.js";

const VIEWS = {
  overview: { label: "Overview", render: renderOverview },
  today: { label: "Today", render: renderToday },
  tasks: { label: "Tasks", render: renderTasks },
  calendar: { label: "Calendar", render: renderCalendar },
  week: { label: "Week", render: renderWeek },
  quarter: { label: "Quarter", render: renderQuarter },
  milestones: { label: "Milestones", render: renderMilestones },
  analytics: { label: "Analytics", render: renderAnalytics },
  settings: { label: "Settings", render: renderSettings },
};

// Tabs in the top row. The other pages stay reachable by link: Tasks and Week
// from the Overview, Quarter from its score tile and the Tasks card, Settings
// from the footer.
const NAV = ["overview", "today", "calendar", "milestones", "analytics"];

const config = window.LOCKEDIN_CONFIG || {};
// Preview modes come from the URL or, for a preview deployment, config.js.
const demoMode = (() => {
  const v = new URLSearchParams(location.search).get("demo") || config.demo;
  return v === "history" ? "history" : v === "1" || v === "sample" || v === true ? "sample" : null;
})();
const demo = !!demoMode;
let started = false;

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [name, id] = path.split("/");
  return { name: VIEWS[name] ? name : "overview", id, params: new URLSearchParams(query) };
}

function renderNav(active) {
  $("#li-nav").innerHTML = `<div class="li-nav-scroll">${NAV.map((k) =>
    `<a href="#/${k === "overview" ? "" : k}" class="li-nav-link${k === active ? " active" : ""}"${k === active ? ' aria-current="page"' : ""}>${VIEWS[k].label}</a>`).join("")}</div>`;
}

const LEVELS = { danger: 0, warn: 1, info: 2 };
// Warnings appear on Overview only, one per kind and at most three; dismissing one
// hides it for the rest of the day on this device.
function dismissed() { try { return JSON.parse(localStorage.getItem("li_dismissed") || "{}"); } catch { return {}; } }
function renderWarnings(active) {
  const box = $("#li-warnings");
  if (active !== "overview") { box.innerHTML = ""; return; }
  const gone = dismissed();
  const list = buildWarnings({ tasks: state.tasks, milestones: state.milestones, goals: state.goals, today: state.today, cfg: state.cfg, timeZone: state.timeZone })
    .filter((w) => !gone[w.id])
    .sort((a, b) => LEVELS[a.level] - LEVELS[b.level])
    .slice(0, 3);
  box.innerHTML = list.map((w) => `<div class="li-warn ${w.level}" role="${w.level === "danger" ? "alert" : "status"}">
    <span class="li-warn-dot" aria-hidden="true"></span><a href="#/${esc(w.route)}">${esc(w.text)}</a>
    <button type="button" class="li-icon-btn" data-dismiss="${esc(w.id)}" aria-label="Dismiss">&#10005;</button></div>`).join("");
}
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-dismiss]");
  if (d) {
    const gone = dismissed();
    gone[d.dataset.dismiss] = state.today;
    // Forget dismissals from earlier days.
    for (const k of Object.keys(gone)) if (gone[k] !== state.today) delete gone[k];
    try { localStorage.setItem("li_dismissed", JSON.stringify(gone)); } catch { /* per-device convenience only */ }
    d.closest(".li-warn").remove();
  }
  const tileLink = e.target.closest(".li-tile[data-href]");
  if (tileLink) location.hash = tileLink.dataset.href;
  const add = e.target.closest("[data-new-task]");
  if (add) openTaskForm({ date: add.dataset.newTask || state.today, milestone_id: add.dataset.milestone || null });
});

function render({ keepFocus } = {}) {
  if (!started) return;
  const r = route();
  renderNav(r.name);
  renderWarnings(r.name);
  const overview = r.name === "overview";
  document.documentElement.classList.toggle("li-subview", !overview);
  const ov = $("#li-overview"), view = $("#li-view");
  ov.hidden = !overview;
  view.hidden = overview;
  const target = overview ? ov : view;
  const scrollY = window.scrollY;
  try {
    VIEWS[r.name].render(target, r.params, r.id);
  } catch (e) {
    console.error(e);
    target.innerHTML = `<p class="li-empty">Something went wrong showing this page: ${esc(e.message)}</p>`;
  }
  if (keepFocus) {
    const q = document.querySelector('#li-filters input[name="q"]');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  window.scrollTo(0, scrollY);
  if (overview) {
    try { renderTasksCard($("#li-tasks-card")); } catch (e) { console.error(e); }
  }
  $("#li-footer-links").innerHTML = `<a href="#/settings" class="li-link${r.name === "settings" ? " active" : ""}"${r.name === "settings" ? ' aria-current="page"' : ""}>Settings</a>`;
  feedLegacy();
}

let lastRoute = null;
window.addEventListener("hashchange", () => {
  const r = route();
  render();
  const key = r.name + "/" + (r.id || "");
  if (key !== lastRoute) { lastRoute = key; if (r.name !== "overview") $("#li-nav").scrollIntoView({ block: "start" }); }
});
window.addEventListener("li:rerender", (e) => render(e.detail || {}));

// ---------------------------------------------------------------------------
// Feed the original dashboard cards (checklist, heatmap, rings, daily report)
// from the database, through the small bridge exposed by index.html.
// ---------------------------------------------------------------------------
function feedLegacy() {
  const L = window.LockedInLegacy;
  if (!L) return;
  const daily = {}, contributions = {}, reports = {};
  for (const t of state.tasks) {
    if (t.status === "cancelled") continue;
    (daily[t.date] = daily[t.date] || { tasks: [] }).tasks.push({ id: t.id, text: t.title, done: t.status === "completed" });
    if (t.status === "completed") {
      const d = dayOf(t.completed_at, state.timeZone) || t.date;
      const c = (contributions[d] = contributions[d] || { count: 0, repos: {}, items: [] });
      const cat = t.category || "Tasks";
      c.count++;
      c.repos[cat] = (c.repos[cat] || 0) + 1;
      c.items.push({ repo: cat, text: t.title });
    }
  }
  for (const [d, row] of Object.entries(state.daily)) if (row.notes) reports[d] = { summary: row.notes };

  const today = state.today, opts = { today, timeZone: state.timeZone };
  const day = scoreDay(state.tasks, today, state.cfg, opts);
  const wk = weekRange(today), mo = monthRange(today), q = quarterOf(today);
  const week = scorePeriod(state.tasks, wk.start, wk.end, state.cfg, opts);
  const month = scorePeriod(state.tasks, mo.start, mo.end, state.cfg, opts);
  const quarter = scoreQuarter(state.tasks, state.goals, q.quarter, q.year, state.cfg, opts);
  const left = day.counts.total - day.counts.completed;
  const scores = {
    day: { pct: day.score, title: "Today", short: "Today",
      left: !day.counts.total ? ["No tasks yet", "No tasks"] : left ? [`${left} task${left === 1 ? "" : "s"} left`, `${left} left`] : ["All tasks done", "Done"],
      range: [`${day.counts.completed} of ${day.counts.total} done`, `${day.counts.completed}/${day.counts.total}`] },
    week: { pct: week.score, title: "This week", short: "Week",
      left: [`${week.active_days} of ${week.active_days_target} active days`, `${week.active_days} active day${week.active_days === 1 ? "" : "s"}`],
      range: [formatRange(wk.start, wk.end), formatRange(wk.start, wk.end)] },
    month: { pct: month.score, title: "This month", short: "Month",
      left: [`${month.totals.completed}/${month.totals.total} tasks done`, `${month.totals.completed}/${month.totals.total}`],
      range: [formatRange(mo.start, mo.end), formatRange(mo.start, mo.end)] },
    quarter: { pct: quarter.score, title: "This quarter", short: "Quarter",
      left: [quarter.goal_progress == null ? "No goals yet" : `Goals ${Math.round(quarter.goal_progress)}% done`, quarter.goal_progress == null ? "No goals" : `Goals ${Math.round(quarter.goal_progress)}%`],
      range: [`Q${q.quarter} · ${formatRange(quarter.start, quarter.end)}`, `Q${q.quarter} ${q.year}`] },
  };
  L.update({ daily, contributions, reports, scores, unit: ["task completed", "tasks completed"] });
}

// ---------------------------------------------------------------------------
// Daily report PDF: a button on the (original) Daily report card. It uses the
// day the card is showing, so past days can be downloaded too.
// ---------------------------------------------------------------------------
function addReportPdfButton() {
  const nav = document.querySelector("#report-card .report-nav");
  if (!nav || document.getElementById("li-report-pdf")) return;
  nav.insertAdjacentHTML("afterend", `<div class="li-report-actions">
    <button type="button" class="li-btn small" id="li-report-pdf">Download PDF</button>
    <span class="li-sub">What was modified, how, and what problem it solved</span></div>`);
  document.getElementById("li-report-pdf").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const day = window.LockedInLegacy?.reportDay?.() || state.today;
    btn.disabled = true;
    btn.textContent = "Preparing…";
    try {
      const github = await fetchCommits(state.settings.preferences?.githubRepos || DEFAULT_REPOS, day);
      const s = scoreDay(state.tasks, day, state.cfg, { today: state.today, timeZone: state.timeZone });
      const report = buildDailyReport({ day, tasks: state.tasks, milestones: state.milestones, dailyNote: state.daily[day]?.notes,
        score: s.score, github, timeZone: state.timeZone });
      const doc = await renderDailyReportPdf(report);
      doc.save(`locked-in-daily-report-${day}.pdf`);
      showToast("Daily report downloaded");
    } catch (err) {
      console.error(err);
      showToast("Couldn't make the PDF: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Download PDF";
    }
  });
}

// Hooks the original "Today's checklist" card uses in app mode (installed at start).
const legacyHooks = {
  toggleTask(id, done) {
    updateTask(id, { status: done ? "completed" : "not_started" }).catch(() => {});
  },
  addTask(text) {
    saveTask({ title: text, date: state.today }).then(() => showToast("Task added"), () => {});
  },
  openToday() { location.hash = "#/today"; },
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function start(store) {
  if (started) return;
  hideAuth();
  try {
    await loadAll(store);
  } catch (e) {
    console.error(e);
    showAuth(store, { message: "Couldn't load your data: " + e.message });
    return;
  }
  started = true;
  window.LockedInHooks = legacyHooks;
  addReportPdfButton();
  document.documentElement.classList.remove("app-booting");
  $("#footnote").textContent = store.mode === "demo"
    ? (demoMode === "history"
      ? "Preview with your tracking history from the original dashboard. Changes you make here aren't saved."
      : "Demo mode: sample data held in memory only. Nothing you change here is saved.")
    : "Your tasks, scores and milestones are saved to your database and sync across devices.";
  subscribe(() => render());
  // Roll over at midnight.
  let day = state.today;
  setInterval(() => { if (state.today !== day) { day = state.today; render(); } }, 60000);
  render();
}

async function boot() {
  window.__lockedInBoot = true;
  setToast(showToast);
  let store;
  try {
    if (demoMode === "history") {
      // The original dashboard's history plus the year plan, loaded through
      // the same import the real app uses (Settings -> Set up my year).
      store = createMemoryStore(emptySeed());
      await store.importData(buildYearSetup(window.LockedInLegacy.data(), store.newId));
      await store.markLegacyImported();
      await store.markPlanLoaded();
    } else {
      store = demo ? createMemoryStore(demoSeed()) : await createSupabaseStore(config);
    }
  } catch (e) {
    console.error(e);
    document.documentElement.classList.remove("app-booting");
    showToast("Couldn't reach the database library. Check your connection and reload.", "error");
    return;
  }
  // Previews keep the original password screen and its Log out button.
  if (store.mode === "supabase") {
    document.getElementById("logout-btn").hidden = false;
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await store.auth.signOut();
      location.hash = "";
      location.reload();
    });
  }
  const session = await store.auth.session();
  document.documentElement.classList.remove("app-booting");
  if (store.mode === "supabase") {
    let recovering = false;
    store.auth.onChange((s, event) => {
      // A password-reset link signs you in first; ask for the new password.
      if (event === "PASSWORD_RECOVERY") { recovering = true; showAuth(store, { mode: "update" }); return; }
      if (event === "USER_UPDATED" && recovering) { recovering = false; start(store); return; }
      if (s && !started && !recovering) start(store);
      if (!s && started) location.reload();
    });
  }
  if (session) start(store); else showAuth(store);
}

if (demo || config.supabaseUrl) boot();
