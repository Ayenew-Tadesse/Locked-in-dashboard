// The ☰ menu (top left): Profile, Daily report, Projects (owner), Settings, Light / Dark mode, and Log out (the
// front-page Log out button is hidden; the menu presses it).
import { state } from "../state.js";
import { esc } from "./dom.js";
import { displayName } from "../core/people.js";
import { initials } from "../views/profile.js";

const THEME_KEY = "li_theme";

/** The saved theme ("dark" is the original look). Per device. */
export function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* still applies for this visit */ }
}

let menu, btn, lastFocus, logoutHandler;
const logoutShown = () => !!document.getElementById("logout-btn") && !document.getElementById("logout-btn").hidden;

/** Adds the ☰ button to the page's top row and builds the (closed) drawer. */
export function setupMenu({ onLogout } = {}) {
  if (document.getElementById("li-menu")) return;
  logoutHandler = onLogout;
  const top = document.querySelector(".page-top");
  const bar = document.createElement("div");
  bar.className = "li-topbar";
  btn = document.createElement("button");
  btn.type = "button";
  btn.id = "li-menu-btn";
  btn.className = "li-menu-btn";
  btn.setAttribute("aria-label", "Menu");
  btn.setAttribute("aria-expanded", "false");
  document.getElementById("li-menu-btn-desk")?.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "li-menu");
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
  bar.appendChild(btn);
  const logout = document.getElementById("logout-btn");
  top.insertBefore(bar, top.firstChild);
  if (logout) bar.appendChild(logout);

  menu = document.createElement("div");
  menu.id = "li-menu";
  menu.className = "li-menu-backdrop";
  menu.hidden = true;
  menu.innerHTML = `<nav class="li-menu" role="dialog" aria-modal="true" aria-label="Menu"></nav>`;
  document.body.appendChild(menu);

  btn.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener("click", (e) => {
    if (e.target === menu || e.target.closest("[data-close], a")) closeMenu();
    const t = e.target.closest("[data-theme]");
    if (t) { applyTheme(t.dataset.theme); renderMenu(); }
    if (e.target.closest("[data-logout]")) onLogout?.();
    if (e.target.closest("[data-open-report]")) { closeMenu(); openDailyReport(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) closeMenu(); });
}

function renderMenu() {
  const p = state.profile || {};
  const route = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  const theme = currentTheme();
  const link = (name, label, icon) => `<a href="#/${name}" class="li-menu-link${route === name ? " active" : ""}"${route === name ? ' aria-current="page"' : ""}>${icon}<span>${label}</span></a>`;
  menu.firstElementChild.innerHTML = `
    <div class="li-menu-head">
      <span class="li-avatar" aria-hidden="true">${esc(initials(p.name))}</span>
      <div class="li-menu-who"><b>${esc(displayName(p) || "You")}</b><small>${esc(p.email || (state.store?.mode === "demo" ? "Preview" : ""))}</small></div>
      <button type="button" class="modal-close" data-close aria-label="Close menu">&#10005;</button>
    </div>
    ${link("profile", "Profile", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`)}
    <button type="button" class="li-menu-link" data-open-report><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><span>Daily report</span></button>
    ${state.groups?.length ? link("group", "Project groups", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M15.5 14.8c2.9-.4 5.5 1.4 5.5 4.7"/></svg>`) : ""}
    ${state.isManager && state.projects !== undefined ? link("projects", "Projects", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`) : ""}
    ${!state.isColleague ? link("portfolio", "Portfolio", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>`) : ""}
    ${!state.isColleague ? link("resume", "Resume", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>`) : ""}
    ${link("settings", "Settings", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`)}
    <button type="button" class="li-menu-link" data-theme="${theme === "dark" ? "light" : "dark"}" aria-label="Switch to ${theme === "dark" ? "light" : "dark"} background">${theme === "dark"
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span>Light mode</span>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><span>Dark mode</span>`}</button>
    ${logoutShown() ? `<button type="button" class="li-menu-link li-menu-logout" data-logout><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg><span>Log out</span></button>` : ""}`;
}

/**
 * Open today's Daily report (the Overview's report card), going to the
 * Overview first when you're on another page, and bring it into view.
 */
export function openDailyReport() {
  const show = () => {
    const card = document.getElementById("report-card");
    if (!card) return;
    if (card.hidden) document.getElementById("report-btn")?.click();
    card.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    card.setAttribute("tabindex", "-1");
    card.focus({ preventScroll: true });
  };
  if (location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]) {
    addEventListener("hashchange", () => requestAnimationFrame(() => requestAnimationFrame(show)), { once: true });
    location.hash = "#/";
  } else show();
}

export function openMenu() {
  renderMenu();
  lastFocus = document.activeElement;
  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  document.getElementById("li-menu-btn-desk")?.setAttribute("aria-expanded", "true");
  document.documentElement.classList.add("li-modal-open");
  menu.querySelector(".li-menu-link, [data-close]")?.focus();
}
export function closeMenu() {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  btn.setAttribute("aria-expanded", "false");
  document.documentElement.classList.remove("li-modal-open");
  if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
}

/**
 * On tablets, laptops and desktops a ☰ button sits at the right end of the
 * tab row (the top-left one is hidden there); it opens the same menu.
 * `el` is redrawn with the tab row; CSS shows it from 700px.
 */
export function renderMenuBar(el) {
  if (!el) return;
  el.innerHTML = `<button type="button" class="li-menu-btn" id="li-menu-btn-desk" aria-label="Menu" aria-haspopup="dialog" aria-controls="li-menu" aria-expanded="${menu && !menu.hidden}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>`;
  if (!el.dataset.wired) {
    el.dataset.wired = "1";
    el.addEventListener("click", (e) => {
      if (!e.target.closest("#li-menu-btn-desk")) return;
      if (menu && !menu.hidden) closeMenu(); else openMenu();
    });
  }
}
