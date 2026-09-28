// Team card on the Overview, under the Tasks card (owner only): everyone on
// the team with their role. Tapping a person opens their Team page.
import { state } from "../state.js";
import { esc } from "../ui/dom.js";
import { initials } from "./profile.js";

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
          <span class="li-pill li-tm-role${m.role === "owner" ? " owner" : ""}">${m.role === "owner" ? "Owner" : "Colleague"}</span>
        </a>
      </li>`).join("")}
    </ul>
    ${colleagues ? "" : `<p class="li-empty li-tm-empty">No colleagues yet. <a class="li-link" href="#/team">Invite someone</a></p>`}`;
}
