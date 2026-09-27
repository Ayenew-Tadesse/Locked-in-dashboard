// The ☰ menu (top left): Profile, Settings, Dark / Light, and Log out.
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

let menu, btn, lastFocus;

/** Adds the ☰ button to the page's top row and builds the (closed) drawer. */
export function setupMenu({ onLogout } = {}) {
  if (document.getElementById("li-menu")) return;
  const top = document.querySelector(".page-top");
  const bar = document.createElement("div");
  bar.className = "li-topbar";
  btn = document.createElement("button");
  btn.type = "button";
  btn.id = "li-menu-btn";
  btn.className = "li-menu-btn";
  btn.setAttribute("aria-label", "Menu");
  btn.setAttribute("aria-expanded", "false");
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
    ${link("settings", "Settings", `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`)}
    <div class="li-menu-section">
      <span class="card-label">Appearance</span>
      <div class="li-seg li-theme" role="group" aria-label="Background">
        <button type="button" class="li-btn small${theme === "dark" ? " on" : ""}" data-theme="dark" aria-pressed="${theme === "dark"}">Dark</button>
        <button type="button" class="li-btn small${theme === "light" ? " on" : ""}" data-theme="light" aria-pressed="${theme === "light"}">Light</button>
      </div>
    </div>
    ${state.store?.mode === "supabase" ? `<button type="button" class="li-menu-link li-menu-logout" data-logout><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg><span>Log out</span></button>` : ""}`;
}

export function openMenu() {
  renderMenu();
  lastFocus = document.activeElement;
  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  document.documentElement.classList.add("li-modal-open");
  menu.querySelector(".li-menu-link, [data-close]")?.focus();
}
export function closeMenu() {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  btn.setAttribute("aria-expanded", "false");
  document.documentElement.classList.remove("li-modal-open");
  if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus();
}
