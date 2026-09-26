// Task vocabulary and rules shared by the app and the API.
import { addDays, dayOf, weekRange } from "./dates.js";

export const STATUSES = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
  cancelled: "Cancelled",
};
/** Statuses that can be stored; "overdue" is always derived. */
export const STORED_STATUSES = ["not_started", "in_progress", "completed", "cancelled"];

export const PRIORITIES = {
  low: { label: "Low", rank: 1 },
  medium: { label: "Medium", rank: 2 },
  high: { label: "High", rank: 3 },
  urgent: { label: "Urgent", rank: 4 },
};

export function isClosed(t) { return t.status === "completed" || t.status === "cancelled"; }

/** Overdue = has a deadline before `today` and isn't completed or cancelled. */
export function isOverdue(t, today) {
  return !isClosed(t) && !!t.due_date && t.due_date < today;
}

export function effectiveStatus(t, today) {
  return isOverdue(t, today) ? "overdue" : t.status;
}

/** The day a completed task was finished (in `timeZone`, default local). */
export function completedDay(t, timeZone) {
  return t.status === "completed" ? dayOf(t.completed_at, timeZone) || t.date : null;
}

/** Was this task still open (overdue) at the end of `day`? */
export function wasOverdueOn(t, day, timeZone) {
  if (t.status === "cancelled" || !t.due_date || t.due_date >= day) return false;
  const done = completedDay(t, timeZone);
  return !done || done > day;
}

/**
 * Filters: { q, status, priority, category, milestone, from, to, deadline }.
 * status may be any STATUSES key (overdue is matched on the derived status);
 * milestone may be an id or "none"; deadline one of overdue|today|week|next7|none|any.
 */
export function filterTasks(tasks, f = {}, today) {
  const q = (f.q || "").trim().toLowerCase();
  const week = weekRange(today);
  return tasks.filter((t) => {
    if (q && ![t.title, t.description, t.notes, t.category].some((s) => s && s.toLowerCase().includes(q))) return false;
    if (f.status && effectiveStatus(t, today) !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.category && (t.category || "") !== f.category) return false;
    if (f.milestone === "none" && t.milestone_id) return false;
    if (f.milestone && f.milestone !== "none" && t.milestone_id !== f.milestone) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    switch (f.deadline) {
      case "overdue": return isOverdue(t, today);
      case "today": return t.due_date === today;
      case "week": return !!t.due_date && t.due_date >= week.start && t.due_date <= week.end;
      case "next7": return !!t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7);
      case "none": return !t.due_date;
      default: return true;
    }
  });
}

const STATUS_ORDER = { overdue: 0, in_progress: 1, not_started: 2, completed: 3, cancelled: 4 };
/** Open work first (overdue, then in progress), then by priority, deadline and title. */
export function sortTasks(tasks, today) {
  return tasks.slice().sort((a, b) =>
    STATUS_ORDER[effectiveStatus(a, today)] - STATUS_ORDER[effectiveStatus(b, today)] ||
    (PRIORITIES[b.priority]?.rank || 0) - (PRIORITIES[a.priority]?.rank || 0) ||
    (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
    (a.title || "").localeCompare(b.title || ""));
}

export function categoriesOf(tasks) {
  return [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Normalises a task before saving: trims text, clamps numbers, and keeps the
 * status and completion percentage consistent (the database does the same).
 */
export function normalizeTask(input, today) {
  const t = { ...input };
  for (const k of ["title", "description", "category", "notes"]) {
    if (typeof t[k] === "string") t[k] = t[k].trim();
    if (t[k] === "") t[k] = null;
  }
  if (!t.title) throw new Error("A task needs a title.");
  t.date = t.date || today;
  t.due_date = t.due_date || null;
  t.priority = PRIORITIES[t.priority] ? t.priority : "medium";
  t.status = STORED_STATUSES.includes(t.status) ? t.status : "not_started";
  for (const k of ["estimated_minutes", "actual_minutes"]) {
    const n = t[k] === "" || t[k] == null ? null : Math.round(Number(t[k]));
    t[k] = Number.isFinite(n) && n >= 0 ? Math.min(n, 100000) : null;
  }
  let pct = Math.round(Number(t.completion_percentage) || 0);
  pct = Math.max(0, Math.min(100, pct));
  if (t.status === "completed") pct = 100;
  t.completion_percentage = pct;
  t.milestone_id = t.milestone_id || null;
  return t;
}
