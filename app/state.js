// App state and actions. Views read `state` and re-render on change; every
// write goes through the store (database) first, then updates state.
import { todayKey, weekRange, addDays, eachDay, dayOf } from "./core/dates.js";
import { normalizeTask } from "./core/tasks.js";
import { resolveScoring, scoreDay, scorePeriod } from "./core/scoring.js";
import { displayName } from "./core/people.js";
import { projectsFromLegacy } from "./core/projects.js";

export const state = {
  store: null,
  profile: null,
  settings: { scoring: {} },
  tasks: [],      // your own tasks (Today, scores, your reports)
  teamTasks: [],
  projects: [],   // the team's projects (null: the projects table isn't set up yet)
  messages: [],   // team chat (null: the messages table isn't set up yet)
  files: [],      // files shared on tasks (null: the task_files table isn't set up yet)  // teammates' tasks the owner can see (Team page)
  me: null,
  team: null,     // { id, name, role }
  members: [],    // [{ user_id, role, name, email }]
  invites: [],
  get isOwner() { return this.team?.role === "owner"; },
  // Colleagues work on the tasks the owner gives them; only the owner (or
  // someone without a team) adds new ones. The database enforces the same.
  get isColleague() { return !!this.team && !this.isOwner; },
  get canAddTasks() { return !this.isColleague; },
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
  state.projects = d.projects === undefined ? [] : d.projects;
  state.files = d.files === undefined ? [] : d.files;
  state.messages = d.messages === undefined ? [] : d.messages; // null: the chat table isn't set up yet
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

// ---------------------------------------------------------------------------
// Assignments: the owner gives one task to several people. Each person gets
// their own copy (own progress, files and learning log); the copies share a
// group_id so the owner can edit, extend, revoke or delete them together.
// ---------------------------------------------------------------------------

// The fields every copy of an assignment shares.
export const SHARED_TASK_FIELDS = ["title", "description", "date", "due_date", "priority", "category", "milestone_id", "estimated_minutes", "notes"];
const pickShared = (t) => Object.fromEntries(SHARED_TASK_FIELDS.filter((k) => k in t).map((k) => [k, t[k]]));
// group_id is only kept once the database has the column (any loaded task shows it).
const groupsSupported = () => [...state.tasks, ...state.teamTasks].some((t) => "group_id" in t) || state.store?.mode !== "supabase";

/** Every copy of the assignment `t` belongs to (just `t` when it isn't shared). */
export function assignmentOf(t) {
  if (!t?.group_id) return t ? [t] : [];
  return [...state.tasks, ...state.teamTasks].filter((x) => x.group_id === t.group_id);
}

/** The owner's pushed tasks, one entry per assignment: [{ key, copies }], newest first. */
export function myAssignments() {
  const all = [...state.tasks, ...state.teamTasks];
  const groups = new Map();
  for (const t of all) {
    const pushed = t.assigned_by === state.me && t.user_id !== state.me;
    if (!pushed && !t.group_id) continue;
    const key = t.group_id || t.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups].map(([key, copies]) => ({ key, copies }))
    .filter((g) => g.copies.some((t) => t.assigned_by === state.me && t.user_id !== state.me))
    .sort((a, b) => String(b.copies[0].created_at || "~").localeCompare(String(a.copies[0].created_at || "~")));
}

/** Creates the task for each person in `userIds` (one copy each). */
export async function assignTask(fields, userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) throw new Error("Choose at least one person.");
  const group_id = ids.length > 1 && groupsSupported() ? state.store.newId() : undefined;
  const saved = [];
  for (const user_id of ids) saved.push(await saveTask({ ...fields, user_id, ...(group_id ? { group_id } : {}) }));
  return saved;
}

/** Gives an existing assignment to one more person. */
export async function addPersonToAssignment(t, userId) {
  const copies = assignmentOf(t);
  if (copies.some((c) => c.user_id === userId)) throw new Error(`${memberName(userId)} already has this task.`);
  let group_id = t.group_id;
  if (!group_id && groupsSupported()) {
    group_id = state.store.newId();
    await saveTask({ ...t, group_id });
  }
  return saveTask({ ...pickShared(t), user_id: userId, status: "not_started", completion_percentage: 0, ...(group_id ? { group_id } : {}) });
}

/** Changes the shared details on every copy; each person's progress stays. */
export async function editAssignment(t, fields) {
  for (const c of assignmentOf(t)) await saveTask({ ...c, ...pickShared(fields) });
}

/** Takes the task away from one person. */
export async function revokeAssignment(copy) { return deleteTask(copy.id); }

/** Removes the task from everyone. */
export async function deleteAssignment(t) {
  for (const c of assignmentOf(t)) await deleteTask(c.id);
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
  // Keep your own row on the Team page in step with the new name/title.
  state.members = state.members.map((m) => m.user_id === state.me ? { ...m, name: displayName(state.profile) || m.name, greeting: state.profile.greeting || null } : m);
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
  // Their account and data are gone, and team milestone progress changed: reload everything.
  await loadAll(state.store);
}
export async function renameTeam(name) {
  await guard(() => state.store.renameTeam(state.team.id, name), "Couldn't rename the team");
  state.team = { ...state.team, name };
  emit();
}

// ---------------------------------------------------------------------------
// Projects (owner edits; everyone on the team reads)
// ---------------------------------------------------------------------------
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at || "").localeCompare(String(b.created_at || ""));

/** Copies the original dashboard's apps in once, the first time the owner has none. */
export async function seedProjects(legacy) {
  if (!state.isOwner || !Array.isArray(state.projects) || state.projects.length || state.settings.preferences?.projectsSeeded) return;
  const rows = projectsFromLegacy(legacy);
  if (!rows.length) return;
  try {
    for (const r of rows) state.projects.push(await state.store.saveProject(state.team.id, r));
    const s = await state.store.savePreferences({ ...(state.settings.preferences || {}), projectsSeeded: true });
    state.settings = { ...state.settings, ...s };
  } catch (e) { console.error("Couldn't copy the projects in", e); }
  state.projects.sort(byPosition);
  emit();
}

export async function saveProject(p) {
  const row = p.id ? p : { ...p, position: state.projects.reduce((m, x) => Math.max(m, (x.position ?? 0) + 1), 0) };
  const saved = await guard(() => state.store.saveProject(state.team.id, row), "Couldn't save the project");
  state.projects = [...state.projects.filter((x) => x.id !== saved.id), saved].sort(byPosition);
  emit();
  return saved;
}
export async function deleteProject(id) {
  await guard(() => state.store.deleteProject(id), "Couldn't delete the project");
  state.projects = state.projects.filter((x) => x.id !== id);
  emit();
}
/** Moves a project one place up (-1) or down (+1). */
export async function moveProject(id, dir) {
  const list = [...state.projects].sort(byPosition);
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const changed = list.map((x, k) => ({ ...x, position: k })).filter((x, k) => x.position !== state.projects.find((y) => y.id === x.id)?.position || k === i || k === j);
  const saved = await guard(() => Promise.all(changed.map((x) => state.store.saveProject(state.team.id, { id: x.id, position: x.position }))), "Couldn't reorder");
  const map = new Map(saved.map((x) => [x.id, x]));
  state.projects = list.map((x, k) => map.get(x.id) || { ...x, position: k }).sort(byPosition);
  emit();
}
/** Ticks or unticks one checklist item. */
export async function toggleProjectItem(projectId, itemId) {
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return;
  const checklist = (p.checklist || []).map((it) => it.id === itemId ? { ...it, done: !it.done } : it);
  return saveProject({ id: p.id, checklist });
}

// ---------------------------------------------------------------------------
// Files shared on tasks
// ---------------------------------------------------------------------------
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function filesFor(taskId) { return (state.files || []).filter((f) => f.task_id === taskId); }

/** A colleague finishing a task the owner assigned them has to share a file. */
export function needsFiles(t) {
  return Array.isArray(state.files) && !!t && !!t.assigned_by && t.assigned_by !== state.me && (t.user_id || state.me) === state.me;
}

export async function uploadFiles(task, files) {
  const out = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is over 10 MB.`);
    const saved = await guard(() => state.store.uploadTaskFile(task, file), `Couldn't upload "${file.name}"`);
    state.files.push(saved);
    out.push(saved);
  }
  emit();
  return out;
}
export async function deleteFile(f) {
  await guard(() => state.store.deleteTaskFile(f), "Couldn't remove the file");
  state.files = state.files.filter((x) => x.id !== f.id);
  emit();
}

// ---------------------------------------------------------------------------
// Team chat. Messages change often, so they don't redraw the page: the chat
// listens for "li:messages" instead.
// ---------------------------------------------------------------------------
const chatChanged = () => window.dispatchEvent(new CustomEvent("li:messages"));

export function receiveMessage(m) {
  if (!Array.isArray(state.messages) || !m || state.messages.some((x) => x.id === m.id)) return;
  state.messages.push(m);
  chatChanged();
}
export function forgetMessage(id) {
  if (!Array.isArray(state.messages)) return;
  state.messages = state.messages.filter((x) => x.id !== id);
  chatChanged();
}
export async function sendMessage(body, recipientId = null) {
  const text = String(body || "").trim();
  if (!text) return null;
  if (text.length > 2000) throw new Error("Keep messages under 2,000 characters.");
  const saved = await guard(() => state.store.sendMessage({ team_id: state.team.id, recipient_id: recipientId, body: text }), "Couldn't send the message");
  receiveMessage(saved);
  return saved;
}
export async function deleteMessage(id) {
  await guard(() => state.store.deleteMessage(id), "Couldn't delete the message");
  forgetMessage(id);
}
