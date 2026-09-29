// Tasks: every task grouped by planned day, with buttons to show one status
// at a time (#/tasks?status=ongoing). The Overview's Overdue tile opens
// #/tasks?status=overdue.
import { state, myAssignments, memberName, filesFor, addPersonToAssignment, editAssignment, revokeAssignment, deleteAssignment, toast, SHARED_TASK_FIELDS, managesPerson } from "../state.js";
import { effectiveStatus, sortTasks, PRIORITIES, categoriesOf } from "../core/tasks.js";
import { formatDay } from "../core/dates.js";
import { esc, statusPill, priorityPill, openModal, confirmDialog, options } from "../ui/dom.js";
import { taskList } from "../ui/task-ui.js";

// [key, button label, which tasks, message when there are none]
const TABS = [
  ["all", "All", () => true, "No tasks yet."],
  ["available", "Available", (eff) => eff === "not_started", "Nothing waiting to be started."],
  ["ongoing", "Ongoing", (eff) => eff === "in_progress", "Nothing in progress right now."],
  ["completed", "Completed", (eff) => eff === "completed", "Nothing completed yet."],
  ["overdue", "Overdue", (eff) => eff === "overdue", "Nothing overdue. All caught up."],
];

export function renderTasks(el, params) {
  const today = state.today;
  // Older links used ?deadline=overdue.
  const key = params.get("deadline") === "overdue" ? "overdue" : params.get("status");
  if (key === "assigned" && state.isManager) return renderAssigned(el);
  const tab = TABS.find(([k]) => k === key) || TABS[0];
  const counts = Object.fromEntries(TABS.map(([k, , keep]) => [k, state.tasks.filter((t) => keep(effectiveStatus(t, today))).length]));
  const list = sortTasks(state.tasks.filter((t) => tab[2](effectiveStatus(t, today))), today);
  // Group by planned date, newest first; tasks from today onwards first.
  const groups = new Map();
  list.slice().sort((a, b) => (b.date >= today) - (a.date >= today) || (a.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
    .forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
  const empty = tab[0] === "all" && state.canAddTasks ? "No tasks yet. Add your first one." : tab[3];

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Tasks</span><h2 class="li-h2">${list.length}${tab[0] === "all" ? "" : " " + tab[1].toLowerCase()} task${list.length === 1 ? "" : "s"}</h2></div>
      ${state.canAddTasks ? `<button type="button" class="li-btn primary" data-new-task="${today}">+ New task</button>` : ""}
    </header>
    ${statusTabs(tab[0], counts)}
    <div id="li-task-results">
      ${list.length ? [...groups].map(([d, ts]) => `<section class="li-group"><h3 class="li-group-h">${esc(formatDay(d, { weekday: "long", month: "short", day: "numeric", year: "numeric" }))}${d === today ? " · Today" : ""}</h3>${taskList(ts)}</section>`).join("")
        : `<p class="li-empty">${esc(empty)}</p>`}
    </div>`;
}

function statusTabs(active, counts) {
  return `<nav class="li-seg li-status-tabs" aria-label="Show tasks by status">
      ${TABS.map(([k, label]) => `<a class="li-btn small${k === active ? " on" : ""}${k === "overdue" && counts.overdue ? " li-st-overdue" : ""}" href="#/tasks${k === "all" ? "" : "?status=" + k}"${k === active ? ' aria-current="true"' : ""}>${label} <span class="li-count">${counts[k]}</span></a>`).join("")}
      ${state.isManager ? `<a class="li-btn small${active === "assigned" ? " on" : ""}" href="#/tasks?status=assigned"${active === "assigned" ? ' aria-current="true"' : ""}>Assigned by me <span class="li-count">${myAssignments().length}</span></a>` : ""}
    </nav>`;
}

// ---------------------------------------------------------------------------
// Assigned by me (owner): every task the owner pushed, one card per
// assignment, with each person's progress. Add a person, edit for everyone,
// revoke from one person, or delete it from everyone.
// ---------------------------------------------------------------------------
function renderAssigned(el) {
  const today = state.today;
  const counts = Object.fromEntries(TABS.map(([k, , keep]) => [k, state.tasks.filter((t) => keep(effectiveStatus(t, today))).length]));
  const list = myAssignments();
  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Tasks</span><h2 class="li-h2">${list.length} assigned task${list.length === 1 ? "" : "s"}</h2></div>
      <button type="button" class="li-btn primary" data-new-task="${today}">+ New task</button>
    </header>
    ${statusTabs("assigned", counts)}
    <div id="li-task-results" class="li-assignments">
      ${list.length ? list.map(assignmentCard).join("") : `<p class="li-empty">You haven't assigned any tasks yet. Use + New task and tick the people it's for.</p>`}
    </div>`;
  el.querySelectorAll("[data-assignment]").forEach((card) => {
    const g = list.find((x) => x.key === card.dataset.assignment);
    const first = g.copies[0];
    card.querySelector("[data-add-person]")?.addEventListener("click", () => addPersonForm(first));
    card.querySelector("[data-edit-assignment]").addEventListener("click", () => editAssignmentForm(first));
    card.querySelector("[data-delete-assignment]").addEventListener("click", async () => {
      const n = g.copies.length;
      if (await confirmDialog(`Delete "${first.title}"${n > 1 ? ` for all ${n} people` : ""}?`)) {
        await deleteAssignment(first).then(() => toast("Task deleted"), () => {});
      }
    });
    card.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
      const copy = g.copies.find((c) => c.id === b.dataset.revoke);
      if (await confirmDialog(`Take "${copy.title}" away from ${memberName(copy.user_id)}?`, "Revoke")) {
        await revokeAssignment(copy).then(() => toast(`Revoked from ${memberName(copy.user_id)}`), () => {});
      }
    }));
  });
}

function assignmentCard({ key, copies }) {
  const t = copies[0], today = state.today;
  const people = [...copies].sort((a, b) => memberName(a.user_id).localeCompare(memberName(b.user_id)));
  const done = copies.filter((c) => c.status === "completed").length;
  const canAdd = state.members.some((m) => managesPerson(m) && !copies.some((c) => c.user_id === m.user_id));
  return `<section class="li-card li-assignment" data-assignment="${esc(key)}">
    <div class="li-asg-head">
      <div class="li-asg-title">
        <h3>${esc(t.title)}</h3>
        <div class="li-task-meta">${priorityPill(t.priority)}
          <span class="li-meta">${esc(formatDay(t.date))}</span>
          ${t.due_date ? `<span class="li-meta">Due ${esc(t.due_date === today ? "today" : formatDay(t.due_date))}</span>` : ""}
          <span class="li-meta">${done}/${copies.length} done</span></div>
      </div>
    </div>
    ${t.description ? `<p class="li-asg-desc">${esc(t.description)}</p>` : ""}
    <ul class="li-asg-people">
      ${people.map((c) => `<li>
        <span class="li-asg-name">${esc(c.user_id === state.me ? "You" : memberName(c.user_id))}</span>
        ${statusPill(effectiveStatus(c, today))}
        ${c.status !== "completed" && c.completion_percentage ? `<span class="li-meta">${c.completion_percentage}%</span>` : ""}
        ${filesFor(c.id).length ? `<span class="li-meta" title="Files shared">📎 ${filesFor(c.id).length}</span>` : ""}
        <span class="li-spacer"></span>
        <button type="button" class="li-btn ghost small" data-revoke="${esc(c.id)}">Revoke</button>
      </li>`).join("")}
    </ul>
    <div class="li-btn-row li-asg-actions">
      ${canAdd ? `<button type="button" class="li-btn small" data-add-person>+ Add person</button>` : ""}
      <button type="button" class="li-btn small" data-edit-assignment>Edit</button>
      <span class="li-spacer"></span>
      <button type="button" class="li-btn danger-ghost small" data-delete-assignment>Delete task</button>
    </div>
  </section>`;
}

function addPersonForm(t) {
  const have = new Set(state.tasks.concat(state.teamTasks).filter((c) => (t.group_id ? c.group_id === t.group_id : c.id === t.id)).map((c) => c.user_id));
  const free = state.members.filter((m) => !have.has(m.user_id) && managesPerson(m));
  openModal({
    eyebrow: "Add person", title: t.title, submitLabel: "Assign",
    body: `<fieldset class="full li-assignees"><legend>Also give this task to</legend>
      ${free.map((m) => `<label class="li-check-row"><input type="checkbox" name="people[]" value="${esc(m.user_id)}"> ${esc(m.user_id === state.me ? `Me (${m.name})` : m.name)}</label>`).join("")}
    </fieldset>`,
    async onSubmit(v) {
      if (!v.people.length) throw new Error("Choose at least one person.");
      for (const id of v.people) await addPersonToAssignment(t, id);
      toast(`Assigned to ${v.people.map((id) => id === state.me ? "you" : memberName(id)).join(", ")}`);
    },
  });
}

function editAssignmentForm(t) {
  const ms = state.milestones.filter((m) => m.status !== "cancelled" || m.id === t.milestone_id);
  const cats = categoriesOf(state.tasks);
  openModal({
    eyebrow: "Edit for everyone", title: t.title, submitLabel: "Save for everyone", wide: true,
    body: `
      <p class="li-muted full li-asg-note">Changes go to everyone who has this task. Their progress, files and learning logs stay as they are.</p>
      <label class="li-field full">Title<input name="title" required maxlength="300" value="${esc(t.title || "")}"></label>
      <label class="li-field full">Description<textarea name="description" rows="3" maxlength="10000">${esc(t.description || "")}</textarea></label>
      <label class="li-field">Date<input type="date" name="date" required value="${esc(t.date || "")}"></label>
      <label class="li-field">Deadline<input type="date" name="due_date" value="${esc(t.due_date || "")}"></label>
      <label class="li-field">Priority<select name="priority">${options(Object.entries(PRIORITIES).map(([k, v]) => [k, v.label]), t.priority)}</select></label>
      <label class="li-field">Category<input name="category" list="li-cats" maxlength="60" value="${esc(t.category || "")}"><datalist id="li-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="li-field">Milestone<select name="milestone_id">${options(ms.map((m) => [m.id, m.title]), t.milestone_id, { empty: "None" })}</select></label>
      <label class="li-field">Estimated minutes<input type="number" name="estimated_minutes" min="0" max="100000" step="5" inputmode="numeric" value="${esc(t.estimated_minutes ?? "")}"></label>
      <label class="li-field full">Notes<textarea name="notes" rows="2" maxlength="10000">${esc(t.notes || "")}</textarea></label>`,
    async onSubmit(v) {
      if (!v.title.trim()) throw new Error("Give the task a title.");
      await editAssignment(t, Object.fromEntries(SHARED_TASK_FIELDS.map((k) => [k, v[k] ?? t[k]])));
      toast("Saved for everyone");
    },
  });
}
