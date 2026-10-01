// Task rows (with quick actions) and the add/edit task form.
import { state, saveTask, updateTask, deleteTask, toast, findTask, memberName, filesFor, needsFiles, uploadFiles, deleteFile, MAX_FILE_BYTES, assignTask, assignsTo } from "../state.js";
import { effectiveStatus, STATUSES, PRIORITIES, categoriesOf, STORED_STATUSES, countdownText } from "../core/tasks.js";
import { formatDay, formatMinutes, relativeDay } from "../core/dates.js";
import { esc, statusPill, priorityPill, openModal, closeModal, confirmDialog, options } from "./dom.js";

// Colleagues see a live countdown to the deadline of each open task the owner assigned them.
function countdownFor(t) {
  return state.isColleague && t.due_date && t.status !== "completed" && t.status !== "cancelled"
    && t.assigned_by && t.assigned_by !== state.me && t.user_id === state.me;
}
setInterval(() => {
  for (const el of document.querySelectorAll("[data-countdown]")) {
    const text = countdownText(el.dataset.countdown);
    el.textContent = `⏳ ${text}`;
    el.classList.toggle("danger", text === "Past deadline");
  }
}, 1000);

export function taskRow(t, { showDate = false, compact = false, showOwner = false, readOnly = false } = {}) {
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
    countdownFor(t) ? `<span class="li-meta countdown${countdownText(t.due_date) === "Past deadline" ? " danger" : ""}" data-countdown="${esc(t.due_date)}" title="Time left to the deadline">⏳ ${countdownText(t.due_date)}</span>` : "",
    ms ? `<span class="li-meta ms">◆ ${esc(ms.title)}</span>` : "",
    // Team: who a task is for (on the owner's views), or who assigned it.
    // showOwner (the owner's team-wide Tasks card) names who's in charge of every task.
    showOwner ? `<span class="li-meta who" title="In charge">👤 ${esc(!t.user_id || t.user_id === state.me ? "You" : memberName(t.user_id))}</span>`
      : state.me && t.user_id && t.user_id !== state.me ? `<span class="li-meta who">For ${esc(memberName(t.user_id))}</span>` : "",
    state.me && t.assigned_by && t.assigned_by !== state.me && t.user_id === state.me ? `<span class="li-meta who">Assigned by ${esc(memberName(t.assigned_by))}</span>` : "",
    t.estimated_minutes || t.actual_minutes ? `<span class="li-meta">${t.actual_minutes != null ? formatMinutes(t.actual_minutes) : "0m"}${t.estimated_minutes ? " / " + formatMinutes(t.estimated_minutes) : ""}</span>` : "",
    !done && t.completion_percentage ? `<span class="li-meta">${t.completion_percentage}%</span>` : "",
    filesFor(t.id).length ? `<span class="li-meta" title="Files shared">📎 ${filesFor(t.id).length}</span>` : "",
  ].join("");
  // Read-only rows (a colleague's Tasks card): no tick, status, delete or editing.
  if (readOnly) return `<li class="li-task st-${eff} compact li-task-ro" data-task-id="${esc(t.id)}">
    <span class="li-check" aria-hidden="true">${done ? "✓" : ""}</span>
    <div class="li-task-main">
      <span class="li-task-title">${esc(t.title)}</span>
      <div class="li-task-meta">${meta}</div>
    </div>
  </li>`;
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
    if (!done) { completeTask(t); return; }
    await updateTask(id, { status: t.completion_percentage && t.completion_percentage < 100 ? "in_progress" : "not_started" })
      .then(() => toast("Marked not done"), () => {});
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
  const task = findTask(id);
  if (sel.value === "completed" && needsFiles(task)) { sel.value = task.status; openHandIn(task); return; }
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
  const assignable = state.isManager && state.members.filter(assignsTo).length > 1;
  const people = state.members.filter(assignsTo).map((m) => [m.user_id, m.user_id === state.me ? `Me (${m.name})` : m.name]);
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
      ${!assignable ? "" : editing ? `<label class="li-field full">Assign to<select name="user_id">${options(people, t.user_id || state.me)}</select></label>`
        : `<fieldset class="full li-assignees"><legend>Assign to <small class="li-muted">(one or more; each person gets their own copy)</small></legend>
          ${people.map(([id, label]) => `<label class="li-check-row"><input type="checkbox" name="assignees[]" value="${esc(id)}"${id === (t.user_id || state.me) ? " checked" : ""}> ${esc(label)}</label>`).join("")}
        </fieldset>`}
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
      if (v.assignees) {
        const { assignees, ...fields } = v;
        if (!assignees.length) throw new Error("Choose at least one person to assign it to.");
        await assignTask(fields, assignees);
        const names = assignees.map((id) => id === state.me ? "you" : memberName(id));
        const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0];
        toast(assignees.length === 1 && assignees[0] === state.me ? "Task added" : `Assigned to ${list}`);
        return;
      }
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
  if (!state.canAddTasks) return "";
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
      ${Array.isArray(state.files) && (filesFor(t.id).length || isMine(t)) ? `<section class="li-ticket-sec"><h3 class="li-group-h">Files${t.assigned_by && t.assigned_by !== state.me && isMine(t) ? ` shared with ${esc(memberName(t.assigned_by))}` : ""}</h3>
        ${fileList(t.id) || `<p class="li-empty">No files yet.</p>`}
        ${isMine(t) ? `<label class="li-btn small li-file-add">+ Add files<input type="file" multiple data-add-files hidden></label>` : ""}</section>` : ""}
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
      form.querySelector("[data-add-files]")?.addEventListener("change", async (e) => {
        const picked = [...e.target.files];
        if (!picked.length) return;
        await uploadFiles(t, picked).then(() => { toast(picked.length === 1 ? "File shared" : `${picked.length} files shared`); openTaskDetail(findTask(t.id) || t); }, (err) => toast(err.message, "error"));
      });
      form.querySelector('[data-detail="toggle"]').addEventListener("click", async () => {
        if (!done && needsFiles(t)) { openHandIn(t); return; }
        const saved = await updateTask(t.id, done ? { status: "not_started" } : { status: "completed" }).catch(() => null);
        if (!saved) return;
        toast(done ? "Marked not done" : "Task completed");
        if (!done && !hasLearning(saved)) openLearningLog(saved, { justCompleted: true });
        else closeModal();
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Files: handing in assigned work
// ---------------------------------------------------------------------------
const isMine = (t) => (t.user_id || state.me) === state.me;

export function formatBytes(n) {
  if (n == null) return "";
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** The files shared on a task, as links that open them. */
export function fileList(taskId) {
  const files = filesFor(taskId);
  if (!files.length) return "";
  return `<ul class="li-files">${files.map((f) => `<li>
    <button type="button" class="li-link" data-open-file="${esc(f.id)}">📎 ${esc(f.name)}</button>
    <small class="li-muted">${esc(formatBytes(f.size))}</small>
    ${f.user_id === state.me ? `<button type="button" class="li-icon-btn" data-delete-file="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">&#10005;</button>` : ""}
  </li>`).join("")}</ul>`;
}

// Opening a file: the window opens right away (so phones don't block it),
// then goes to a short-lived link.
document.addEventListener("click", async (e) => {
  const open = e.target.closest("[data-open-file]");
  const del = e.target.closest("[data-delete-file]");
  if (!open && !del) return;
  const f = (state.files || []).find((x) => x.id === (open || del).dataset[open ? "openFile" : "deleteFile"]);
  if (!f) return;
  if (del) {
    if (!(await confirmDialog(`Remove "${f.name}"?`, "Remove"))) return;
    await deleteFile(f).then(() => toast("File removed"), () => {});
    return;
  }
  const w = window.open("", "_blank");
  try {
    const url = await state.store.fileUrl(f);
    if (w) w.location.href = url; else location.href = url;
  } catch (err) { w?.close(); toast("Couldn't open the file: " + err.message, "error"); }
});

/** Completes a task: assigned work goes through "Hand in" (files required). */
export function completeTask(t) {
  if (needsFiles(t)) { openHandIn(t); return; }
  updateTask(t.id, { status: "completed" }).then((saved) => { toast("Task completed"); askForLearningLog(saved); }, () => {});
}

export function openHandIn(t) {
  const owner = memberName(t.assigned_by) || "the team owner";
  const picked = [];
  openModal({
    eyebrow: `Hand in · assigned by ${owner}`,
    title: t.title,
    submitLabel: "Finish and share",
    wide: true,
    body: `<p class="li-sub full">Share your work with ${esc(owner)}: attach at least one file (screenshots, documents, designs, a zip…), up to 10 MB each.</p>
      <div class="li-field full"><span>Files</span>
        ${fileList(t.id)}
        <ul class="li-files li-files-new"></ul>
        <label class="li-btn li-file-pick">📎 Choose files<input type="file" multiple hidden></label>
      </div>
      ${learningFields(t)}`,
    onReady(form) {
      const list = form.querySelector(".li-files-new");
      const draw = () => { list.innerHTML = picked.map((f, i) => `<li><span>📎 ${esc(f.name)}</span> <small class="li-muted">${esc(formatBytes(f.size))}</small>
        <button type="button" class="li-icon-btn" data-unpick="${i}" aria-label="Remove ${esc(f.name)}">&#10005;</button></li>`).join(""); };
      form.querySelector(".li-file-pick input").addEventListener("change", (e) => {
        for (const f of e.target.files) {
          if (f.size > MAX_FILE_BYTES) { toast(`"${f.name}" is over 10 MB`, "error"); continue; }
          picked.push(f);
        }
        e.target.value = "";
        draw();
      });
      list.addEventListener("click", (e) => { const b = e.target.closest("[data-unpick]"); if (b) { picked.splice(Number(b.dataset.unpick), 1); draw(); } });
    },
    async onSubmit(v) {
      if (!picked.length && !filesFor(t.id).length) throw new Error("Attach at least one file to finish this task.");
      if (picked.length) await uploadFiles(t, picked);
      picked.length = 0;
      await updateTask(t.id, { status: "completed", ...Object.fromEntries(LEARNING.map(([k]) => [k, (v[k] || "").trim() || null])) });
      toast(`Task finished and shared with ${owner}`);
    },
  });
}
