// Team page (owner only): everyone's progress, invitations, and each
// person's work, learning logs and daily report.
import { state, inviteMember, revokeInvite, removeMember, renameTeam, toast, setMemberRole, managesPerson, ROLE_LABELS } from "../state.js";
import { scoreDay, scorePeriod } from "../core/scoring.js";
import { addDays, weekRange, formatDay, relativeDay, dayOf, formatMinutes } from "../core/dates.js";
import { isOverdue, sortTasks } from "../core/tasks.js";
import { esc, tile, scoreValue, scoreTone, pct, confirmDialog, openModal } from "../ui/dom.js";
import { taskList, openTaskForm, fileList } from "../ui/task-ui.js";
import { downloadReport } from "../report/download.js";

const tasksOf = (userId) => (userId === state.me ? state.tasks : state.teamTasks.filter((t) => t.user_id === userId));

function stats(userId) {
  const today = state.today, opts = { today, timeZone: state.timeZone };
  const tasks = tasksOf(userId);
  const day = scoreDay(tasks, today, state.cfg, opts);
  const wk = weekRange(today);
  const week = scorePeriod(tasks, wk.start, wk.end, state.cfg, opts);
  const month = scorePeriod(tasks, addDays(today, -29), today, state.cfg, opts);
  const lastDone = tasks.filter((t) => t.status === "completed" && t.completed_at).map((t) => dayOf(t.completed_at, state.timeZone)).sort().pop() || null;
  return { tasks, day, week, month, overdue: tasks.filter((t) => isOverdue(t, today)).length, lastDone };
}

function signupLink() { return location.origin + location.pathname; }

export function renderTeam(el, params, id) {
  if (!state.isManager) {
    el.innerHTML = `<p class="li-empty">The Team page is for the team owner and admins.</p>`;
    return;
  }
  if (id) return renderMember(el, id);
  const today = state.today;
  // The owner sees everyone; an admin sees themselves and the colleagues they manage.
  const rank = { owner: 0, admin: 1, member: 2 };
  const people = state.members.filter(managesPerson).sort((a, b) => (rank[a.role] ?? 2) - (rank[b.role] ?? 2) || a.name.localeCompare(b.name));
  const all = people.map((m) => ({ m, s: stats(m.user_id) }));
  const teamWeek = all.filter((x) => x.s.week.score != null);
  const avgWeek = teamWeek.length ? Math.round(teamWeek.reduce((a, x) => a + x.s.week.score, 0) / teamWeek.length) : null;
  const openAll = all.reduce((a, x) => a + x.s.overdue, 0);
  const doneToday = all.reduce((a, x) => a + x.s.day.counts.completed, 0), plannedToday = all.reduce((a, x) => a + x.s.day.counts.total, 0);

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Team</span><h2 class="li-h2">${esc(state.team.name)}</h2></div>
      ${state.isOwner ? `<button type="button" class="li-btn small" id="li-rename-team">Rename</button>` : ""}
    </header>
    <div class="li-kpis">
      ${tile("People", String(people.length), `${people.length - 1} colleague${people.length - 1 === 1 ? "" : "s"} · ${state.invites.length} invited`)}
      ${tile("Done today", `${doneToday}<small>/${plannedToday}</small>`, plannedToday ? `${pct(doneToday, plannedToday)}% across the team` : "Nothing planned yet")}
      ${tile("Team weekly score", scoreValue(avgWeek), "Average of everyone's weekly score", scoreTone(avgWeek))}
      ${tile("Overdue", String(openAll), "Across the team", openAll ? "red" : "green")}
    </div>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Everyone's progress</span></div>
      <div class="li-table-wrap"><table class="li-team-table">
        <thead><tr><th>Person</th><th>Today</th><th>Daily score</th><th>Weekly score</th><th>30-day completion</th><th>Overdue</th><th>Last done</th><th></th></tr></thead>
        <tbody>${all.map(({ m, s }) => `<tr>
          <td><a class="li-link li-person" href="#/team/${esc(m.user_id)}">${esc(m.name)}</a>${m.role !== "member" ? ` <span class="li-pill ${esc(m.role)}">${esc(ROLE_LABELS[m.role])}</span>` : ""}${m.user_id === state.me ? ` <small class="li-muted">(you)</small>` : ""}</td>
          <td>${s.day.counts.completed}/${s.day.counts.total}</td>
          <td class="tone-${scoreTone(s.day.score)}">${s.day.score ?? "—"}</td>
          <td class="tone-${scoreTone(s.week.score)}">${s.week.score ?? "—"}</td>
          <td>${s.month.totals.completion_rate == null ? "—" : s.month.totals.completion_rate + "%"}</td>
          <td class="${s.overdue ? "tone-red" : ""}">${s.overdue}</td>
          <td>${s.lastDone ? esc(relativeDay(s.lastDone, today)) : "—"}</td>
          <td><span class="li-btn-row"><button type="button" class="li-btn small" data-assign="${esc(m.user_id)}">Assign task</button>
            ${roleButton(m)}</span></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>
    <section class="li-card" id="li-invites">
      <div class="li-card-head"><span class="card-label">Invite ${state.isOwner ? "people" : "colleagues"}</span></div>
      <p class="li-sub">Sign-up is by invitation only. Add their email, then send them the sign-up link. They create their account with that email and join ${state.isOwner ? "as a colleague or an admin" : "as a colleague"}.</p>
      <form class="li-quick-add today-add" id="li-invite-form" autocomplete="off">
        <input type="email" name="email" placeholder="colleague@example.com" aria-label="Their email" required>
        ${state.isOwner ? `<select name="role" aria-label="Join as"><option value="member">as a colleague</option><option value="admin">as an admin</option></select>` : ""}
        <button type="submit">Invite</button>
      </form>
      ${state.invites.length ? `<ul class="li-mini">${state.invites.map((i) => `<li><span>${esc(i.email)}${i.role === "admin" ? ` <span class="li-pill admin">Admin</span>` : ""} <small class="li-muted">invited ${esc(formatDay(dayOf(i.created_at, state.timeZone) || today))}</small></span>
        <span class="li-btn-row"><button type="button" class="li-btn small" data-copy-link>Copy sign-up link</button>
        <button type="button" class="li-btn small danger-ghost" data-revoke-invite="${esc(i.id)}">Cancel</button></span></li>`).join("")}</ul>`
        : `<p class="li-empty">No pending invitations.</p>`}
    </section>`;

  el.querySelectorAll("[data-assign]").forEach((b) => b.addEventListener("click", () => openTaskForm({ user_id: b.dataset.assign, date: today })));
  wireRoleButtons(el);
  el.querySelector("#li-rename-team")?.addEventListener("click", async () => {
    openModal({ eyebrow: "Team", title: "Rename the team", submitLabel: "Save",
      body: `<label class="li-field full">Team name<input name="name" maxlength="80" required value="${esc(state.team.name)}"></label>`,
      async onSubmit(v) { if (!v.name.trim()) throw new Error("Give the team a name."); await renameTeam(v.name.trim()); toast("Team renamed"); } });
  });
  el.querySelector("#li-invite-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.elements.email.value.trim();
    const role = e.target.elements.role?.value === "admin" ? "admin" : "member";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Enter a valid email address.", "error"); return; }
    await inviteMember(email, role).then(() => toast(`Invited ${email}${role === "admin" ? " as an admin" : ""}. Send them the sign-up link.`), () => {});
  });
  el.querySelectorAll("[data-copy-link]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(signupLink()); toast("Sign-up link copied"); }
    catch { toast(`Sign-up link: ${signupLink()}`); }
  }));
  el.querySelectorAll("[data-revoke-invite]").forEach((b) => b.addEventListener("click", async () => {
    if (await confirmDialog("Cancel this invitation?", "Cancel invitation")) await revokeInvite(b.dataset.revokeInvite).then(() => toast("Invitation cancelled"), () => {});
  }));
}

function renderMember(el, userId) {
  const m = state.members.find((x) => x.user_id === userId);
  if (!m) { el.innerHTML = `<p class="li-empty">That person isn't on the team. <a class="li-link" href="#/team">Back to Team</a></p>`; return; }
  if (!managesPerson(m)) { el.innerHTML = `<p class="li-empty">Admins see the colleagues they manage. <a class="li-link" href="#/team">Back to Team</a></p>`; return; }
  const today = state.today;
  const s = stats(userId);
  const wk = weekRange(today);
  const open = sortTasks(s.tasks.filter((t) => !["completed", "cancelled"].includes(t.status) && (t.date <= addDays(today, 7) || isOverdue(t, today))), today);
  const recent = s.tasks.filter((t) => t.status === "completed" && dayOf(t.completed_at, state.timeZone) >= addDays(today, -14))
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  const self = userId === state.me;

  el.innerHTML = `
    <header class="li-view-head">
      <div><a class="li-link" href="#/team">&#8249; Team</a><h2 class="li-h2">${esc(m.name)}</h2><span class="li-sub">${esc(m.email)} · ${esc(ROLE_LABELS[m.role] || "Colleague")}</span></div>
      <div class="li-btn-row">
        <button type="button" class="li-btn primary" data-assign>${self ? "+ New task" : "Assign task"}</button>
        <button type="button" class="li-btn" id="li-member-pdf">Today's report (PDF)</button>
        ${roleButton(m)}
        ${self || !state.isOwner ? "" : `<button type="button" class="li-btn danger-ghost" id="li-remove-member">Remove from team</button>`}
      </div>
    </header>
    <div class="li-kpis">
      ${tile("Today", `${s.day.counts.completed}<small>/${s.day.counts.total}</small>`, s.day.counts.total ? `${pct(s.day.counts.completed, s.day.counts.total)}% complete` : "Nothing planned")}
      ${tile("Daily score", scoreValue(s.day.score), "", scoreTone(s.day.score))}
      ${tile("Weekly score", scoreValue(s.week.score), `${s.week.totals.completed}/${s.week.totals.total} tasks · ${formatDay(wk.start, { month: "short", day: "numeric" })}–`, scoreTone(s.week.score))}
      ${tile("30-day completion", s.month.totals.completion_rate == null ? "—" : `${s.month.totals.completion_rate}<small>%</small>`, `${formatMinutes(s.month.totals.minutes)} logged`, scoreTone(s.month.totals.completion_rate))}
      ${tile("Overdue", String(s.overdue), "", s.overdue ? "red" : "green")}
    </div>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Open work (next 7 days and overdue)</span></div>
      ${taskList(open, { showDate: true, empty: "Nothing open. Assign something?" })}
    </section>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Done in the last 14 days, with learning logs</span></div>
      ${recent.length ? `<ul class="li-mini li-learned">${recent.map((t) => `<li><span><b>${esc(t.title)}</b> <small class="li-muted">${esc(formatDay(dayOf(t.completed_at, state.timeZone)))}</small>
        ${t.learning_solved || t.learning_changed ? `<br><small>${esc([t.learning_changed, t.learning_how, t.learning_solved].filter(Boolean).join(" · "))}</small>` : `<br><small class="li-muted">No learning log</small>`}${fileList(t.id)}</span></li>`).join("")}</ul>`
        : `<p class="li-empty">Nothing completed in the last 14 days.</p>`}
    </section>`;

  el.querySelector("[data-assign]").addEventListener("click", () => openTaskForm({ user_id: userId, date: today }));
  el.querySelector("#li-member-pdf").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await downloadReport({ period: "day", start: today, end: today, label: formatDay(today, { weekday: "long", month: "long", day: "numeric", year: "numeric" }), userId, name: m.name });
    } catch (err) { toast("Couldn't make the PDF: " + err.message, "error"); }
    finally { btn.disabled = false; }
  });
  el.querySelector("#li-remove-member")?.addEventListener("click", () => confirmRemoval(m));
  wireRoleButtons(el);
}

// Removal deletes the person's account and all their data, so it asks for
// their name (without the title) to be typed first.
const withoutTitle = (s) => (s || "").trim().replace(/^(mr|ms|mrs|dr)\.\s+/i, "");
function confirmRemoval(m) {
  const typeThis = withoutTitle(m.name) || m.email;
  openModal({
    eyebrow: "Permanent",
    title: `Remove ${m.name} completely?`,
    submitLabel: "Remove permanently",
    body: `<p class="li-sub">This deletes their account and everything in it: tasks, scores, learning logs, notes and settings.
        They won't be able to sign in, and it <b>can't be undone</b>. Team milestones are recalculated without their tasks.</p>
      <p class="li-sub">Want a record first? Cancel and use <b>Today's report (PDF)</b>.</p>
      <label class="li-field">Type <b>${esc(typeThis)}</b> to confirm<input name="confirm" autocomplete="off" required></label>`,
    async onSubmit(v) {
      if (withoutTitle(v.confirm).toLowerCase() !== typeThis.toLowerCase()) throw new Error("The name doesn't match.");
      await removeMember(m.user_id);
      toast(`${m.name} was removed and their data deleted`);
      location.hash = "#/team";
    },
  });
}

// Owner only: make someone an admin, or a colleague again.
function roleButton(m) {
  if (!state.isOwner || m.role === "owner" || m.user_id === state.me) return "";
  return m.role === "admin"
    ? `<button type="button" class="li-btn small ghost" data-role="member" data-person="${esc(m.user_id)}">Remove admin</button>`
    : `<button type="button" class="li-btn small ghost" data-role="admin" data-person="${esc(m.user_id)}">Make admin</button>`;
}
function wireRoleButtons(el) {
  el.querySelectorAll("[data-role][data-person]").forEach((b) => b.addEventListener("click", async () => {
    const m = state.members.find((x) => x.user_id === b.dataset.person);
    const admin = b.dataset.role === "admin";
    const text = admin
      ? `Make ${m.name} an admin? They'll be able to see colleagues' work, assign and manage their tasks, invite colleagues and manage projects. They won't see your own tasks.`
      : `Make ${m.name} a colleague again? They'll only see and work on their own tasks.`;
    if (!(await confirmDialog(text, admin ? "Make admin" : "Remove admin"))) return;
    await setMemberRole(m.user_id, b.dataset.role).then(() => toast(admin ? `${m.name} is now an admin` : `${m.name} is a colleague again`), () => {});
  }));
}
