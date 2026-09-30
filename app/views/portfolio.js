// Portfolio (owner): what hiring managers see, your share links, and a live
// preview. The page they open is portfolio.html#t=<link secret>.
import { state, toast } from "../state.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";
import { formatDay, dayOf } from "../core/dates.js";
import { categoriesOf } from "../core/tasks.js";
import { PORTFOLIO_SECTIONS, PORTFOLIO_LINKS, INDUSTRIES, RESEARCH_METHODS, portfolioPrefs, buildPortfolioData } from "../core/portfolio.js";
import { renderPortfolio } from "../portfolio/render.js";
import { siteEditorHtml, wireSiteEditor } from "./portfolio-site.js";

let previewView = null; // the case study open in the preview

let links; // undefined: not loaded yet; null: the table isn't set up yet

/** The address a hiring manager opens (the secret stays after # so it never reaches a server log). */
export function portfolioUrl(token) {
  return new URL("portfolio.html", location.href.split("#")[0].replace(/[^/]*$/, "")).href + "#t=" + encodeURIComponent(token);
}

function previewData() {
  const own = (x) => !x.user_id || x.user_id === state.me;
  return buildPortfolioData({
    name: state.profile?.name || "",
    preferences: state.settings.preferences,
    tasks: state.tasks, projects: state.projects || [],
    milestones: state.milestones.filter(own), goals: state.goals.filter(own),
    weekly: Object.values(state.weekly || {}), today: state.today, timeZone: state.timeZone,
  });
}

export function renderPortfolioPage(el) {
  if (state.isColleague) { el.innerHTML = `<p class="li-empty">The portfolio is for the team owner.</p>`; return; }
  const p = portfolioPrefs(state.settings.preferences);
  const d = p.details;
  const cats = categoriesOf(state.tasks);
  el.innerHTML = `
    <section class="li-card li-pf-intro">
      <p class="li-sub">A private page for hiring managers, built live from your dashboard: your activity, projects, milestones, plan and how you work.
        Only people with one of your links can open it, it shows only <b>your</b> work (nothing about colleagues, no files or private notes), and you can switch a link off at any time.</p>
    </section>

    ${siteEditorHtml()}

    <section class="li-card" id="li-pf-links">
      <div class="li-card-head"><span class="card-label">Share links</span></div>
      <form class="li-quick-add today-add li-pf-new" id="li-pf-new" autocomplete="off">
        <input name="name" maxlength="80" required placeholder="Who it's for, e.g. Acme Corp – October" aria-label="Link name">
        <select name="expires" aria-label="Link expires"><option value="">Never expires</option><option value="30">Expires in 30 days</option><option value="90" selected>Expires in 90 days</option></select>
        <button type="submit" class="li-btn primary">Create link</button>
      </form>
      <div id="li-pf-list">${linksHtml()}</div>
    </section>

    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Profile details and sections</span></div>
      <form class="li-form li-pf-form" id="li-pf-form" autocomplete="off">
        <fieldset class="full li-pf-group"><legend>The basics</legend>
          <label class="li-field">Title<input name="d_title" maxlength="80" value="${esc(d.title)}" placeholder="e.g. Senior UI/UX Designer"></label>
          <label class="li-field">Years of experience<input name="d_years" type="number" min="0" max="60" inputmode="numeric" value="${esc(d.years)}" placeholder="5"></label>
          <label class="li-field">Location<input name="d_location" maxlength="80" value="${esc(d.location)}" placeholder="e.g. Addis Ababa, Ethiopia"></label>
          <div class="li-field"><span>Open to</span><div class="li-pf-checks">
            ${[["remote", "Remote"], ["hybrid", "Hybrid"], ["relocation", "Relocation"]].map(([k, l]) => `<label class="li-check-row"><input type="checkbox" name="d_open_${k}"${d.open[k] ? " checked" : ""}> ${l}</label>`).join("")}
          </div></div>
          <label class="li-field full">Roles you're looking for<input name="d_roles" maxlength="200" value="${esc(d.roles)}" placeholder="e.g. Senior Product Designer, Lead UX Designer"></label>
          <label class="li-field full">Headline <small class="li-muted">(leave empty to use "Title · years of experience")</small><input name="headline" maxlength="120" value="${esc(p.headline)}" placeholder="e.g. Senior UI/UX Designer designing booking and commerce products"></label>
          <label class="li-field full">About you<textarea name="bio" rows="3" maxlength="1500" placeholder="Two or three sentences: who you are, what you design, for whom.">${esc(p.bio)}</textarea></label>
        </fieldset>

        <fieldset class="full li-pf-group"><legend>Experience</legend>
          <div class="li-pf-exp" id="li-pf-exp">${d.experience.map(expRow).join("")}</div>
          <button type="button" class="li-btn small" id="li-pf-exp-add">+ Add a role</button>
        </fieldset>

        <fieldset class="full li-pf-group"><legend>Highlights and industries</legend>
          <label class="li-field full">Highlights <small class="li-muted">(one per line, up to 6: results with numbers work best)</small><textarea name="d_highlights" rows="4" maxlength="1500" placeholder="Redesigned checkout: conversion +18%&#10;Cut booking from 7 steps to 4&#10;Built a design system used by 3 product teams">${esc(d.highlights.join("\n"))}</textarea></label>
          <div class="li-field full"><span>Industries</span><div class="li-pf-checks">
            ${INDUSTRIES.map((x) => `<label class="li-check-row"><input type="checkbox" name="d_ind[]" value="${esc(x)}"${d.industries.includes(x) ? " checked" : ""}> ${esc(x)}</label>`).join("")}
          </div></div>
          <label class="li-field full">Other industries <small class="li-muted">(comma-separated)</small><input name="d_ind_other" maxlength="200" value="${esc(d.industries.filter((x) => !INDUSTRIES.includes(x)).join(", "))}"></label>
        </fieldset>

        <fieldset class="full li-pf-group"><legend>How you work</legend>
          <label class="li-field full">My approach<textarea name="approach" rows="3" maxlength="2000" placeholder="Your design philosophy in a few sentences.">${esc(p.approach)}</textarea></label>
          <label class="li-field full">Process steps <small class="li-muted">(one per line)</small><textarea name="d_process" rows="4" maxlength="800" placeholder="Research&#10;Problem framing&#10;User flows&#10;Wireframes and prototypes&#10;Usability testing&#10;Handoff and measuring">${esc(d.process.join("\n"))}</textarea></label>
          <div class="li-field full"><span>Research methods</span><div class="li-pf-checks">
            ${RESEARCH_METHODS.map((x) => `<label class="li-check-row"><input type="checkbox" name="d_meth[]" value="${esc(x)}"${d.methods.includes(x) ? " checked" : ""}> ${esc(x)}</label>`).join("")}
          </div></div>
          <label class="li-field full">Other methods <small class="li-muted">(comma-separated)</small><input name="d_meth_other" maxlength="200" value="${esc(d.methods.filter((x) => !RESEARCH_METHODS.includes(x)).join(", "))}"></label>
          <label class="li-field full">Working with developers and product<textarea name="d_collaboration" rows="2" maxlength="1000" placeholder="e.g. Design systems in Figma, dev-mode specs, weekly design reviews, pairing on tricky states.">${esc(d.collaboration)}</textarea></label>
          <label class="li-field full">What I bring<textarea name="d_different" rows="2" maxlength="1000" placeholder="e.g. Accessibility (WCAG AA), bilingual Amharic/English interfaces, I prototype in code.">${esc(d.different)}</textarea></label>
        </fieldset>

        <fieldset class="full li-pf-group"><legend>Skills and tools</legend>
          <label class="li-field full">Skills <small class="li-muted">(comma-separated)</small><input name="d_skills" maxlength="400" value="${esc(d.skills.join(", "))}" placeholder="Design systems, Interaction design, Prototyping, Accessibility, UX writing"></label>
          <label class="li-field full">Tools <small class="li-muted">(comma-separated)</small><input name="d_tools" maxlength="400" value="${esc(d.tools.join(", "))}" placeholder="Figma, FigJam, Framer, Protopie, Maze, Adobe CC"></label>
        </fieldset>

        <fieldset class="full li-pf-group"><legend>Contact links</legend>
          ${PORTFOLIO_LINKS.map(([k, label]) => `<label class="li-field">${esc(label)}<input name="link_${k}" maxlength="300" value="${esc(p.links[k] || "")}" placeholder="${k === "email" ? "you@example.com" : "https://…"}"></label>`).join("")}
        </fieldset>

        <fieldset class="full li-assignees"><legend>Sections to show</legend>
          ${PORTFOLIO_SECTIONS.map(([k, label, hint]) => `<label class="li-check-row" title="${esc(hint)}"><input type="checkbox" name="show_${k}"${p.show[k] ? " checked" : ""}> ${esc(label)}</label>`).join("")}
        </fieldset>
        ${cats.length ? `<fieldset class="full li-assignees"><legend>"How I work" shows tasks from <small class="li-muted">(none ticked: all categories)</small></legend>
          ${cats.map((c) => `<label class="li-check-row"><input type="checkbox" name="cats[]" value="${esc(c)}"${p.categories.includes(c) ? " checked" : ""}> ${esc(c)}</label>`).join("")}
        </fieldset>` : ""}
        <div class="li-form-actions full"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save</button></div>
      </form>
    </section>

    <section class="li-card li-pf-preview-card">
      <div class="li-card-head"><span class="card-label">Preview: what hiring managers see</span></div>
      <div class="li-pf-preview" id="li-pf-preview">${renderPortfolio(previewData(), { view: previewView })}</div>
    </section>`;

  const drawPreview = () => { el.querySelector("#li-pf-preview").innerHTML = renderPortfolio(previewData(), { view: previewView }); };
  // Links inside the preview: open a case study, go back home, or scroll to a section.
  el.querySelector("#li-pf-preview").addEventListener("click", (e) => {
    const a = e.target.closest("[data-case],[data-home],[data-scroll]");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.scroll) { el.querySelector("#" + a.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    previewView = a.hasAttribute("data-case") ? a.dataset.case : null;
    drawPreview();
    el.querySelector(".li-pf-preview-card").scrollIntoView({ block: "start" });
  });
  // Site saved: redraw the preview (or the whole page after an import or a case-study change).
  wireSiteEditor(el, (full) => (full ? renderPortfolioPage(el) : drawPreview()));

  el.querySelector("#li-pf-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const lines = (v) => v.split("\n").map((x) => x.trim()).filter(Boolean);
    const commas = (v) => v.split(",").map((x) => x.trim()).filter(Boolean);
    const ticked = (name) => [...e.target.querySelectorAll(`[name="${name}"]:checked`)].map((c) => c.value);
    const details = {
      title: f.d_title.value.trim(), years: f.d_years.value === "" ? "" : Math.max(0, Math.min(60, Math.round(Number(f.d_years.value)) || 0)),
      location: f.d_location.value.trim(), roles: f.d_roles.value.trim(),
      open: { remote: f.d_open_remote.checked, hybrid: f.d_open_hybrid.checked, relocation: f.d_open_relocation.checked },
      experience: [...e.target.querySelectorAll(".li-pf-exp-row")].map((r) => Object.fromEntries(["role", "company", "from", "to", "summary"]
        .map((k) => [k, r.querySelector(`[data-k="${k}"]`).value.trim()]))).filter((x) => x.role || x.company),
      highlights: lines(f.d_highlights.value).slice(0, 6),
      industries: [...new Set([...ticked("d_ind[]"), ...commas(f.d_ind_other.value)])],
      process: lines(f.d_process.value).slice(0, 10),
      methods: [...new Set([...ticked("d_meth[]"), ...commas(f.d_meth_other.value)])],
      collaboration: f.d_collaboration.value.trim(), different: f.d_different.value.trim(),
      skills: commas(f.d_skills.value).slice(0, 30), tools: commas(f.d_tools.value).slice(0, 30),
    };
    const portfolio = {
      ...(state.settings.preferences?.portfolio || {}), // keeps your portfolio site
      headline: f.headline.value.trim(), bio: f.bio.value.trim(), approach: f.approach.value.trim(), details,
      links: Object.fromEntries(PORTFOLIO_LINKS.map(([k]) => [k, f["link_" + k].value.trim()]).filter(([, v]) => v)),
      show: Object.fromEntries(PORTFOLIO_SECTIONS.map(([k]) => [k, f["show_" + k].checked])),
      categories: [...e.target.querySelectorAll('[name="cats[]"]:checked')].map((c) => c.value),
    };
    try {
      const s = await state.store.savePreferences({ ...(state.settings.preferences || {}), portfolio });
      state.settings = { ...state.settings, ...s };
      drawPreview();
      toast("Portfolio saved");
    } catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });

  // Experience rows: add, move up/down, remove.
  const exp = el.querySelector("#li-pf-exp");
  el.querySelector("#li-pf-exp-add").addEventListener("click", () => {
    exp.insertAdjacentHTML("beforeend", expRow({}));
    exp.lastElementChild.querySelector("input").focus();
  });
  exp.addEventListener("click", (e) => {
    const b = e.target.closest("[data-exp]");
    if (!b) return;
    const row = b.closest(".li-pf-exp-row");
    if (b.dataset.exp === "remove") row.remove();
    if (b.dataset.exp === "up" && row.previousElementSibling) row.previousElementSibling.before(row);
    if (b.dataset.exp === "down" && row.nextElementSibling) row.nextElementSibling.after(row);
  });

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
  if (!links.length) return `<p class="li-empty">No links yet. Create one for each company you apply to, so you can switch it off later.</p>`;
  const day = (ts) => formatDay(dayOf(ts, state.timeZone) || String(ts).slice(0, 10), { month: "short", day: "numeric", year: "numeric" });
  return `<ul class="li-tokens li-pf-links">${links.map((l) => {
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

function expRow(e = {}) {
  return `<div class="li-pf-exp-row">
    <input data-k="role" maxlength="80" value="${esc(e.role || "")}" placeholder="Role, e.g. Senior UI/UX Designer" aria-label="Role">
    <input data-k="company" maxlength="80" value="${esc(e.company || "")}" placeholder="Company or client" aria-label="Company">
    <input data-k="from" maxlength="20" value="${esc(e.from || "")}" placeholder="From, e.g. 2022" aria-label="From">
    <input data-k="to" maxlength="20" value="${esc(e.to || "")}" placeholder="To, e.g. Present" aria-label="To">
    <input data-k="summary" class="li-pf-exp-sum" maxlength="240" value="${esc(e.summary || "")}" placeholder="One line: what you did and the result" aria-label="Summary">
    <span class="li-pf-exp-btns">
      <button type="button" class="li-icon-btn" data-exp="up" aria-label="Move up" title="Move up">&#8593;</button>
      <button type="button" class="li-icon-btn" data-exp="down" aria-label="Move down" title="Move down">&#8595;</button>
      <button type="button" class="li-icon-btn" data-exp="remove" aria-label="Remove role" title="Remove">&#10005;</button>
    </span>
  </div>`;
}
