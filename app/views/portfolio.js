// Portfolio (owner): what hiring managers see, your share links, and a live
// preview. The page they open is portfolio.html#t=<link secret>.
import { state, toast } from "../state.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";
import { formatDay, dayOf } from "../core/dates.js";
import { categoriesOf } from "../core/tasks.js";
import { PORTFOLIO_SECTIONS, PORTFOLIO_LINKS, portfolioPrefs, buildPortfolioData } from "../core/portfolio.js";
import { renderPortfolio } from "../portfolio/render.js";

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
  const cats = categoriesOf(state.tasks);
  el.innerHTML = `
    <section class="li-card li-pf-intro">
      <p class="li-sub">A private page for hiring managers, built live from your dashboard: your activity, projects, milestones, plan and how you work.
        Only people with one of your links can open it, it shows only <b>your</b> work (nothing about colleagues, no files or private notes), and you can switch a link off at any time.</p>
    </section>

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
      <div class="li-card-head"><span class="card-label">What's on it</span></div>
      <form class="li-form" id="li-pf-form" autocomplete="off">
        <label class="li-field full">Headline<input name="headline" maxlength="120" value="${esc(p.headline)}" placeholder="e.g. Mobile & web developer"></label>
        <label class="li-field full">About you<textarea name="bio" rows="3" maxlength="1500" placeholder="Two or three sentences about you and the work you do.">${esc(p.bio)}</textarea></label>
        <label class="li-field full">My approach <small class="li-muted">(shown under "How I work")</small><textarea name="approach" rows="3" maxlength="2000" placeholder="How you plan, build and check your work.">${esc(p.approach)}</textarea></label>
        ${PORTFOLIO_LINKS.map(([k, label]) => `<label class="li-field">${esc(label)}<input name="link_${k}" maxlength="300" value="${esc(p.links[k] || "")}" placeholder="${k === "email" ? "you@example.com" : "https://…"}"></label>`).join("")}
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
      <div class="li-pf-preview" id="li-pf-preview">${renderPortfolio(previewData())}</div>
    </section>`;

  el.querySelector("#li-pf-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const portfolio = {
      headline: f.headline.value.trim(), bio: f.bio.value.trim(), approach: f.approach.value.trim(),
      links: Object.fromEntries(PORTFOLIO_LINKS.map(([k]) => [k, f["link_" + k].value.trim()]).filter(([, v]) => v)),
      show: Object.fromEntries(PORTFOLIO_SECTIONS.map(([k]) => [k, f["show_" + k].checked])),
      categories: [...e.target.querySelectorAll('[name="cats[]"]:checked')].map((c) => c.value),
    };
    try {
      const s = await state.store.savePreferences({ ...(state.settings.preferences || {}), portfolio });
      state.settings = { ...state.settings, ...s };
      el.querySelector("#li-pf-preview").innerHTML = renderPortfolio(previewData());
      toast("Portfolio saved");
    } catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });

  el.querySelector("#li-pf-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (links === null) { toast("Run the portfolio SQL update in Supabase first (20261005000000_portfolio.sql)", "error"); return; }
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
