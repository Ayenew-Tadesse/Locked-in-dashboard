// Entry point for the productivity app. Runs only when the page has a
// Supabase config (config.js) or is a preview (?demo=1 for sample data,
// ?demo=history for the original dashboard's tracking history); otherwise
// the original dashboard runs exactly as before.
import { state, subscribe, loadAll, setToast, updateTask, saveTask, saveProfile, seedProjects } from "./state.js";
import { createSupabaseStore, createMemoryStore } from "./store.js";
import { demoSeed, emptySeed } from "./demo.js";
import { buildYearSetup } from "./plan/setup.js";
import { showAuth, hideAuth } from "./ui/auth.js";
import { showToast, esc, $, openModal } from "./ui/dom.js";
import { displayName, needsProfile, greetingOptions } from "./core/people.js";
import { openTaskForm, completeTask } from "./ui/task-ui.js";
import { buildWarnings } from "./core/insights.js";
import { scoreDay, scorePeriod, scoreQuarter } from "./core/scoring.js";
import { weekRange, monthRange, quarterOf, dayOf, formatRange } from "./core/dates.js";
import { isOverdue } from "./core/tasks.js";
import { renderOverview } from "./views/overview.js";
import { renderToday } from "./views/today.js";
import { renderTasks } from "./views/tasks.js";
import { renderCalendar } from "./views/calendar.js";
import { renderWeek } from "./views/week.js";
import { renderQuarter } from "./views/quarter.js";
import { renderMilestones } from "./views/milestones.js";
import { renderAnalytics } from "./views/analytics.js";
import { renderSettings } from "./views/settings.js";
import { renderProfile } from "./views/profile.js";
import { renderProjects } from "./views/projects.js";
import { renderProjectCards } from "./views/project-cards.js";
import { setupMenu } from "./ui/menu.js";
import { renderTeam } from "./views/team.js";
import { renderTasksCard } from "./views/tasks-card.js";
import { renderTeamCard } from "./views/team-card.js";
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
  profile: { label: "Profile", render: renderProfile },
  projects: { label: "Projects", render: renderProjects },
  team: { label: "Team", render: renderTeam },
};

// Tabs in the top row. The other pages stay reachable by link: Tasks and Week
// from the Overview, Quarter from its score tile and the Tasks card, Profile
// and Settings from the ☰ menu (top left).
const NAV = ["overview", "today", "tasks", "calendar", "milestones", "analytics"];

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

// The tab row is wider than a phone: it's built once (so redraws don't snap
// it back to the start), and the chosen tab slides to the middle so its
// neighbours are visible. Fades on the edges show there's more to scroll.
let navActive = null;
function renderNav(active) {
  const tabs = state.isOwner ? [...NAV, "team"] : NAV; // Team: owner only
  let sc = $("#li-nav .li-nav-scroll");
  const fresh = !sc || sc.dataset.tabs !== tabs.join();
  if (fresh) {
    $("#li-nav").innerHTML = `<div class="li-nav-scroll" data-tabs="${tabs.join()}">${tabs.map((k) =>
      `<a href="#/${k === "overview" ? "" : k}" class="li-nav-link" data-view="${k}">${VIEWS[k].label}</a>`).join("")}</div>`;
    sc = $("#li-nav .li-nav-scroll");
    sc.addEventListener("scroll", () => navFades(sc), { passive: true });
    window.addEventListener("resize", () => navFades(sc));
  }
  let current = null;
  // A dot with a count on Tasks while you have unfinished tasks (red if any are overdue).
  const open = state.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const late = open.some((t) => isOverdue(t, state.today));
  const tasksTab = sc.querySelector('[data-view="tasks"]');
  if (tasksTab) {
    let dot = tasksTab.querySelector(".li-nav-dot");
    if (!dot) { dot = document.createElement("span"); dot.className = "li-nav-dot"; tasksTab.append(dot); }
    dot.hidden = !open.length;
    dot.textContent = open.length > 99 ? "99+" : String(open.length);
    dot.classList.toggle("late", late);
    tasksTab.setAttribute("aria-label", open.length ? `Tasks, ${open.length} unfinished${late ? ", some overdue" : ""}` : "Tasks");
  }
  sc.querySelectorAll(".li-nav-link").forEach((a) => {
    const on = a.dataset.view === active;
    a.classList.toggle("active", on);
    if (on) { a.setAttribute("aria-current", "page"); current = a; } else a.removeAttribute("aria-current");
  });
  if (current && (fresh || active !== navActive)) centerTab(sc, current, !fresh);
  navActive = active;
  navFades(sc);
}
function centerTab(sc, tab, smooth) {
  // While the page is still hidden (loading) the row has no width: retry once it shows.
  if (!sc.clientWidth) { requestAnimationFrame(() => { if (sc.clientWidth) { centerTab(sc, tab, false); navFades(sc); } }); return; }
  const left = tab.offsetLeft - (sc.clientWidth - tab.offsetWidth) / 2;
  const motion = smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  sc.scrollTo({ left: Math.max(0, left), behavior: motion ? "smooth" : "auto" });
}
function navFades(sc) {
  const max = sc.scrollWidth - sc.clientWidth;
  sc.classList.toggle("fade-l", sc.scrollLeft > 2);
  sc.classList.toggle("fade-r", sc.scrollLeft < max - 2);
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
  if (add && state.canAddTasks) openTaskForm({ date: add.dataset.newTask || state.today, milestone_id: add.dataset.milestone || null });
});

// Pages from the ☰ menu open full screen (no greeting, quote or tabs) with
// a Back button to the main page.
const MENU_PAGES = new Set(["profile", "projects", "settings"]);
let mainHash = "#/", mainScroll = 0, fromMain = false, restoreScroll = null;
function syncPageMode(r) {
  const page = MENU_PAGES.has(r.name);
  const was = document.documentElement.classList.contains("li-page");
  if (page && !was) { mainScroll = window.scrollY; fromMain = !!started && navReady; }
  document.documentElement.classList.toggle("li-page", page);
  $("#li-pagebar").hidden = !page;
  if (page) {
    $("#li-page-title").textContent = VIEWS[r.name].label;
    $("#li-back").setAttribute("href", mainHash);
    if (!was) window.scrollTo(0, 0);
  } else {
    if (was) restoreScroll = mainScroll;
    mainHash = location.hash || "#/";
  }
  return page;
}
let navReady = false;
// Back: return to where you were on the main page (like the phone's back).
document.addEventListener("click", (e) => {
  if (!e.target.closest("#li-back")) return;
  e.preventDefault();
  if (fromMain) history.back(); else location.hash = mainHash;
});

function render() {
  if (!started) return;
  showMyName();
  const r = route();
  syncPageMode(r);
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
  window.scrollTo(0, scrollY);
  navReady = true;
  if (overview) {
    // Colleagues: no adding tasks and no year countdown (their tasks count down
    // instead); their Tasks card is read-only.
    document.documentElement.classList.toggle("li-colleague", state.isColleague);
    try { renderTasksCard($("#li-tasks-card")); } catch (e) { console.error(e); }
    try { renderTeamCard($("#li-team-card")); } catch (e) { console.error(e); }
    try { renderProjectCards($("#li-projects")); } catch (e) { console.error(e); }
  }
  feedLegacy();
  // Back from a full-screen page: return to where you were, once everything is drawn.
  if (restoreScroll != null) { window.scrollTo(0, restoreScroll); restoreScroll = null; }
}

let lastRoute = null;
window.addEventListener("hashchange", () => {
  const r = route();
  render();
  const key = r.name + "/" + (r.id || "");
  if (key !== lastRoute) { lastRoute = key; if (r.name !== "overview") $("#li-nav").scrollIntoView({ block: "start" }); }
});
window.addEventListener("li:rerender", () => render());

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
      const report = buildDailyReport({ day, tasks: state.tasks, milestones: state.milestones, files: state.files || [], dailyNote: state.daily[day]?.notes,
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
    const t = state.tasks.find((x) => x.id === id);
    if (done && t) { completeTask(t); return; }
    updateTask(id, { status: done ? "completed" : "not_started" }).catch(() => {});
  },
  addTask(text) {
    if (!state.canAddTasks) return;
    saveTask({ title: text, date: state.today }).then(() => showToast("Task added"), () => {});
  },
  openToday() { location.hash = "#/today"; },
};

// Each person is greeted by their own name and chosen title, e.g.
// "Good morning, Mr. Ayenew Shiferaw". Previews keep the original heading.
function showMyName() {
  if (state.store?.mode !== "supabase") return;
  const name = displayName(state.profile);
  const h1 = document.querySelector(".wrap > h1");
  if (name && h1.textContent !== name) h1.textContent = name;
}

// Asked once after sign-in when the name or "Greet me as" is missing
// (e.g. accounts created before this was on the sign-up form).
function askForProfile() {
  openModal({
    eyebrow: "Welcome",
    title: "How should we greet you?",
    submitLabel: "Save",
    body: `<p class="li-sub">Your team sees your name instead of your email. You can change both later in Settings.</p>
      <label class="li-field">Your name<input name="name" maxlength="120" required autocomplete="name" value="${esc(state.profile?.name || "")}"></label>
      <label class="li-field">Greet me as<select name="greeting" required><option value="">Choose…</option>${greetingOptions(state.profile?.greeting || "")}</select></label>`,
    async onSubmit(v) {
      if (!v.name.trim()) throw new Error("Enter your name.");
      if (!v.greeting) throw new Error("Choose how you'd like to be greeted.");
      await saveProfile({ name: v.name.trim(), greeting: v.greeting });
      showToast("Nice to meet you, " + displayName(state.profile) + "!");
    },
  });
}

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
    document.documentElement.classList.remove("app-booting");
    showAuth(store, { message: "Couldn't load your data: " + e.message });
    return;
  }
  // First time with the projects table: copy the original dashboard's apps in.
  await seedProjects(window.LockedInLegacy?.data());
  started = true;
  window.LockedInHooks = legacyHooks;
  setupMenu({ onLogout: () => document.getElementById("logout-btn").click() });
  addReportPdfButton();
  // The Objective card: right under the Tasks card (and the daily report) on
  // tablets and up; last on phones (Tasks, Activity, apps, Objective).
  const phone = matchMedia("(max-width: 699px)");
  const placeObjective = () => {
    const obj = document.querySelector(".obj-section");
    if (phone.matches) document.querySelector(".dash-col-b")?.append(obj);
    else document.getElementById("report-card")?.after(obj);
  };
  placeObjective();
  phone.addEventListener("change", placeObjective);
  $("#footnote").textContent = store.mode === "demo"
    ? (demoMode === "history"
      ? "Preview with your tracking history from the original dashboard. Changes you make here aren't saved."
      : "Demo mode: sample data held in memory only. Nothing you change here is saved.")
    : "Your tasks, scores and milestones are saved to your database and sync across devices.";
  subscribe(() => render());
  if (store.mode === "supabase" && needsProfile(state.profile)) askForProfile();
  // Roll over at midnight.
  let day = state.today;
  setInterval(() => { if (state.today !== day) { day = state.today; render(); } }, 60000);
  render();
  // Reveal only now that the new design is drawn (no flash of the original page).
  document.documentElement.classList.remove("app-booting");
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
      await store.importData(buildYearSetup(window.LockedInLegacy.data(), store.newId, { teamId: "team-preview" }));
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
  // The page stays hidden (with a loading spinner) until start() has loaded
  // the data and drawn the app, so the original dashboard underneath never
  // flashes on refresh. Signing in shows its own screen.
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
  if (session) start(store);
  else { document.documentElement.classList.remove("app-booting"); showAuth(store); }
}

if (demo || config.supabaseUrl) boot();
