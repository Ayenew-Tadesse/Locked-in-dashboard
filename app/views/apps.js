// View apps: each project's app on a phone (its first screen, or a placeholder
// until it has one), with the app's name and description under it. Tapping a
// phone with a live app opens it inside a phone frame (a new tab on phones).
import { state } from "../state.js";
import { esc } from "../ui/dom.js";
import { casesOfProject } from "../core/project-links.js";
import { currentSite } from "./portfolio-site.js";
import { miniPhone, cardScreens } from "../portfolio/site.js";
import { tryInPhone } from "../portfolio/phone.js";

const okUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());

/** One entry per project, with what its case study adds (screens, a better description, the live link). */
export function appsList() {
  const cases = currentSite().cases || [];
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const fromProjects = projects.map((p) => {
    const c = casesOfProject(cases, p)[0] || {};
    return { id: p.id, title: c.title || p.name, desc: c.cardDesc || p.description || c.tag || "", c, url: c.liveUrl || p.links?.web || "" };
  });
  // Without projects, the case studies stand in.
  return fromProjects.length ? fromProjects
    : cases.map((c) => ({ id: c.id, title: c.title || "Untitled app", desc: c.cardDesc || c.tag || "", c, url: c.liveUrl || "" }));
}

function screenOf(c) {
  const chosen = cardScreens(c);
  return (chosen || []).find(Boolean) || (c.shots || []).map((x) => x?.src).find(Boolean) || "";
}

export function renderApps(el) {
  const apps = appsList();
  el.innerHTML = apps.length ? `<ul class="li-apps" aria-label="Apps">${apps.map((a) => {
    const phone = miniPhone(screenOf(a.c), `${a.title} screen`, "", "Screens coming soon");
    const live = okUrl(a.url);
    return `<li class="li-app" data-app="${esc(a.id)}">
      ${live
        ? `<a class="li-app-phone" href="${esc(a.url)}" target="_blank" rel="noopener" data-try="${esc(a.title)}" aria-label="Try ${esc(a.title)}">${phone}<span class="li-app-try">Try the app &#8599;</span></a>`
        : `<div class="li-app-phone">${phone}</div>`}
      <div class="li-app-label">
        <h3 class="li-app-title">${esc(a.title)}</h3>
        ${a.desc ? `<p class="li-app-desc">${esc(a.desc)}</p>` : ""}
      </div>
    </li>`;
  }).join("")}</ul>`
    : `<p class="li-empty">No apps yet. Add a project, and its app shows here on a phone.</p>`;
  el.querySelector(".li-apps")?.addEventListener("click", (e) => tryInPhone(e));
}
