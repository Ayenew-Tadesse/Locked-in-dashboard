// App state and actions. Views read `state` and re-render on change; every
// write goes through the store (database) first, then updates state.
import { todayKey, weekRange, addDays, eachDay, dayOf } from "./core/dates.js";
import { normalizeTask } from "./core/tasks.js";
import { resolveScoring, scoreDay, scorePeriod } from "./core/scoring.js";

export const state = {
  store: null,
  profile: null,
  settings: { scoring: {} },
  tasks: [],
  milestones: [],
  goals: [],
  daily: {},   // date -> daily_scores row
  weekly: {},  // week_start -> weekly_scores row
  cfg: resolveScoring({}),
  timeZone: undefined,
  get today() { return todayKey(this.timeZone); },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

let toastFn = (msg) => console.log(msg);
export function setToast(fn) { toastFn = fn; }
export function toast(msg, kind) { toastFn(msg, kind); }

async function guard(fn, failMsg) {
  try { return await fn(); }
  catch (e) { console.error(e); toast(`${failMsg}: ${e.message}`, "error"); throw e; }
}

export async function loadAll(store) {
  state.store = store;
  const d = await store.load();
  state.profile = d.profile;
  state.settings = d.settings || { scoring: {} };
  state.cfg = resolveScoring(state.settings.scoring);
  state.timeZone = d.profile?.timezone && d.profile.timezone !== "UTC" ? d.profile.timezone : undefined;
  state.tasks = d.tasks;
  state.milestones = d.milestones;
  state.goals = d.goals;
  state.daily = Object.fromEntries((d.daily || []).map((r) => [r.date, r]));
  state.weekly = Object.fromEntries((d.weekly || []).map((r) => [r.week_start, r]));
  // Remember this device's time zone so the API's "today" matches yours.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (store.mode === "supabase" && tz && d.profile && d.profile.timezone !== tz) {
    store.saveProfile({ timezone: tz }).then((p) => { state.profile = p; }).catch(() => {});
    state.timeZone = tz;
  }
  emit();
  // Keep the last two weeks of score snapshots current (overdue changes daily).
  markDirty(eachDay(addDays(state.today, -14), state.today));
}

// ---------------------------------------------------------------------------
// Score snapshots: recalculated in the browser, stored for history and API notes.
// ---------------------------------------------------------------------------
const dirty = new Set();
let flushTimer = null;
function markDirty(days) {
  days.filter(Boolean).forEach((d) => dirty.add(d));
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushScores, 1200);
}
export async function flushScores() {
  const days = [...dirty].filter((d) => d <= state.today);
  dirty.clear();
  if (!days.length || !state.store) return;
  const opts = { today: state.today, timeZone: state.timeZone };
  const dailyRows = [], weeks = new Set();
  for (const day of days) {
    const s = scoreDay(state.tasks, day, state.cfg, opts);
    weeks.add(weekRange(day).start);
    const old = state.daily[day];
    if (!old && s.score == null && !s.counts.total) continue;
    if (old && old.score == s.score && old.completed_tasks === s.counts.completed && old.total_tasks === s.counts.total) continue;
    dailyRows.push({ date: day, score: s.score, completed_tasks: s.counts.completed, total_tasks: s.counts.total,
      breakdown: { components: s.components, penalty: s.penalty, base: s.base ?? null, minutes: s.minutes } });
  }
  const weeklyRows = [];
  for (const w of weeks) {
    const p = scorePeriod(state.tasks, w, addDays(w, 6), state.cfg, opts);
    const old = state.weekly[w];
    if (!old && p.score == null) continue;
    if (old && old.score == p.score && old.completed_tasks === p.totals.completed && old.total_tasks === p.totals.total) continue;
    weeklyRows.push({ week_start: w, week_end: addDays(w, 6), score: p.score, completed_tasks: p.totals.completed, total_tasks: p.totals.total,
      breakdown: { average_daily_score: p.average_daily_score, active_days: p.active_days, active_days_target: p.active_days_target, consistency: p.consistency } });
  }
  try {
    await state.store.upsertDailyScores(dailyRows);
    await state.store.upsertWeeklyScores(weeklyRows);
    dailyRows.forEach((r) => { state.daily[r.date] = { ...state.daily[r.date], ...r }; });
    weeklyRows.forEach((r) => { state.weekly[r.week_start] = { ...state.weekly[r.week_start], ...r }; });
  } catch (e) { console.warn("Score snapshot not saved", e); }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function refreshProgress() {
  const p = await state.store.refreshProgress();
  state.milestones = p.milestones;
  state.goals = p.goals;
}

export async function saveTask(input) {
  const t = normalizeTask(input, state.today);
  const before = t.id ? state.tasks.find((x) => x.id === t.id) : null;
  const saved = await guard(() => state.store.saveTask(t), "Couldn't save the task");
  const i = state.tasks.findIndex((x) => x.id === saved.id);
  if (i >= 0) state.tasks[i] = saved; else state.tasks.push(saved);
  if (saved.milestone_id || before?.milestone_id) await refreshProgress().catch(() => {});
  markDirty([saved.date, saved.due_date, before?.date, before?.due_date, dayOf(saved.completed_at, state.timeZone), state.today]);
  emit();
  return saved;
}

export async function updateTask(id, patch) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  const next = { ...t, ...patch };
  if (patch.status && patch.status !== "completed" && t.status === "completed" && patch.completion_percentage == null) next.completion_percentage = 0;
  return saveTask(next);
}

export async function deleteTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  await guard(() => state.store.deleteTask(id), "Couldn't delete the task");
  state.tasks = state.tasks.filter((x) => x.id !== id);
  if (t?.milestone_id) await refreshProgress().catch(() => {});
  markDirty([t?.date, t?.due_date]);
  emit();
}

export async function saveMilestone(m) {
  const saved = await guard(() => state.store.saveMilestone(m), "Couldn't save the milestone");
  await refreshProgress().catch(() => {
    const i = state.milestones.findIndex((x) => x.id === saved.id);
    if (i >= 0) state.milestones[i] = saved; else state.milestones.push(saved);
  });
  emit();
  return saved;
}
export async function deleteMilestone(id) {
  await guard(() => state.store.deleteMilestone(id), "Couldn't delete the milestone");
  state.tasks.forEach((t) => { if (t.milestone_id === id) t.milestone_id = null; });
  await refreshProgress().catch(() => { state.milestones = state.milestones.filter((m) => m.id !== id); });
  emit();
}

export async function saveGoal(g) {
  const saved = await guard(() => state.store.saveGoal(g), "Couldn't save the goal");
  await refreshProgress().catch(() => {
    const i = state.goals.findIndex((x) => x.id === saved.id);
    if (i >= 0) state.goals[i] = saved; else state.goals.push(saved);
  });
  emit();
  return saved;
}
export async function deleteGoal(id) {
  await guard(() => state.store.deleteGoal(id), "Couldn't delete the goal");
  await refreshProgress().catch(() => { state.goals = state.goals.filter((g) => g.id !== id); });
  emit();
}

export async function saveDayNote(date, notes) {
  const row = await guard(() => state.store.saveDailyNote(date, notes), "Couldn't save the note");
  state.daily[date] = { ...state.daily[date], ...row };
  emit();
}
export async function saveWeekNote(weekStart, notes) {
  const row = await guard(() => state.store.saveWeeklyNote(weekStart, addDays(weekStart, 6), notes), "Couldn't save the note");
  state.weekly[weekStart] = { ...state.weekly[weekStart], ...row };
  emit();
}

export async function saveScoring(scoring) {
  const s = await guard(() => state.store.saveSettings(scoring), "Couldn't save settings");
  state.settings = { ...state.settings, ...s, scoring };
  state.cfg = resolveScoring(scoring);
  // Past scores change with the formula: refresh the stored last 90 days.
  markDirty(eachDay(addDays(state.today, -90), state.today));
  emit();
}

export async function saveProfile(p) {
  state.profile = await guard(() => state.store.saveProfile(p), "Couldn't save your profile");
  emit();
}

export async function reload() { await loadAll(state.store); }
