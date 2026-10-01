// Team page (owner only): everyone's progress, invitations, and each
// person's work, learning logs and daily report.
import { state, inviteMember, revokeInvite, removeMember, renameTeam, toast, setMemberRole, managesPerson, assignsTo, can, setAdminPermissions, ROLE_LABELS, decideAccessRequest } from "../state.js";
import { ADMIN_PERMISSION_GROUPS, ADMIN_DEFAULTS, adminPermissions, permissionChanges } from "../core/permissions.js";
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
      <span class="li-btn-row">
        ${state.isOwner ? `<button type="button" class="li-btn small" id="li-admin-management">Admin management</button>` : ""}
        ${can("rename_team") ? `<button type="button" class="li-btn small" id="li-rename-team">Rename</button>` : ""}
      </span>
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
          <td><span class="li-btn-row">${assignsTo(m) ? `<button type="button" class="li-btn small" data-assign="${esc(m.user_id)}">Assign task</button>` : ""}
            ${roleButton(m)}</span></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>
    ${state.isAdmin ? myPermissionsCard() : ""}
    ${can("access_requests") && state.accessRequests?.length ? `<section class="li-card" id="li-access-requests">
      <div class="li-card-head"><span class="card-label">Access requests <span class="li-nav-dot">${state.accessRequests.length}</span></span></div>
      <p class="li-sub">People who tried to join without an invitation. Approve to invite them as a colleague (they then sign up with that email), or decline.</p>
      <ul class="li-mini li-requests">${state.accessRequests.map((r) => `<li>
        <span><b>${esc(r.name || r.email)}</b>${r.name ? ` <small class="li-muted">${esc(r.email)}</small>` : ""}
          <small class="li-muted">asked ${esc(relativeDay(dayOf(r.created_at, state.timeZone) || today, today))}</small>
          ${r.note ? `<br><span class="li-request-note">${esc(r.note)}</span>` : ""}</span>
        <span class="li-btn-row"><button type="button" class="li-btn small primary" data-approve="${esc(r.id)}">Approve</button>
          <button type="button" class="li-btn small danger-ghost" data-decline="${esc(r.id)}">Decline</button></span></li>`).join("")}</ul>
    </section>` : ""}
    ${can("invite") || can("cancel_invites") ? `<section class="li-card" id="li-invites">
      <div class="li-card-head"><span class="card-label">Invite ${state.isOwner ? "people" : "colleagues"}</span></div>
      <p class="li-sub">Sign-up is by invitation only. Add their email, then send them the sign-up link. They create their account with that email and join ${state.isOwner ? "as a colleague or an admin" : "as a colleague"}.</p>
      ${can("invite") ? `<form class="li-quick-add today-add" id="li-invite-form" autocomplete="off">
        <input type="email" name="email" placeholder="colleague@example.com" aria-label="Their email" required>
        ${state.isOwner ? `<select name="role" aria-label="Join as"><option value="member">as a colleague</option><option value="admin">as an admin</option></select>` : ""}
        <button type="submit">Invite</button>
      </form>` : ""}
      ${state.invites.length ? `<ul class="li-mini">${state.invites.map((i) => `<li><span>${esc(i.email)}${i.role === "admin" ? ` <span class="li-pill admin">Admin</span>` : ""} <small class="li-muted">invited ${esc(formatDay(dayOf(i.created_at, state.timeZone) || today))}</small></span>
        <span class="li-btn-row"><button type="button" class="li-btn small" data-copy-link>Copy sign-up link</button>
        ${can("cancel_invites") ? `<button type="button" class="li-btn small danger-ghost" data-revoke-invite="${esc(i.id)}">Cancel</button>` : ""}</span></li>`).join("")}</ul>`
        : `<p class="li-empty">No pending invitations.</p>`}
    </section>` : ""}`;

  el.querySelectorAll("[data-approve], [data-decline]").forEach((b) => b.addEventListener("click", async () => {
    const approve = b.hasAttribute("data-approve"), id = b.dataset.approve || b.dataset.decline;
    const r = (state.accessRequests || []).find((x) => x.id === id);
    if (!r) return;
    if (!approve && !(await confirmDialog(`Decline ${r.name || r.email}'s request?`, "Decline"))) return;
    b.disabled = true;
    await decideAccessRequest(id, approve).then(
      () => toast(approve ? `Approved: ${r.email} is invited. Let them know they can sign up now.` : "Request declined"), () => { b.disabled = false; });
  }));
  el.querySelector("#li-admin-management")?.addEventListener("click", openAdminManagement);
  el.querySelectorAll("[data-assign]").forEach((b) => b.addEventListener("click", () => openTaskForm({ user_id: b.dataset.assign, date: today })));
  wireRoleButtons(el);
  el.querySelector("#li-rename-team")?.addEventListener("click", async () => {
    openModal({ eyebrow: "Team", title: "Rename the team", submitLabel: "Save",
      body: `<label class="li-field full">Team name<input name="name" maxlength="80" required value="${esc(state.team.name)}"></label>`,
      async onSubmit(v) { if (!v.name.trim()) throw new Error("Give the team a name."); await renameTeam(v.name.trim()); toast("Team renamed"); } });
  });
  el.querySelector("#li-invite-form")?.addEventListener("submit", async (e) => {
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
        ${assignsTo(m) ? `<button type="button" class="li-btn primary" data-assign>${self ? "+ New task" : "Assign task"}</button>` : ""}
        <button type="button" class="li-btn" id="li-member-pdf">Today's report (PDF)</button>
        ${roleButton(m)}
        ${self || !(state.isOwner || (m.role === "member" && can("remove_colleagues"))) ? "" : `<button type="button" class="li-btn danger-ghost" id="li-remove-member">Remove from team</button>`}
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

  el.querySelector("[data-assign]")?.addEventListener("click", () => openTaskForm({ user_id: userId, date: today }));
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
      ? `Make ${m.name} an admin? They'll get the default admin permissions (see colleagues' work, assign and manage their tasks, invite colleagues, manage projects); change them any time under Admin management. They won't see your own tasks.`
      : `Make ${m.name} a colleague again? They'll only see and work on their own tasks.`;
    if (!(await confirmDialog(text, admin ? "Make admin" : "Remove admin"))) return;
    await setMemberRole(m.user_id, b.dataset.role).then(() => toast(admin ? `${m.name} is now an admin` : `${m.name} is a colleague again`), () => {});
  }));
}

// An admin's own permissions (read only).
function myPermissionsCard() {
  const p = adminPermissions(state.team?.permissions);
  return `<section class="li-card" id="li-my-permissions">
    <div class="li-card-head"><span class="card-label">Your admin permissions</span></div>
    <p class="li-sub">Set by the team owner.</p>
    <div class="li-perm-groups">${ADMIN_PERMISSION_GROUPS.map(([group, list]) => `<div class="li-perm-group"><h3>${esc(group)}</h3><ul class="li-perm-list">
      ${list.map(([k, label]) => `<li class="${p[k] ? "on" : "off"}"><span aria-hidden="true">${p[k] ? "&#10003;" : "&#8212;"}</span> ${esc(label)}<span class="li-visually-hidden">: ${p[k] ? "allowed" : "not allowed"}</span></li>`).join("")}
    </ul></div>`).join("")}</div>
  </section>`;
}

// Owner: Admin management. Pick an admin, tick what they may do, save (or
// save the same for every admin, or go back to the defaults).
function openAdminManagement() {
  const admins = state.members.filter((m) => m.role === "admin");
  if (!admins.length) {
    openModal({ eyebrow: "Team", title: "Admin management", submitLabel: "OK",
      body: `<p class="li-sub full">No admins yet. Use <b>Make admin</b> next to someone in the table, then come back to choose what they may do.</p>`, async onSubmit() {} });
    return;
  }
  if (state.team?.permissionsReady === false) {
    openModal({ eyebrow: "Team", title: "Admin management", submitLabel: "OK",
      body: `<p class="li-sub full">Admin permissions need one more database update: run <code>supabase/migrations/20261012000000_admin_permissions.sql</code> in Supabase's SQL Editor, then refresh.</p>`, async onSubmit() {} });
    return;
  }
  let who = admins[0].user_id;
  const checklist = (perms) => ADMIN_PERMISSION_GROUPS.map(([group, list]) => `<fieldset class="li-perm-group"><legend>${esc(group)}</legend>
    ${list.map(([k, label, on]) => `<label class="li-check-row"><input type="checkbox" name="perm_${k}"${perms[k] ? " checked" : ""}><span>${esc(label)}${on ? "" : `<small class="li-muted">Off by default</small>`}</span></label>`).join("")}
  </fieldset>`).join("");
  const form = openModal({
    eyebrow: "Team", title: "Admin management", submitLabel: "Save for this admin", wide: true,
    extraButtons: `${admins.length > 1 ? `<button type="button" class="li-btn" data-perm-all>Copy to all admins</button>` : ""}<button type="button" class="li-btn ghost" data-perm-reset>Reset to defaults</button>`,
    body: `<p class="li-sub full">Choose what each admin may do. Only you see this; the database enforces it. Admins can never make or remove admins, change these settings, or see your own tasks, portfolio, resume or tokens.</p>
      <label class="li-field full">Admin<select name="admin">${admins.map((m) => `<option value="${esc(m.user_id)}">${esc(m.name)}${m.email ? ` · ${esc(m.email)}` : ""}</option>`).join("")}</select></label>
      <div class="li-perm-groups full" data-perm-list>${checklist(adminPermissions(admins[0].permissions))}</div>`,
    async onSubmit() {
      const chosen = read();
      await setAdminPermissions(who, permissionChanges(chosen));
      toast(`Saved ${state.members.find((m) => m.user_id === who)?.name || "the admin"}'s permissions`);
    },
  });
  const read = () => Object.fromEntries(Object.keys(ADMIN_DEFAULTS).map((k) => [k, !!form.querySelector(`[name="perm_${k}"]`)?.checked]));
  const draw = (perms) => { form.querySelector("[data-perm-list]").innerHTML = checklist(perms); };
  form.querySelector("[name=admin]").addEventListener("change", (e) => { who = e.target.value; draw(adminPermissions(state.members.find((m) => m.user_id === who)?.permissions)); });
  form.querySelector("[data-perm-reset]").addEventListener("click", () => draw(ADMIN_DEFAULTS));
  // The confirmation replaces this window; the choices are read before it opens.
  form.querySelector("[data-perm-all]")?.addEventListener("click", async () => {
    const chosen = permissionChanges(read());
    if (!(await confirmDialog(`Give all ${admins.length} admins exactly these permissions?`, "Copy to all"))) return;
    await setAdminPermissions(null, chosen).then(() => toast(`Saved for all ${admins.length} admins`), () => {});
  });
}
