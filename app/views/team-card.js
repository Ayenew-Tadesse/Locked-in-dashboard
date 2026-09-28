// Team card on the Overview, under the Tasks card (owner only): everyone on
// the team with their role. Tapping a person opens their Team page.
import { state } from "../state.js";
import { isOverdue } from "../core/tasks.js";
import { esc } from "../ui/dom.js";
import { initials } from "./profile.js";

// A dot with the number of unfinished tasks (red if any are overdue).
function openDot(userId) {
  const tasks = userId === state.me ? state.tasks : state.teamTasks.filter((t) => t.user_id === userId);
  const open = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  if (!open.length) return "";
  const late = open.some((t) => isOverdue(t, state.today));
  return `<span class="li-nav-dot${late ? " late" : ""}" title="${open.length} unfinished task${open.length === 1 ? "" : "s"}${late ? ", some overdue" : ""}">${open.length}</span>`;
}

export function renderTeamCard(el) {
  if (!el) return;
  el.hidden = !state.isOwner;
  if (!state.isOwner) { el.innerHTML = ""; return; }
  const people = [...state.members].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name)));
  const colleagues = people.filter((m) => m.role !== "owner").length;
  el.innerHTML = `
    <div class="li-card-head">
      <span class="card-label">Team</span>
      <span class="li-muted li-tm-count">${people.length} ${people.length === 1 ? "person" : "people"} · ${colleagues} colleague${colleagues === 1 ? "" : "s"}</span>
    </div>
    <ul class="li-tm-list">
      ${people.map((m) => `<li>
        <a class="li-tm-row" href="#/team/${esc(m.user_id)}">
          <span class="li-avatar" aria-hidden="true">${esc(initials(m.name))}</span>
          <span class="li-tm-name">${esc(m.name)}${m.user_id === state.me ? ` <small class="li-muted">(you)</small>` : ""}</span>
          ${openDot(m.user_id)}
          <span class="li-pill li-tm-role${m.role === "owner" ? " owner" : ""}">${m.role === "owner" ? "Owner" : "Colleague"}</span>
        </a>
      </li>`).join("")}
    </ul>
    ${colleagues ? "" : `<p class="li-empty li-tm-empty">No colleagues yet. <a class="li-link" href="#/team">Invite someone</a></p>`}`;
}
