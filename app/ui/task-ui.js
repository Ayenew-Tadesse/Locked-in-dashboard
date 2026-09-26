// Task rows (with quick actions) and the add/edit task form.
import { state, saveTask, updateTask, deleteTask, toast } from "../state.js";
import { effectiveStatus, STATUSES, PRIORITIES, categoriesOf, STORED_STATUSES } from "../core/tasks.js";
import { formatDay, formatMinutes, relativeDay } from "../core/dates.js";
import { esc, statusPill, priorityPill, openModal, confirmDialog, options } from "./dom.js";

export function taskRow(t, { showDate = false } = {}) {
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
    t.estimated_minutes || t.actual_minutes ? `<span class="li-meta">${t.actual_minutes != null ? formatMinutes(t.actual_minutes) : "0m"}${t.estimated_minutes ? " / " + formatMinutes(t.estimated_minutes) : ""}</span>` : "",
    !done && t.completion_percentage ? `<span class="li-meta">${t.completion_percentage}%</span>` : "",
  ].join("");
  return `<li class="li-task st-${eff}" data-task-id="${esc(t.id)}">
    <button type="button" class="li-check" data-act="toggle" aria-pressed="${done}" aria-label="${done ? "Mark not done" : "Mark complete"}: ${esc(t.title)}">✓</button>
    <div class="li-task-main">
      <button type="button" class="li-task-title" data-act="edit">${esc(t.title)}</button>
      <div class="li-task-meta">${meta}</div>
      ${t.notes ? `<div class="li-task-notes">${esc(t.notes)}</div>` : ""}
    </div>
    <div class="li-task-actions">
      <select data-act="status" aria-label="Status of ${esc(t.title)}">${options(STORED_STATUSES.map((s) => [s, STATUSES[s]]), t.status)}</select>
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
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  if (btn.dataset.act === "toggle") {
    const done = t.status === "completed";
    await updateTask(id, done ? { status: t.completion_percentage && t.completion_percentage < 100 ? "in_progress" : "not_started" } : { status: "completed" })
      .then(() => toast(done ? "Marked not done" : "Task completed"), () => {});
  } else if (btn.dataset.act === "edit") {
    openTaskForm(t);
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
  await updateTask(id, patch).then(() => toast(`Marked ${STATUSES[sel.value].toLowerCase()}`), () => {});
});

/** Add (no task, or defaults without id) or edit a task. */
export function openTaskForm(task = {}) {
  const t = { date: state.today, priority: "medium", status: "not_started", completion_percentage: 0, ...task };
  const editing = !!t.id;
  const cats = categoriesOf(state.tasks);
  const ms = state.milestones.filter((m) => m.status !== "cancelled" || m.id === t.milestone_id);
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
      <label class="li-field">Estimated minutes<input type="number" name="estimated_minutes" min="0" max="100000" step="5" inputmode="numeric" value="${esc(t.estimated_minutes ?? "")}"></label>
      <label class="li-field">Actual minutes<input type="number" name="actual_minutes" min="0" max="100000" step="5" inputmode="numeric" value="${esc(t.actual_minutes ?? "")}"></label>
      <label class="li-field full">Completion <output name="pct_out">${esc(t.completion_percentage)}%</output>
        <input type="range" name="completion_percentage" min="0" max="100" step="5" value="${esc(t.completion_percentage)}"></label>
      <label class="li-field full">Notes<textarea name="notes" rows="3" maxlength="10000">${esc(t.notes || "")}</textarea></label>`,
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
      toast(editing ? "Task saved" : "Task added");
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
