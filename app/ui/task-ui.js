// Task rows (with quick actions) and the add/edit task form.
import { state, saveTask, updateTask, deleteTask, toast, findTask, memberName } from "../state.js";
import { effectiveStatus, STATUSES, PRIORITIES, categoriesOf, STORED_STATUSES } from "../core/tasks.js";
import { formatDay, formatMinutes, relativeDay } from "../core/dates.js";
import { esc, statusPill, priorityPill, openModal, closeModal, confirmDialog, options } from "./dom.js";

export function taskRow(t, { showDate = false, compact = false, showOwner = false } = {}) {
  const today = state.today;
  const eff = effectiveStatus(t, today);
  const ms = t.milestone_id && state.milestones.find((m) => m.id === t.milestone_id);
  const done = t.status === "completed";
  const meta = [
    statusPill(eff),
    priorityPill(t.priority),
    t.category ? `<span class="li-meta">${esc(t.category)}</span>` : "",
    showDate ? `<span class="li-meta">${esc(formatDay(t.date))}</span>` : "",
    t.due_date ? `<span class="li-meta ${eff === "overdue" ? "danger" : ""}">Due ${esc(t.due_date === today ? "today" : formatDay(t.due_date))}${eff === "overdue" ? ` (${relativeDay(t.due_date, today)})` : ""}</span>` : "",
    ms ? `<span class="li-meta ms">◆ ${esc(ms.title)}</span>` : "",
    // Team: who a task is for (on the owner's views), or who assigned it.
    // showOwner (the owner's team-wide Tasks card) names who's in charge of every task.
    showOwner ? `<span class="li-meta who" title="In charge">👤 ${esc(!t.user_id || t.user_id === state.me ? "You" : memberName(t.user_id))}</span>`
      : state.me && t.user_id && t.user_id !== state.me ? `<span class="li-meta who">For ${esc(memberName(t.user_id))}</span>` : "",
    state.me && t.assigned_by && t.assigned_by !== state.me && t.user_id === state.me ? `<span class="li-meta who">Assigned by ${esc(memberName(t.assigned_by))}</span>` : "",
    t.estimated_minutes || t.actual_minutes ? `<span class="li-meta">${t.actual_minutes != null ? formatMinutes(t.actual_minutes) : "0m"}${t.estimated_minutes ? " / " + formatMinutes(t.estimated_minutes) : ""}</span>` : "",
    !done && t.completion_percentage ? `<span class="li-meta">${t.completion_percentage}%</span>` : "",
  ].join("");
  return `<li class="li-task st-${eff}${compact ? " compact" : ""}" data-task-id="${esc(t.id)}">
    <button type="button" class="li-check" data-act="toggle" aria-pressed="${done}" aria-label="${done ? "Mark not done" : "Mark complete"}: ${esc(t.title)}">✓</button>
    <div class="li-task-main">
      <button type="button" class="li-task-title" data-act="edit">${esc(t.title)}</button>
      <div class="li-task-meta">${meta}</div>
      ${t.notes ? `<div class="li-task-notes">${esc(t.notes)}</div>` : ""}
    </div>
    <div class="li-task-actions">
      ${compact ? "" : `<select data-act="status" aria-label="Status of ${esc(t.title)}">${options(STORED_STATUSES.map((s) => [s, STATUSES[s]]), t.status)}</select>`}
      <button type="button" class="li-icon-btn" data-act="delete" aria-label="Delete ${esc(t.title)}" title="Delete">&#10005;</button>
    </div>
  </li>`;
}

export function taskList(tasks, opts = {}) {
  if (!tasks.length) return `<p class="li-empty">${esc(opts.empty || "No tasks.")}</p>`;
  return `<ul class="li-tasks">${tasks.map((t) => taskRow(t, opts)).join("")}</ul>`;
}

// One set of listeners for every task row on the page.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".li-task [data-act]");
  if (!btn || btn.tagName === "SELECT") return;
  const id = btn.closest(".li-task").dataset.taskId;
  const t = findTask(id);
  if (!t) return;
  if (btn.dataset.act === "toggle") {
    const done = t.status === "completed";
    await updateTask(id, done ? { status: t.completion_percentage && t.completion_percentage < 100 ? "in_progress" : "not_started" } : { status: "completed" })
      .then((saved) => { toast(done ? "Marked not done" : "Task completed"); if (!done) askForLearningLog(saved); }, () => {});
  } else if (btn.dataset.act === "edit") {
    openTaskDetail(t);
  } else if (btn.dataset.act === "delete") {
    if (await confirmDialog(`Delete "${t.title}"?`)) await deleteTask(id).then(() => toast("Task deleted"), () => {});
  }
});
document.addEventListener("change", async (e) => {
  const sel = e.target.closest(".li-task select[data-act=status]");
  if (!sel) return;
  const id = sel.closest(".li-task").dataset.taskId;
  const patch = { status: sel.value };
  if (sel.value === "not_started") patch.completion_percentage = 0;
  await updateTask(id, patch).then((saved) => {
    toast(`Marked ${STATUSES[sel.value].toLowerCase()}`);
    if (sel.value === "completed") askForLearningLog(saved);
  }, () => {});
});

/** Add (no task, or defaults without id) or edit a task. */
export function openTaskForm(task = {}) {
  const t = { date: state.today, priority: "medium", status: "not_started", completion_percentage: 0, ...task };
  const editing = !!t.id;
  const cats = categoriesOf(state.tasks);
  const ms = state.milestones.filter((m) => m.status !== "cancelled" || m.id === t.milestone_id);
  // The team owner can give a task to anyone on the team.
  const assignable = state.isOwner && state.members.length > 1;
  const people = state.members.map((m) => [m.user_id, m.user_id === state.me ? `Me (${m.name})` : m.name]);
  openModal({
    eyebrow: editing ? "Edit task" : "New task",
    title: editing ? t.title : "Add a task",
    submitLabel: editing ? "Save changes" : "Add task",
    wide: true,
    body: `
      <label class="li-field full">Title<input name="title" required maxlength="300" value="${esc(t.title || "")}" placeholder="What needs doing?"></label>
      <label class="li-field full">Description<textarea name="description" rows="2" maxlength="10000">${esc(t.description || "")}</textarea></label>
      <label class="li-field">Date<input type="date" name="date" required value="${esc(t.date || "")}"></label>
      <label class="li-field">Deadline<input type="date" name="due_date" value="${esc(t.due_date || "")}"></label>
      <label class="li-field">Priority<select name="priority">${options(Object.entries(PRIORITIES).map(([k, v]) => [k, v.label]), t.priority)}</select></label>
      <label class="li-field">Status<select name="status">${options(STORED_STATUSES.map((s) => [s, STATUSES[s]]), t.status)}</select></label>
      <label class="li-field">Category<input name="category" list="li-cats" maxlength="60" value="${esc(t.category || "")}" placeholder="e.g. Work"><datalist id="li-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="li-field">Milestone<select name="milestone_id">${options(ms.map((m) => [m.id, m.title]), t.milestone_id, { empty: "None" })}</select></label>
      ${assignable ? `<label class="li-field full">Assign to<select name="user_id">${options(people, t.user_id || state.me)}</select></label>` : ""}
      <label class="li-field">Estimated minutes<input type="number" name="estimated_minutes" min="0" max="100000" step="5" inputmode="numeric" value="${esc(t.estimated_minutes ?? "")}"></label>
      <label class="li-field">Actual minutes<input type="number" name="actual_minutes" min="0" max="100000" step="5" inputmode="numeric" value="${esc(t.actual_minutes ?? "")}"></label>
      <label class="li-field full">Completion <output name="pct_out">${esc(t.completion_percentage)}%</output>
        <input type="range" name="completion_percentage" min="0" max="100" step="5" value="${esc(t.completion_percentage)}"></label>
      <label class="li-field full">Notes<textarea name="notes" rows="3" maxlength="10000">${esc(t.notes || "")}</textarea></label>
      <fieldset class="full li-learning"><legend>Learning log (for your daily report PDF)</legend>
        ${learningFields(t)}
      </fieldset>`,
    onReady(form) {
      const range = form.elements.completion_percentage, out = form.elements.pct_out, status = form.elements.status;
      range.addEventListener("input", () => {
        out.value = range.value + "%";
        if (range.value === "100") status.value = "completed";
        else if (status.value === "completed") status.value = "in_progress";
        else if (Number(range.value) > 0 && status.value === "not_started") status.value = "in_progress";
      });
      status.addEventListener("change", () => {
        if (status.value === "completed") { range.value = 100; out.value = "100%"; }
      });
    },
    async onSubmit(v) {
      if (!v.title.trim()) throw new Error("Give the task a title.");
      await saveTask({ ...(editing ? { id: t.id } : {}), ...v });
      toast(v.user_id && v.user_id !== state.me ? `${editing ? "Saved" : "Assigned"} to ${memberName(v.user_id)}` : editing ? "Task saved" : "Task added");
    },
    extraButtons: editing ? `<button type="button" class="li-btn danger-ghost" data-del-task>Delete</button>` : "",
  });
  if (editing) {
    document.querySelector("[data-del-task]").addEventListener("click", async () => {
      if (await confirmDialog(`Delete "${t.title}"?`)) await deleteTask(t.id).then(() => toast("Task deleted"), () => {});
    });
  }
}

/** One-line quick add: "Title" -> task for `date`. */
export function quickAddForm(id, date, placeholder = "Add a task…") {
  return `<form class="today-add li-quick-add" data-quick-add="${esc(date)}" id="${esc(id)}" autocomplete="off">
    <input type="text" name="title" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" maxlength="300">
    <button type="submit">Add</button>
    <button type="button" class="li-btn ghost small" data-quick-more title="Add with details">Details…</button>
  </form>`;
}
document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-quick-add]");
  if (!form) return;
  e.preventDefault();
  const title = form.elements.title.value.trim();
  if (!title) return;
  await saveTask({ title, date: form.dataset.quickAdd }).then(() => { toast("Task added"); }, () => {});
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-quick-more]");
  if (!b) return;
  const form = b.closest("form[data-quick-add]");
  openTaskForm({ title: form.elements.title.value.trim(), date: form.dataset.quickAdd });
});

// ---------------------------------------------------------------------------
// Ticket view and Learning log
// ---------------------------------------------------------------------------

const LEARNING = [
  ["learning_changed", "What did you change?", "e.g. Added a booking store and moved the search form onto it"],
  ["learning_how", "How did you do it?", "e.g. A Zustand store with a search slice; screens read it with a selector"],
  ["learning_solved", "What problem did it solve? What did you learn?", "e.g. Search data no longer gets lost between screens; learned client vs server state"],
];
function learningFields(t) {
  return LEARNING.map(([k, label, ph]) =>
    `<label class="li-field full">${esc(label)}<textarea name="${k}" rows="2" maxlength="5000" placeholder="${esc(ph)}">${esc(t[k] || "")}</textarea></label>`).join("");
}
const hasLearning = (t) => !!(t && (t.learning_changed || t.learning_how || t.learning_solved));

/** Right after completing a task, ask what was learned (skippable). */
function askForLearningLog(t) {
  if (!t || hasLearning(t)) return;
  openLearningLog(t, { justCompleted: true });
}

export function openLearningLog(t, { justCompleted = false } = {}) {
  openModal({
    eyebrow: justCompleted ? "Task completed · Learning log" : "Learning log",
    title: t.title,
    submitLabel: "Save learning log",
    body: `<p class="li-sub full">Three short answers. They go into your Daily report PDF so you can look back on what you learned.</p>${learningFields(t)}`,
    async onSubmit(v) {
      await saveTask({ ...t, ...Object.fromEntries(LEARNING.map(([k]) => [k, v[k].trim() || null])) });
      toast("Learning log saved");
    },
  });
  const cancel = document.querySelector("#li-modal .li-form-actions [data-close]");
  if (cancel && justCompleted) cancel.textContent = "Skip";
}

/** Formats a ticket description ("Goal: ...", "Steps: 1. ..."), or plain text. */
function ticketHtml(description) {
  if (!description) return "";
  const parts = description.split(/\n\n(?=(?:Goal|How it works|Steps|Done when):)/);
  return parts.map((p) => {
    const m = /^(Goal|How it works|Steps|Done when):\s*([\s\S]*)$/.exec(p);
    if (!m) return `<p class="li-prose">${esc(p)}</p>`;
    const lines = m[2].split("\n").map((l) => l.trim()).filter(Boolean);
    const list = lines.every((l) => /^(\d+\.|-)\s/.test(l));
    const body = list
      ? `<${/^\d/.test(lines[0]) ? "ol" : "ul"} class="li-ticket-list">${lines.map((l) => `<li>${esc(l.replace(/^(\d+\.|-)\s/, ""))}</li>`).join("")}</${/^\d/.test(lines[0]) ? "ol" : "ul"}>`
      : `<p class="li-prose">${esc(m[2])}</p>`;
    return `<section class="li-ticket-sec${m[1] === "How it works" ? " how" : ""}"><h3 class="li-group-h">${esc(m[1])}</h3>${body}</section>`;
  }).join("");
}

export function openTaskDetail(t) {
  const today = state.today;
  const eff = effectiveStatus(t, today);
  const ms = t.milestone_id && state.milestones.find((m) => m.id === t.milestone_id);
  const done = t.status === "completed";
  openModal({
    eyebrow: ms ? `Ticket · ${ms.title}` : "Task",
    title: t.title,
    wide: true,
    body: `<div class="full li-ticket">
      <div class="li-task-meta">${statusPill(eff)}${priorityPill(t.priority)}
        <span class="li-meta">${esc(formatDay(t.date, { weekday: "short", month: "short", day: "numeric" }))}</span>
        ${t.due_date ? `<span class="li-meta ${eff === "overdue" ? "danger" : ""}">Due ${esc(formatDay(t.due_date, { weekday: "short", month: "short", day: "numeric" }))}</span>` : ""}
        ${t.estimated_minutes ? `<span class="li-meta">Estimate ${esc(formatMinutes(t.estimated_minutes))}</span>` : ""}</div>
      ${ticketHtml(t.description) || `<p class="li-empty">No description.</p>`}
      ${t.notes ? `<section class="li-ticket-sec"><h3 class="li-group-h">Notes</h3><p class="li-prose">${esc(t.notes)}</p></section>` : ""}
      ${hasLearning(t) ? `<section class="li-ticket-sec learned"><h3 class="li-group-h">Your learning log</h3>
        ${LEARNING.filter(([k]) => t[k]).map(([k, label]) => `<p class="li-prose"><b>${esc(label)}</b><br>${esc(t[k])}</p>`).join("")}</section>` : ""}
    </div>`,
    extraButtons: `<button type="button" class="li-btn primary" data-detail="toggle">${done ? "Mark not done" : "Mark complete"}</button>
      <button type="button" class="li-btn" data-detail="learn">Learning log</button>
      <button type="button" class="li-btn" data-detail="edit">Edit</button>`,
    onReady(form) {
      form.querySelector("[data-close]:not(.modal-close)")?.replaceChildren("Close");
      form.querySelector('[data-detail="edit"]').addEventListener("click", () => openTaskForm(t));
      form.querySelector('[data-detail="learn"]').addEventListener("click", () => openLearningLog(t));
      form.querySelector('[data-detail="toggle"]').addEventListener("click", async () => {
        const saved = await updateTask(t.id, done ? { status: "not_started" } : { status: "completed" }).catch(() => null);
        if (!saved) return;
        toast(done ? "Marked not done" : "Task completed");
        if (!done && !hasLearning(saved)) openLearningLog(saved, { justCompleted: true });
        else closeModal();
      });
    },
  });
}
