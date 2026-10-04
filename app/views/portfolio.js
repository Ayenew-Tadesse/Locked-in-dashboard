// Portfolio (owner): what hiring managers see, your share links, and a live
// preview. The page they open is portfolio.html#t=<link secret>.
import { state, toast } from "../state.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";
import { formatDay, dayOf } from "../core/dates.js";
import { buildPortfolioData } from "../core/portfolio.js";
import { renderPortfolio } from "../portfolio/render.js";
import { editorHtml, wireEditor } from "./portfolio-site.js";
import { printResume } from "../portfolio/resume.js";
import { tryInPhone } from "../portfolio/phone.js";
import "../portfolio/slider.js"; // screenshot sliders on case studies
import { countStats } from "../portfolio/count.js";
import { setupRails } from "../portfolio/rail.js";
import { setupDemos } from "../portfolio/demo.js";

let previewView = null; // the case study open in the preview

let links; // undefined: not loaded yet; null: the table isn't set up yet

// "Preview on web": your portfolio in its own tab, exactly as a hiring manager
// sees it (the real page and private-link route). It uses a private link of
// your own that lasts an hour, kept in this browser and left out of the list.
const PREVIEW_NAME = "My preview (you)";
const PREVIEW_KEY = "lockedin_pf_preview";
const PREVIEW_TAB = "lockedin-portfolio-preview";
const HOUR = 3600000;
let channel; // tells the preview tab when you save
function previewChannel() {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lockedin-portfolio");
  // Demo mode has no database: the preview tab asks this page for the data.
  if (channel) channel.onmessage = (e) => { if (e.data?.type === "hello" && state.store?.mode === "demo") channel.postMessage({ type: "data", data: previewData() }); };
  return channel;
}
/** After every portfolio save: the preview tab reloads what hiring managers see. */
export function announceSaved() {
  try { previewChannel()?.postMessage({ type: "saved", data: state.store?.mode === "demo" ? previewData() : undefined }); } catch { /* the tab refreshes on its next open */ }
}
const readPreview = () => { try { return JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null"); } catch { return null; } };
async function previewToken() {
  const s = readPreview();
  const row = s && Array.isArray(links) ? links.find((l) => l.id === s.id) : null;
  if (s?.token && s.user === state.me && new Date(s.expires_at) - Date.now() > 5 * 60000 && (!Array.isArray(links) || (row && !row.revoked_at))) return s.token;
  if (s?.id && s.user === state.me && row && !row.revoked_at) await state.store.revokePortfolioLink(s.id).catch(() => {});
  const expires_at = new Date(Date.now() + HOUR).toISOString();
  const { token, row: made } = await state.store.createPortfolioLink({ name: PREVIEW_NAME, expires_at });
  try { localStorage.setItem(PREVIEW_KEY, JSON.stringify({ id: made.id, token, expires_at, user: state.me })); } catch { /* a new link next time */ }
  if (Array.isArray(links)) links = [made, ...links];
  return token;
}
function pageUrl(query, hash) {
  return new URL("portfolio.html", location.href.split("#")[0].replace(/[^/]*$/, "")).href.split("?")[0] + "?" + query + "#" + hash;
}
export async function openWebPreview(view = previewView) {
  // Open (or reuse) the tab straight away, so pop-up blockers allow it.
  const w = window.open("", PREVIEW_TAB);
  if (!w) { toast("Allow pop-ups for this site to open the preview", "error"); return; }
  const caseHash = view === "resume" ? "page=resume" : view ? "case=" + encodeURIComponent(view) : "";
  try {
    let url;
    if (state.store.mode === "demo") url = pageUrl("demo=1&live=1", caseHash);
    else {
      if (!Array.isArray(links)) links = await state.store.listPortfolioLinks().catch(() => null);
      if (links === null) throw new Error("run the portfolio SQL update in Supabase first (20261005000000_portfolio.sql)");
      const token = await previewToken();
      url = pageUrl("preview=" + Date.now(), "t=" + encodeURIComponent(token) + (caseHash ? "&" + caseHash : ""));
    }
    w.location.href = url;
    w.focus();
  } catch (err) {
    try { if (w.location.href === "about:blank") w.close(); } catch { /* another page is open there */ }
    toast("Couldn't open the preview: " + err.message, "error");
  }
}

/** The address a hiring manager opens (the secret stays after # so it never reaches a server log). */
export function portfolioUrl(token) {
  return new URL("portfolio.html", location.href.split("#")[0].replace(/[^/]*$/, "")).href + "#t=" + encodeURIComponent(token);
}

let draft = null; // the editor's unsaved portfolio, shown in the preview while you type

function previewData() {
  const own = (x) => !x.user_id || x.user_id === state.me;
  return buildPortfolioData({
    name: state.profile?.name || "",
    preferences: draft ? { ...(state.settings.preferences || {}), portfolio: draft } : state.settings.preferences,
    tasks: state.tasks, projects: state.projects || [],
    milestones: state.milestones.filter(own), goals: state.goals.filter(own),
    weekly: Object.values(state.weekly || {}), today: state.today, timeZone: state.timeZone, year: state.year,
    commitDays: state.github?.days,
  });
}

let onChanged = null; // the Portfolio page redraws when a case study is saved from the ☰ menu
export function renderPortfolioPage(el) {
  if (onChanged) document.removeEventListener("li:portfolio-changed", onChanged);
  onChanged = () => { if (el.isConnected && location.hash.startsWith("#/portfolio")) renderPortfolioPage(el); };
  document.addEventListener("li:portfolio-changed", onChanged);
  if (state.isColleague) { el.innerHTML = `<p class="li-empty">The portfolio is for the team owner.</p>`; return; }
  previewChannel();
  draft = null;
  el.innerHTML = `
    ${editorHtml()}

    <section class="li-card" id="li-pf-links">
      <div class="li-card-head"><span class="card-label">Share links</span></div>
      <p class="li-sub">One link per company you apply to: each shows your latest saved portfolio, counts its views, and can be switched off on its own.</p>
      <form class="li-quick-add today-add li-pf-new" id="li-pf-new" autocomplete="off">
        <input name="name" maxlength="80" required placeholder="Who it's for, e.g. Acme Corp – October" aria-label="Link name">
        <select name="expires" aria-label="Link expires"><option value="">Never expires</option><option value="30">Expires in 30 days</option><option value="90" selected>Expires in 90 days</option></select>
        <button type="submit" class="li-btn primary">Create link</button>
      </form>
      <div id="li-pf-list">${linksHtml()}</div>
    </section>

    <section class="li-card li-pf-preview-card">
      <div class="li-card-head"><span class="card-label">Preview: what hiring managers see</span></div>
      <div class="li-pf-preview" id="li-pf-preview">${renderPortfolio(previewData(), { view: previewView })}</div>
    </section>`;

  const drawPreview = () => {
    el.querySelector("#li-pf-preview").innerHTML = renderPortfolio(previewData(), { view: previewView });
    countStats(el.querySelector("#li-pf-preview"));
    setupRails(el.querySelector("#li-pf-preview")); setupDemos(el.querySelector("#li-pf-preview"));
  };
  countStats(el.querySelector("#li-pf-preview"));
  setupRails(el.querySelector("#li-pf-preview")); setupDemos(el.querySelector("#li-pf-preview"));
  // Links inside the preview: open a case study, go back home, or scroll to a section.
  el.querySelector("#li-pf-preview").addEventListener("click", (e) => {
    if (tryInPhone(e)) return;
    const a = e.target.closest("[data-case],[data-home],[data-scroll],[data-resume],[data-print-resume]");
    if (!a) return;
    e.preventDefault();
    if (a.hasAttribute("data-print-resume")) { printResume(); return; }
    if (a.dataset.scroll) { el.querySelector("#" + a.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    previewView = a.hasAttribute("data-case") ? a.dataset.case : a.hasAttribute("data-resume") ? "resume" : null;
    drawPreview();
    el.querySelector(".li-pf-preview-card").scrollIntoView({ block: "start" });
  });

  // The top bar: Edit (you're here), Save, Preview on web.
  const bar = document.getElementById("li-pagebar-actions");
  const editor = wireEditor(el, {
    saved() { drawPreview(); announceSaved(); },
    rerender() { renderPortfolioPage(el); announceSaved(); },
    draft(p) { draft = p; drawPreview(); },
    reload() { renderPortfolioPage(el); },
    dirty(on) {
      const b = bar?.querySelector("#li-pf-save");
      if (!b) return;
      b.classList.toggle("primary", on);
      b.textContent = on ? "Save •" : "Save";
      b.setAttribute("aria-label", on ? "Save (unsaved changes)" : "Save");
    },
  });
  if (bar) {
    bar.innerHTML = `<div class="li-pf-modes" role="group" aria-label="Portfolio">
      <button type="button" class="li-btn small on" id="li-pf-edit" aria-current="page"><span class="li-ico" aria-hidden="true">&#9998;</span> Edit</button>
      <button type="button" class="li-btn small" id="li-pf-save">Save</button>
      <button type="button" class="li-btn small" id="li-pf-web" title="Open your portfolio in a new tab, as a hiring manager sees it. It updates when you save."><span class="li-ico" aria-hidden="true">&#8599;</span> Preview on web</button>
    </div>`;
    bar.querySelector("#li-pf-edit").addEventListener("click", () => el.querySelector("#li-pf-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    bar.querySelector("#li-pf-save").addEventListener("click", () => editor.save());
    bar.querySelector("#li-pf-web").addEventListener("click", () => openWebPreview());
  }

  el.querySelector("#li-pf-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    // Check again: the SQL may have been run since this page was opened.
    if (links === null) links = await state.store.listPortfolioLinks().catch(() => null);
    if (links === null) { toast("Run the portfolio SQL update in Supabase first (20261005000000_portfolio.sql)", "error"); drawLinks(el); return; }
    const f = e.target.elements, name = f.name.value.trim();
    if (!name) return;
    const days = Number(f.expires.value);
    try {
      const { token, row } = await state.store.createPortfolioLink({ name, expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null });
      links = [row, ...(links || [])];
      e.target.reset();
      drawLinks(el);
      showLink(name, portfolioUrl(token));
    } catch (err) { toast("Couldn't create the link: " + err.message, "error"); }
  });
  el.querySelector("#li-pf-list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-revoke-link]");
    if (!b) return;
    const l = links.find((x) => x.id === b.dataset.revokeLink);
    if (!(await confirmDialog(`Switch off the link "${l.name}"? Anyone using it will no longer see your portfolio.`, "Switch off"))) return;
    try { await state.store.revokePortfolioLink(l.id); l.revoked_at = new Date().toISOString(); drawLinks(el); toast("Link switched off"); }
    catch (err) { toast("Couldn't switch it off: " + err.message, "error"); }
  });

  if (links === undefined) {
    state.store.listPortfolioLinks().then((l) => { links = l; drawLinks(el); }, () => { links = []; drawLinks(el); });
  }
}

function drawLinks(el) { const box = el.querySelector("#li-pf-list"); if (box) box.innerHTML = linksHtml(); }

function linksHtml() {
  if (links === undefined) return `<p class="li-sub">Loading links…</p>`;
  if (links === null) return `<p class="li-sub">Share links need a small database update: run <code>20261005000000_portfolio.sql</code> in the Supabase SQL editor.</p>`;
  const shown = links.filter((l) => l.name !== PREVIEW_NAME);
  if (!shown.length) return `<p class="li-empty">No links yet. Create one for each company you apply to, so you can switch it off later.</p>`;
  const day = (ts) => formatDay(dayOf(ts, state.timeZone) || String(ts).slice(0, 10), { month: "short", day: "numeric", year: "numeric" });
  return `<ul class="li-tokens li-pf-links">${shown.map((l) => {
    const off = !!l.revoked_at, expired = !off && l.expires_at && new Date(l.expires_at) < new Date();
    return `<li class="${off || expired ? "off" : ""}">
      <span><b>${esc(l.name)}</b> <small class="li-muted li-mono">${esc(l.token_prefix)}…</small><br>
        <small class="li-muted">Created ${esc(day(l.created_at))} · ${l.views || 0} view${l.views === 1 ? "" : "s"}${l.last_viewed_at ? ` · last opened ${esc(day(l.last_viewed_at))}` : ""}
        · ${off ? "Switched off" : expired ? "Expired" : l.expires_at ? `expires ${esc(day(l.expires_at))}` : "never expires"}</small></span>
      ${off || expired ? "" : `<button type="button" class="li-btn ghost small" data-revoke-link="${esc(l.id)}">Switch off</button>`}
    </li>`;
  }).join("")}</ul>`;
}

function showLink(name, url) {
  openModal({
    eyebrow: "Copy it now", title: `Link for ${name}`, cancelLabel: "Done",
    body: `<p class="li-sub full">Send this link to the hiring manager. It's shown only now, so copy it before closing. You can switch it off from this page at any time.</p>
      <label class="li-field full">Link<input readonly value="${esc(url)}" id="li-pf-url" class="li-mono"></label>
      <div class="full li-btn-row"><button type="button" class="li-btn primary" id="li-pf-copy">Copy link</button>
        <a class="li-btn ghost" href="${esc(url)}" target="_blank" rel="noopener">Open it</a></div>`,
    onReady(form) {
      form.querySelector("#li-pf-copy").addEventListener("click", async () => {
        const input = form.querySelector("#li-pf-url");
        try { await navigator.clipboard.writeText(input.value); toast("Link copied"); }
        catch { input.select(); document.execCommand?.("copy"); toast("Link copied"); }
      });
    },
  });
}
