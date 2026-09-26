// Milestones: list with progress and pace; detail page with related tasks.
import { state, saveMilestone, deleteMilestone, toast } from "../state.js";
import { milestoneInfo, PACE_LABELS } from "../core/insights.js";
import { formatDay, relativeDay } from "../core/dates.js";
import { sortTasks, PRIORITIES } from "../core/tasks.js";
import { esc, progressBar, priorityPill, openModal, confirmDialog, options } from "../ui/dom.js";
import { taskList } from "../ui/task-ui.js";

const MS_STATUS = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", on_hold: "On Hold", cancelled: "Cancelled" };
const PACE_TONE = { done: "green", on_track: "green", behind: "orange", overdue: "red", no_deadline: "idle", cancelled: "idle" };

function card(m) {
  const today = state.today;
  const info = milestoneInfo(m, state.tasks, today, state.timeZone);
  return `<li class="li-ms-card">
    <a class="li-ms-link" href="#/milestones/${esc(m.id)}">
      <div class="li-ms-top"><span class="li-ms-title">${esc(m.title)}</span><span class="li-pill tone-${PACE_TONE[info.pace]}">${esc(PACE_LABELS[info.pace])}</span></div>
      <div class="li-task-meta">${priorityPill(m.priority)}${m.category ? `<span class="li-meta">${esc(m.category)}</span>` : ""}<span class="li-meta">${esc(MS_STATUS[m.status])}</span>
        ${m.deadline ? `<span class="li-meta">Due ${esc(formatDay(m.deadline, { month: "short", day: "numeric", year: "numeric" }))} (${relativeDay(m.deadline, today)})</span>` : ""}</div>
      <div class="li-ms-progress">${progressBar(m.percentage_complete, m.title)}<b>${Math.round(m.percentage_complete)}%</b></div>
      <div class="li-ms-foot">${m.progress_mode === "tasks"
        ? `${info.total_tasks} tasks · ${info.completed_tasks} completed · ${info.remaining_tasks} remaining`
        : `${Number(m.current_progress)} of ${Number(m.target)} · ${info.total_tasks} related tasks`}${info.expected_pct != null && info.pace !== "done" ? ` · expected ~${info.expected_pct}% by now` : ""}</div>
    </a></li>`;
}

export function renderMilestones(el, params, id) {
  if (id) return renderDetail(el, id);
  const show = params.get("show") || "open";
  const list = state.milestones.filter((m) => show === "all" ? true : show === "done" ? m.status === "completed" : !["completed", "cancelled"].includes(m.status))
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Milestones</span><h2 class="li-h2">${list.length} ${show === "done" ? "completed" : show === "all" ? "total" : "open"}</h2></div>
      <button type="button" class="li-btn primary" id="li-add-ms">+ Milestone</button>
    </header>
    <nav class="li-seg" aria-label="Filter milestones">
      ${[["open", "Open"], ["done", "Completed"], ["all", "All"]].map(([k, l]) => `<a class="li-btn small${k === show ? " on" : ""}" href="#/milestones?show=${k}" aria-current="${k === show}">${l}</a>`).join("")}
    </nav>
    ${list.length ? `<ul class="li-ms-grid">${list.map(card).join("")}</ul>` : `<p class="li-empty">No milestones here yet.</p>`}`;
  el.querySelector("#li-add-ms").addEventListener("click", () => openMilestoneForm());
}

function renderDetail(el, id) {
  const m = state.milestones.find((x) => x.id === id);
  if (!m) { el.innerHTML = `<p class="li-empty">That milestone doesn't exist. <a class="li-link" href="#/milestones">Back to milestones</a></p>`; return; }
  const today = state.today;
  const info = milestoneInfo(m, state.tasks, today, state.timeZone);
  const tasks = sortTasks(state.tasks.filter((t) => t.milestone_id === id), today);
  const goal = m.goal_id && state.goals.find((g) => g.id === m.goal_id);
  el.innerHTML = `
    <header class="li-view-head">
      <div><a class="li-link" href="#/milestones">&#8249; Milestones</a><h2 class="li-h2">${esc(m.title)}</h2></div>
      <button type="button" class="li-btn" id="li-edit-ms">Edit</button>
    </header>
    <section class="li-card">
      <div class="li-ms-progress big">${progressBar(m.percentage_complete, m.title)}<b>${Math.round(m.percentage_complete)}%</b></div>
      <dl class="li-dl">
        <div><dt>Status</dt><dd>${esc(MS_STATUS[m.status])} · <span class="li-pill tone-${PACE_TONE[info.pace]}">${esc(PACE_LABELS[info.pace])}</span></dd></div>
        <div><dt>Priority</dt><dd>${priorityPill(m.priority)}</dd></div>
        <div><dt>Category</dt><dd>${esc(m.category || "—")}</dd></div>
        <div><dt>Start</dt><dd>${m.start_date ? esc(formatDay(m.start_date, { month: "long", day: "numeric", year: "numeric" })) : "—"}</dd></div>
        <div><dt>Deadline</dt><dd>${m.deadline ? `${esc(formatDay(m.deadline, { month: "long", day: "numeric", year: "numeric" }))} (${relativeDay(m.deadline, today)})` : "—"}</dd></div>
        <div><dt>Progress</dt><dd>${m.progress_mode === "tasks" ? "Automatic, from related tasks" : `${Number(m.current_progress)} of ${Number(m.target)} (manual)`}${info.expected_pct != null && info.pace !== "done" ? ` · expected ~${info.expected_pct}% by now` : ""}</dd></div>
        <div><dt>Related tasks</dt><dd>${info.total_tasks} total · ${info.completed_tasks} completed · ${info.remaining_tasks} remaining${info.overdue_tasks ? ` · <span class="li-danger">${info.overdue_tasks} overdue</span>` : ""}</dd></div>
        ${goal ? `<div><dt>Quarterly goal</dt><dd><a class="li-link" href="#/quarter?q=${goal.quarter}&y=${goal.year}">${esc(goal.title)} (Q${goal.quarter} ${goal.year})</a></dd></div>` : ""}
      </dl>
      ${m.description ? `<p class="li-prose">${esc(m.description)}</p>` : ""}
      ${m.notes ? `<p class="li-prose li-muted">${esc(m.notes)}</p>` : ""}
    </section>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Related tasks</span><button type="button" class="li-btn small" data-new-task="${today}" data-milestone="${esc(id)}">+ Task</button></div>
      ${taskList(tasks, { showDate: true, empty: "No tasks linked yet. Add tasks to track this milestone automatically." })}
    </section>`;
  el.querySelector("#li-edit-ms").addEventListener("click", () => openMilestoneForm(m));
}

export function openMilestoneForm(ms = {}) {
  const m = { progress_mode: "tasks", target: 100, current_progress: 0, status: "not_started", priority: "medium", start_date: state.today, ...ms };
  const editing = !!m.id;
  openModal({
    eyebrow: editing ? "Edit milestone" : "New milestone",
    title: editing ? m.title : "Add a milestone",
    wide: true,
    body: `
      <label class="li-field full">Name<input name="title" required maxlength="200" value="${esc(m.title || "")}" placeholder="e.g. Launch personal portfolio"></label>
      <label class="li-field full">Description<textarea name="description" rows="2">${esc(m.description || "")}</textarea></label>
      <label class="li-field">Category<input name="category" maxlength="60" value="${esc(m.category || "")}"></label>
      <label class="li-field">Priority<select name="priority">${options(Object.entries(PRIORITIES).map(([k, v]) => [k, v.label]), m.priority)}</select></label>
      <label class="li-field">Start date<input type="date" name="start_date" value="${esc(m.start_date || "")}"></label>
      <label class="li-field">Deadline<input type="date" name="deadline" value="${esc(m.deadline || "")}"></label>
      <label class="li-field">Status<select name="status">${options(Object.entries(MS_STATUS), m.status)}</select></label>
      <label class="li-field">Quarterly goal<select name="goal_id">${options(state.goals.map((g) => [g.id, `Q${g.quarter} ${g.year}: ${g.title}`]), m.goal_id, { empty: "None" })}</select></label>
      <label class="li-field full">Progress from<select name="progress_mode">${options([["tasks", "Related tasks (automatic)"], ["manual", "A number I update (current ÷ target)"]], m.progress_mode)}</select></label>
      <label class="li-field" data-manual>Target<input type="number" name="target" min="0.01" step="any" value="${esc(m.target)}"></label>
      <label class="li-field" data-manual>Current progress<input type="number" name="current_progress" min="0" step="any" value="${esc(m.current_progress)}"></label>
      <label class="li-field full">Notes<textarea name="notes" rows="2">${esc(m.notes || "")}</textarea></label>`,
    extraButtons: editing ? `<button type="button" class="li-btn danger-ghost" data-del-ms>Delete</button>` : "",
    onReady(form) {
      const sync = () => form.querySelectorAll("[data-manual]").forEach((x) => { x.hidden = form.elements.progress_mode.value !== "manual"; });
      form.elements.progress_mode.addEventListener("change", sync);
      sync();
      form.querySelector("[data-del-ms]")?.addEventListener("click", async () => {
        if (await confirmDialog(`Delete milestone "${m.title}"? Its tasks are kept.`)) {
          await deleteMilestone(m.id).then(() => { toast("Milestone deleted"); location.hash = "#/milestones"; }, () => {});
        }
      });
    },
    async onSubmit(v) {
      if (!v.title.trim()) throw new Error("Give the milestone a name.");
      if (v.start_date && v.deadline && v.start_date > v.deadline) throw new Error("The start date must be on or before the deadline.");
      const saved = await saveMilestone({ ...(editing ? { id: m.id } : {}), ...v, title: v.title.trim(), goal_id: v.goal_id || null,
        target: Number(v.target) || 100, current_progress: Number(v.current_progress) || 0 });
      toast(editing ? "Milestone saved" : "Milestone added");
      if (!editing) location.hash = `#/milestones/${saved.id}`;
    },
  });
}
