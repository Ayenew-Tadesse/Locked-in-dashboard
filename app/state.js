// App state and actions. Views read `state` and re-render on change; every
// write goes through the store (database) first, then updates state.
import { todayKey, weekRange, addDays, eachDay, dayOf } from "./core/dates.js";
import { normalizeTask } from "./core/tasks.js";
import { resolveScoring, scoreDay, scorePeriod } from "./core/scoring.js";

export const state = {
  store: null,
  profile: null,
  settings: { scoring: {} },
  tasks: [],      // your own tasks (Today, scores, your reports)
  teamTasks: [],  // teammates' tasks the owner can see (Team page)
  me: null,
  team: null,     // { id, name, role }
  members: [],    // [{ user_id, role, name, email }]
  invites: [],
  get isOwner() { return this.team?.role === "owner"; },
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
  state.me = d.me || null;
  state.team = d.team || null;
  state.members = d.members || [];
  state.invites = d.invites || [];
  const mine = (t) => !state.me || !t.user_id || t.user_id === state.me;
  state.tasks = d.tasks.filter(mine);
  state.teamTasks = d.tasks.filter((t) => !mine(t));
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

/** Any task you can see: yours or (for the owner) a teammate's. */
export function findTask(id) {
  return state.tasks.find((x) => x.id === id) || state.teamTasks.find((x) => x.id === id) || null;
}
export function memberName(userId) {
  if (!userId) return null;
  if (userId === state.me) return "you";
  return state.members.find((m) => m.user_id === userId)?.name || "a teammate";
}
function placeTask(saved) {
  state.tasks = state.tasks.filter((x) => x.id !== saved.id);
  state.teamTasks = state.teamTasks.filter((x) => x.id !== saved.id);
  const mine = !state.me || !saved.user_id || saved.user_id === state.me;
  (mine ? state.tasks : state.teamTasks).push(saved);
}

export async function saveTask(input) {
  const t = normalizeTask(input, state.today);
  const before = t.id ? findTask(t.id) : null;
  const saved = await guard(() => state.store.saveTask(t), "Couldn't save the task");
  placeTask(saved);
  if (saved.milestone_id || before?.milestone_id) await refreshProgress().catch(() => {});
  markDirty([saved.date, saved.due_date, before?.date, before?.due_date, dayOf(saved.completed_at, state.timeZone), state.today]);
  emit();
  return saved;
}

export async function updateTask(id, patch) {
  const t = findTask(id);
  if (!t) return;
  const next = { ...t, ...patch };
  if (patch.status && patch.status !== "completed" && t.status === "completed" && patch.completion_percentage == null) next.completion_percentage = 0;
  return saveTask(next);
}

export async function deleteTask(id) {
  const t = findTask(id);
  await guard(() => state.store.deleteTask(id), "Couldn't delete the task");
  state.tasks = state.tasks.filter((x) => x.id !== id);
  state.teamTasks = state.teamTasks.filter((x) => x.id !== id);
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

// ---------------------------------------------------------------------------
// Team (owner)
// ---------------------------------------------------------------------------
async function refreshTeam() {
  const t = await state.store.loadTeam();
  state.team = t.team; state.members = t.members; state.invites = t.invites;
}
export async function inviteMember(email) {
  await guard(() => state.store.inviteMember(state.team.id, email), "Couldn't invite");
  await refreshTeam();
  emit();
}
export async function revokeInvite(id) {
  await guard(() => state.store.revokeInvite(id), "Couldn't cancel the invitation");
  await refreshTeam();
  emit();
}
export async function removeMember(userId) {
  await guard(() => state.store.removeMember(state.team.id, userId), "Couldn't remove the member");
  state.teamTasks = state.teamTasks.filter((t) => t.user_id !== userId);
  await refreshTeam();
  emit();
}
export async function renameTeam(name) {
  await guard(() => state.store.renameTeam(state.team.id, name), "Couldn't rename the team");
  state.team = { ...state.team, name };
  emit();
}
