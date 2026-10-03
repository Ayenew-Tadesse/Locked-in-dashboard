// Portfolio page (owner): one "Edit portfolio" card. Sections you open and
// close (introduction, numbers, about, highlights and experience, key skills,
// case studies, how I work, contact and social, sections to show) and one
// Save. Your portfolio site (preferences.portfolio.site) is the source; every
// save also keeps the older profile fields in step so everything that reads
// them still works. Case studies save on their own (drag to swap, tap to edit).
import { state, toast } from "../state.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";
import { categoriesOf } from "../core/tasks.js";
import { PORTFOLIO_SECTIONS, portfolioPrefs } from "../core/portfolio.js";
import { portfolioGithub } from "../github.js";
import { openCaseEditor, META } from "./case-editor.js";
import { openSiteEditor } from "./site-editor.js";

// Switches for the sections your portfolio has (projects and "skills & tools" live in other sections now).
const EDITOR_SECTIONS = ["cases", "stats", "about", "skillgroups", "highlights", "experience", "process", "logs", "activity", "milestones", "plan", "contact"];
const SOCIAL_HOSTS = [["linkedin", /linkedin\./i], ["behance", /behance\./i], ["dribbble", /dribbble\./i], ["instagram", /instagram\./i], ["github", /github\./i]];
const LINK_LABELS = { email: "Email Address", linkedin: "LinkedIn", behance: "Behance", dribbble: "Dribbble", github: "GitHub", website: "Website", instagram: "Instagram" };
const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
const commas = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const imgUrl = (u) => (typeof u === "string" && /^(https?:|blob:|data:image\/)/i.test(u) ? u : "");
const openSections = new Set(["intro"]); // which sections are open (kept while you're on the page)

export function currentSite() {
  const s = state.settings.preferences?.portfolio?.site;
  return s && typeof s === "object" ? clone(s) : {};
}

export async function saveSite(site) {
  const prefs = state.settings.preferences || {};
  const portfolio = { ...(prefs.portfolio || {}), site };
  const s = await state.store.savePreferences({ ...prefs, portfolio });
  state.settings = { ...state.settings, ...s };
}

const upload = (blob, name) => state.store.uploadPortfolioImage(blob, name);

/** Which social site a link is (for the buttons under your introduction). */
function socialKey(label, href) {
  const hit = SOCIAL_HOSTS.find(([k, re]) => re.test(href) || k === String(label).trim().toLowerCase());
  return hit ? hit[0] : "website";
}

/** Contact rows as stored: no bare mailto:/tel:, a value (the link without its scheme if empty). */
const cleanContacts = (rows) => rows.map((c) => ({ label: String(c.label || "").trim(), value: String(c.value || "").trim(), href: String(c.href || "").trim() }))
  .map((c) => ({ ...c, href: /^(mailto|tel):$/i.test(c.href) ? "" : c.href, value: c.value || c.href.replace(/^(mailto|tel):/i, "") })).filter((c) => c.value);
/** The older profile links (email, LinkedIn, …) from the contact list. */
function linksOf(contact) {
  const links = {};
  for (const c of contact) {
    if (/^mailto:/i.test(c.href) && !links.email) links.email = c.href.replace(/^mailto:/i, "");
    else if (/^https?:\/\//i.test(c.href)) { const k = socialKey(c.label, c.href); if (k !== "instagram" && !links[k]) links[k] = c.href; }
  }
  return links;
}

/** Save what the page editor (site-editor.js) changed; the form-only parts stay as they are. */
export async function savePortfolioPage(m) {
  const prefs = state.settings.preferences || {}, old = prefs.portfolio || {};
  const t = (v) => String(v || "").trim();
  const site = currentSite();
  site.hero = { ...(site.hero || {}), eyebrow: t(m.hero.eyebrow), name: t(m.hero.name), role: t(m.hero.role), location: t(m.hero.location),
    description: t(m.hero.description), open: { ...m.hero.open }, roles: t(m.hero.roles) };
  site.resume = t(m.resume);
  site.portrait = imgUrl(m.portrait);
  site.stats = m.stats.map((x) => ({ num: t(x.num), label: t(x.label) })).filter((x) => x.num || x.label).slice(0, 4);
  site.about = m.about.map((x) => String(x).replace(/\s+/g, " ").trim()).filter(Boolean);
  site.skills = m.skills.map((g) => ({ title: t(g.title), items: g.items.map(t).filter(Boolean) })).filter((g) => g.title || g.items.length);
  site.contact = cleanContacts(m.contact);
  site.social = Object.fromEntries(site.contact.filter((c) => /^https?:\/\//i.test(c.href)).map((c) => [socialKey(c.label, c.href), c.href]));
  site.cases = site.cases || [];
  if (state.year) site.year = state.year; else delete site.year;
  Object.assign(site, portfolioGithub());
  if (!site.github) delete site.github;
  const yearsStat = site.stats.find((x) => /year/i.test(x.label));
  const details = { ...(old.details || {}), title: site.hero.role, location: site.hero.location, open: site.hero.open, roles: site.hero.roles,
    years: yearsStat ? parseInt(yearsStat.num, 10) || "" : (old.details?.years ?? "") };
  const portfolio = { ...old, site, details, headline: site.hero.description, bio: site.about.join("\n\n"), links: linksOf(site.contact),
    show: { ...(old.show || {}), ...m.show } };
  const s = await state.store.savePreferences({ ...prefs, portfolio });
  state.settings = { ...state.settings, ...s };
}

/** What the editor starts from: your site, with anything only the older fields had filled in. */
export function draftSite() {
  const p = portfolioPrefs(state.settings.preferences), d = p.details, s = currentSite(), h = s.hero || {};
  const hero = { ...h, name: h.name || state.profile?.name || "", role: h.role || d.title, location: h.location || d.location,
    description: h.description || p.headline, open: h.open || d.open, roles: h.roles ?? d.roles };
  const stats = s.stats?.length ? s.stats : d.years !== "" && d.years != null ? [{ num: `${d.years}+`, label: "Years of Experience" }] : [];
  const about = s.about?.length ? s.about : String(p.bio || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const skills = (s.skills || []).slice();
  const hasGroup = (t) => skills.some((g) => String(g.title).trim().toLowerCase() === t.toLowerCase());
  if (d.skills.length && !hasGroup("Skills")) skills.push({ title: "Skills", items: d.skills });
  if (d.tools.length && !hasGroup("Tools")) skills.push({ title: "Tools", items: d.tools });
  // One contact list: contact rows, then social links and older contact links not already there.
  const contact = (s.contact || []).map((c) => ({ ...c }));
  const has = (href) => contact.some((c) => c.href && c.href.replace(/\/+$/, "").toLowerCase() === String(href).replace(/\/+$/, "").toLowerCase());
  for (const [k, href] of Object.entries(s.social || {})) if (href && !has(href)) contact.push({ label: LINK_LABELS[k] || k, value: LINK_LABELS[k] || k, href });
  for (const [k, v] of Object.entries(p.links || {})) {
    if (!v) continue;
    const href = k === "email" && !/^mailto:/i.test(v) ? "mailto:" + v : v;
    if (!has(href)) contact.push({ label: LINK_LABELS[k] || k, value: k === "email" ? v.replace(/^mailto:/i, "") : LINK_LABELS[k] || k, href });
  }
  return { ...s, hero, stats, about, skills, contact };
}

function section(key, title, body, hint = "") {
  return `<details class="li-pf-sec" data-sec="${key}"${openSections.has(key) ? " open" : ""}>
    <summary><span>${esc(title)}</span>${hint ? `<small class="li-muted">${esc(hint)}</small>` : ""}</summary>
    <div class="li-pf-sec-body li-form">${body}</div></details>`;
}

/** The whole "Edit portfolio" card. */
export function editorHtml() {
  const p = portfolioPrefs(state.settings.preferences), d = p.details, s = draftSite(), h = s.hero;
  const cats = categoriesOf(state.tasks);
  const stats = [0, 1, 2, 3].map((i) => s.stats[i] || {});
  return `
    <section class="li-card li-pf-editor" id="li-pf-editor">
      <div class="li-card-head"><span class="card-label">Edit portfolio</span><button type="button" class="li-btn primary small" id="li-pf-onpage">Edit on page</button></div>
      <p class="li-sub">A private page for hiring managers, laid out like your portfolio website and kept live from this dashboard. Only people with one of your links can open it; it shows only <b>your</b> work.</p>
      <form class="li-pf-form li-pf-editor-form" id="li-pf-form" autocomplete="off">
      ${section("intro", "Introduction", `
        <label class="li-field">Greeting line<input name="eyebrow" maxlength="80" value="${esc(h.eyebrow || "")}" placeholder="Hello there, I am"></label>
        <label class="li-field">Name<input name="name" maxlength="80" value="${esc(h.name || "")}"></label>
        <label class="li-field">Role<input name="role" maxlength="80" value="${esc(h.role || "")}" placeholder="e.g. Senior Product Designer"></label>
        <label class="li-field">Based in<input name="location" maxlength="80" value="${esc(h.location || "")}" placeholder="e.g. USA"></label>
        <label class="li-field full">Short intro<textarea name="description" rows="2" maxlength="600" placeholder="One or two sentences: what you design and how.">${esc(h.description || "")}</textarea></label>
        <div class="li-field"><span>Open to</span><div class="li-pf-checks">
          ${[["remote", "Remote"], ["hybrid", "Hybrid"], ["relocation", "Relocation"]].map(([k, l]) => `<label class="li-check-row"><input type="checkbox" name="open_${k}"${h.open?.[k] ? " checked" : ""}> ${l}</label>`).join("")}
        </div></div>
        <label class="li-field">Roles I'm looking for<input name="roles" maxlength="200" value="${esc(h.roles || "")}" placeholder="e.g. Senior Product Designer, Lead UX"></label>
        <label class="li-field full">Resume link <small class="li-muted">(a URL or mailto:)</small><input name="resume" maxlength="500" value="${esc(s.resume || "")}"></label>
        <div class="li-field full"><span>Photo</span><div class="li-pf-imgs" id="li-pf-portrait">${imgUrl(s.portrait) ? `<figure><img src="${esc(s.portrait)}" alt="Portrait"><button type="button" class="li-icon-btn" data-remove-portrait aria-label="Remove photo">&#10005;</button></figure>` : ""}
          <label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" data-portrait hidden></label></div></div>`)}
      ${section("stats", "Numbers", `<div class="li-pf-stats-edit">${stats.map((x, i) => `<div class="li-pf-stat-edit">
          <input name="stat_num_${i}" maxlength="12" value="${esc(x.num || "")}" placeholder="${["e.g. 5+", "e.g. 20+", "e.g. 10+", "e.g. 3"][i]}" aria-label="Number ${i + 1}">
          <input name="stat_label_${i}" maxlength="40" value="${esc(x.label || "")}" placeholder="${["e.g. Years of Experience", "e.g. Projects", "e.g. Happy Clients", "e.g. Awards"][i]}" aria-label="Label ${i + 1}">
        </div>`).join("")}</div>`, "e.g. 3+ Years of Experience")}
      ${section("about", "About me", `<label class="li-field full">Paragraphs <small class="li-muted">(leave an empty line between paragraphs)</small><textarea name="about" rows="8" maxlength="6000">${esc(s.about.join("\n\n"))}</textarea></label>`)}
      ${section("experience", "Highlights and experience", `
        <label class="li-field full">Highlights <small class="li-muted">(one per line, up to 6: results with numbers work best)</small><textarea name="highlights" rows="4" maxlength="1500" placeholder="e.g. Cut checkout from 6 steps to 3&#10;Built a design system used by 2 apps">${esc(d.highlights.join("\n"))}</textarea></label>
        <div class="li-field full"><span>Experience</span></div>
        <div class="li-pf-exp" id="li-pf-exp">${d.experience.map(expRow).join("")}</div>
        <button type="button" class="li-btn small" id="li-pf-exp-add">+ Add a role</button>`)}
      ${section("skills", "Key skills", `
        <div class="li-pf-groups" id="li-pf-skill-groups">${s.skills.map(skillGroupRow).join("")}</div>
        <button type="button" class="li-btn small" id="li-pf-skill-add">+ Add a skill group</button>`)}
      ${section("cases", "Case studies", `<p class="li-sub full">Drag a card onto another to swap their places (on a phone, drag it by its &#10303;). Tap a card to edit it.</p>
        <div class="li-pf-case-grid" id="li-pf-cases">${caseCardsHtml(s.cases || [])}</div>`, "saved as you go")}
      ${section("work", "How I work", `
        <label class="li-field full">My approach<textarea name="approach" rows="3" maxlength="2000" placeholder="Your design philosophy in a few sentences.">${esc(p.approach)}</textarea></label>
        <label class="li-field full">Process steps <small class="li-muted">(one per line)</small><textarea name="process" rows="4" maxlength="800" placeholder="Research&#10;Problem framing&#10;User flows&#10;Prototype&#10;Usability testing">${esc(d.process.join("\n"))}</textarea></label>
        <label class="li-field full">Research methods <small class="li-muted">(comma-separated)</small><input name="methods" maxlength="400" value="${esc(d.methods.join(", "))}" placeholder="User interviews, Usability testing, Analytics"></label>
        ${cats.length ? `<div class="li-field full"><span>Finished work notes come from <small class="li-muted">(none ticked: all categories)</small></span><div class="li-pf-checks">
          ${cats.map((c) => `<label class="li-check-row"><input type="checkbox" name="cats[]" value="${esc(c)}"${p.categories.includes(c) ? " checked" : ""}> ${esc(c)}</label>`).join("")}</div></div>` : ""}`)}
      ${section("contact", "Contact and social", `<p class="li-sub full">One list for everything: web links also show as buttons under your introduction.</p>
        <div class="li-pf-groups" id="li-pf-contacts">${(s.contact.length ? s.contact : [{ label: "Email Address", href: "mailto:" }, { label: "Phone Number", href: "tel:" }, { label: "LinkedIn" }]).map(contactRow).join("")}</div>
        <button type="button" class="li-btn small" id="li-pf-contact-add">+ Add a contact</button>`)}
      ${section("show", "Sections to show", `<div class="li-pf-checks li-pf-show full">
        ${PORTFOLIO_SECTIONS.filter(([k]) => EDITOR_SECTIONS.includes(k)).sort((a, b) => EDITOR_SECTIONS.indexOf(a[0]) - EDITOR_SECTIONS.indexOf(b[0]))
          .map(([k, label, hint]) => `<label class="li-check-row" title="${esc(hint)}"><input type="checkbox" name="show_${k}"${p.show[k] ? " checked" : ""}> ${esc(label)}</label>`).join("")}</div>`)}
      <div class="li-form-actions"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save</button></div>
      </form>
    </section>`;
}

function caseCardsHtml(cases) {
  return cases.map((c) => {
    const shot = imgUrl(c.shots?.[0]?.src);
    return `<div class="li-pf-case-card" data-case-card="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(c.title || "Untitled")}: edit, or drag to swap places">
      <div class="li-pf-case-thumb">${shot ? `<img src="${esc(shot)}" alt="" draggable="false">` : `<span>${esc(c.thumbWord || (c.title || "?").split(" ")[0])}</span>`}</div>
      <b>${esc(c.title || "Untitled")}</b>
      <small class="li-muted">${c.status === "progress" ? "In progress" : "Live"}</small>
      <span class="li-pf-grip" data-grip aria-hidden="true" title="Drag to swap">&#10303;</span>
    </div>`;
  }).join("") + `<button type="button" class="li-pf-case-card li-pf-case-new" id="li-pf-case-add">+ Add a case study</button>`;
}

export function expRow(e = {}) {
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
function skillGroupRow(g = {}) {
  return `<div class="li-pf-grouprow"><input data-k="title" maxlength="60" value="${esc(g.title || "")}" placeholder="Group, e.g. UX/UI Design Skills" aria-label="Group title">
    <textarea data-k="items" rows="3" maxlength="1500" placeholder="One skill per line" aria-label="Skills">${esc((g.items || []).join("\n"))}</textarea>
    <button type="button" class="li-icon-btn" data-row-remove aria-label="Remove">&#10005;</button></div>`;
}
function contactRow(c = {}) {
  return `<div class="li-pf-grouprow li-pf-contactrow"><input data-k="label" maxlength="40" value="${esc(c.label || "")}" placeholder="Label, e.g. Email Address" aria-label="Label">
    <input data-k="value" maxlength="120" value="${esc(c.value || "")}" placeholder="Shown text" aria-label="Shown text">
    <input data-k="href" maxlength="300" value="${esc(c.href || "")}" placeholder="Link: mailto:, tel: or https://" aria-label="Link">
    <button type="button" class="li-icon-btn" data-row-remove aria-label="Remove">&#10005;</button></div>`;
}

/**
 * Wires the editor. hooks.saved(): after any save (preview and the web preview follow);
 * hooks.reload(): redraw the whole page (after an import); hooks.dirty(bool): unsaved changes.
 */
export function wireEditor(el, hooks) {
  let portrait = currentSite().portrait ?? draftSite().portrait ?? "";
  const form = el.querySelector("#li-pf-form");
  let dirty = false;
  const setDirty = (v) => { dirty = v; hooks.dirty?.(v); if (!v) hooks.draft?.(null); };
  form.addEventListener("input", () => { if (!dirty) setDirty(true); });
  form.addEventListener("change", (e) => { if (!e.target.matches("[data-portrait]") && !dirty) setDirty(true); });
  el.querySelectorAll(".li-pf-sec").forEach((d) => d.addEventListener("toggle", () => { if (d.open) openSections.add(d.dataset.sec); else openSections.delete(d.dataset.sec); }));

  // Rows: remove, add; experience up/down; the photo.
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-row-remove],[data-remove-portrait],[data-exp]");
    if (!b) return;
    if (b.matches("[data-row-remove]")) b.closest(".li-pf-grouprow").remove();
    if (b.matches("[data-remove-portrait]")) { portrait = ""; el.querySelector("#li-pf-portrait figure")?.remove(); }
    if (b.matches("[data-exp]")) {
      const row = b.closest(".li-pf-exp-row");
      if (b.dataset.exp === "remove") row.remove();
      if (b.dataset.exp === "up" && row.previousElementSibling) row.previousElementSibling.before(row);
      if (b.dataset.exp === "down" && row.nextElementSibling) row.nextElementSibling.after(row);
    }
    setDirty(true);
  });
  const add = (btn, box, html) => el.querySelector(btn).addEventListener("click", () => {
    const list = el.querySelector(box);
    list.insertAdjacentHTML("beforeend", html());
    list.lastElementChild.querySelector("input")?.focus();
    setDirty(true); live();
  });
  add("#li-pf-skill-add", "#li-pf-skill-groups", skillGroupRow);
  add("#li-pf-contact-add", "#li-pf-contacts", contactRow);
  add("#li-pf-exp-add", "#li-pf-exp", expRow);
  form.querySelector("[data-portrait]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      portrait = await upload(file, file.name);
      el.querySelector("#li-pf-portrait figure")?.remove();
      el.querySelector("#li-pf-portrait").insertAdjacentHTML("afterbegin", `<figure><img src="${esc(portrait)}" alt="Portrait"><button type="button" class="li-icon-btn" data-remove-portrait aria-label="Remove photo">&#10005;</button></figure>`);
      setDirty(true); live();
    } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
  });

  // "Edit on page": the portfolio as hiring managers see it, edited in place.
  el.querySelector("#li-pf-onpage")?.addEventListener("click", async () => {
    if (dirty && !(await confirmDialog("Discard the changes in this form and edit on the page?", "Discard and continue"))) return;
    const openEditor = () => openSiteEditor({
      site: draftSite(), prefs: state.settings.preferences,
      save: async (m) => { await savePortfolioPage(m); },
      done: () => hooks.rerender?.(),
      onClose: () => hooks.reload?.(),
      openForm: () => { hooks.reload?.(); document.getElementById("li-pf-editor")?.scrollIntoView({ block: "start" }); },
      // A case study opens in its own editor; back to the page editor afterwards.
      openCase: (id) => cases.edit(id, openEditor),
    });
    setDirty(false);
    openEditor();
  });

  // Everything on the form as saved preferences.portfolio (nothing is saved here).
  function readForm() {
    const f = form.elements;
    const rows = (box, keys) => [...form.querySelectorAll(`${box} .li-pf-grouprow`)].map((r) => Object.fromEntries(keys.map((k) => [k, r.querySelector(`[data-k="${k}"]`).value.trim()])));
    const open = { remote: f.open_remote.checked, hybrid: f.open_hybrid.checked, relocation: f.open_relocation.checked };
    const site = currentSite();
    site.hero = { ...(site.hero || {}), eyebrow: f.eyebrow.value.trim(), name: f.name.value.trim(), role: f.role.value.trim(), location: f.location.value.trim(),
      description: f.description.value.trim(), open, roles: f.roles.value.trim() };
    site.resume = f.resume.value.trim();
    site.portrait = portrait;
    site.stats = [0, 1, 2, 3].map((i) => ({ num: f["stat_num_" + i].value.trim(), label: f["stat_label_" + i].value.trim() })).filter((x) => x.num || x.label);
    site.about = String(f.about.value).split(/\n\s*\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    site.skills = rows("#li-pf-skill-groups", ["title", "items"]).map((g) => ({ title: g.title, items: lines(g.items) })).filter((g) => g.title || g.items.length);
    site.contact = rows("#li-pf-contacts", ["label", "value", "href"]).map((c) => ({ ...c, href: /^(mailto|tel):$/i.test(c.href) ? "" : c.href, value: c.value || c.href.replace(/^(mailto|tel):/i, "") }))
      .filter((c) => c.value);
    site.social = Object.fromEntries(site.contact.filter((c) => /^https?:\/\//i.test(c.href)).map((c) => [socialKey(c.label, c.href), c.href]));
    site.cases = site.cases || [];
    // Your plan year travels with the site, so "The plan" shows your quarters (Q1 = Sep 22 – Dec 31).
    if (state.year) site.year = state.year; else delete site.year;
    // Your GitHub username and time zone, so the portfolio's Activity map can show your public commits.
    Object.assign(site, portfolioGithub());
    if (!site.github) delete site.github;
    // Keep the older profile fields in step (anything that still reads them).
    const prefs = state.settings.preferences || {}, old = prefs.portfolio || {};
    const yearsStat = site.stats.find((x) => /year/i.test(x.label));
    const links = {};
    for (const c of site.contact) {
      if (/^mailto:/i.test(c.href) && !links.email) links.email = c.href.replace(/^mailto:/i, "");
      else if (/^https?:\/\//i.test(c.href)) { const k = socialKey(c.label, c.href); if (k !== "instagram" && !links[k]) links[k] = c.href; }
    }
    const details = {
      ...(old.details || {}),
      title: site.hero.role, location: site.hero.location, open, roles: site.hero.roles,
      years: yearsStat ? parseInt(yearsStat.num, 10) || "" : (old.details?.years ?? ""),
      experience: [...form.querySelectorAll(".li-pf-exp-row")].map((r) => Object.fromEntries(["role", "company", "from", "to", "summary"]
        .map((k) => [k, r.querySelector(`[data-k="${k}"]`).value.trim()]))).filter((x) => x.role || x.company),
      highlights: lines(f.highlights.value).slice(0, 6),
      process: lines(f.process.value).slice(0, 10),
      methods: [...new Set(commas(f.methods.value))].slice(0, 20),
      skills: [], tools: [], // now in Key skills
    };
    const portfolio = {
      ...old, site, details,
      headline: site.hero.description, bio: site.about.join("\n\n"), approach: f.approach.value.trim(), links,
      show: { ...(old.show || {}), ...Object.fromEntries(EDITOR_SECTIONS.map((k) => [k, !!f["show_" + k]?.checked])) },
      categories: [...form.querySelectorAll('[name="cats[]"]:checked')].map((c) => c.value),
    };
    return portfolio;
  }
  // The preview follows as you type (a moment after you pause); Save makes it real.
  let typing = 0;
  // (A form that has left the page, e.g. a field blurred as you navigated away, is ignored.)
  const live = () => { clearTimeout(typing); typing = setTimeout(() => { if (form.isConnected) hooks.draft?.(dirty ? readForm() : null); }, 250); };
  form.addEventListener("input", live);
  form.addEventListener("change", live);
  form.addEventListener("click", (e) => { if (e.target.closest("[data-row-remove],[data-remove-portrait],[data-exp]")) live(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearTimeout(typing);
    const prefs = state.settings.preferences || {}, portfolio = readForm();
    try {
      const s = await state.store.savePreferences({ ...prefs, portfolio });
      state.settings = { ...state.settings, ...s };
      setDirty(false);
      hooks.saved();
      toast("Portfolio saved");
    } catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });

  const cases = wireCaseCards(el, { saved() { hooks.saved(); if (dirty && form.isConnected) hooks.draft?.(readForm()); } });
  return { save: () => form.requestSubmit(), isDirty: () => dirty };
}

// ---------------------------------------------------------------------------
// Case study cards: tap to edit, drag onto another card to swap places
// (with a mouse, anywhere on the card; on a phone, by the grip ⠿).
// ---------------------------------------------------------------------------
function wireCaseCards(el, hooks) {
  const grid = el.querySelector("#li-pf-cases");
  const redraw = () => { grid.innerHTML = caseCardsHtml(currentSite().cases || []); };
  const changed = () => { redraw(); hooks.saved(); };
  // Tapping a card opens it on the page to edit; "Edit as a form" there opens the form.
  // after: what to open once you've saved or cancelled (the page editor, when you came from it).
  const edit = (id, after) => {
    const c = (currentSite().cases || []).find((x) => x.id === id) || null;
    const onDelete = c ? () => deleteCase(id) : null;
    openCaseEditor(c, { save: storeCase, onDelete, done: () => { changed(); after?.(); }, onClose: () => after?.(),
      openForm: (draft) => editCase(c ? { ...draft, id: c.id } : draft, changed, onDelete, c) });
  };
  async function deleteCase(id) {
    if (!(await removeCase(id))) return false;
    changed();
    return true;
  }
  async function swap(a, b) {
    const site = currentSite(), cases = site.cases || [];
    const i = cases.findIndex((x) => x.id === a), j = cases.findIndex((x) => x.id === b);
    if (i < 0 || j < 0 || i === j) return;
    [cases[i], cases[j]] = [cases[j], cases[i]];
    try { await saveSite(site); changed(); toast("Order saved"); } catch (err) { toast("Couldn't save: " + err.message, "error"); redraw(); }
  }

  let drag = null, suppressClick = false;
  const cardAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("#li-pf-cases [data-case-card]");
  const end = async (commit) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost?.remove();
    d.card.classList.remove("dragging");
    grid.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target"));
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    if (d.active) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
    if (commit && d.active && d.over && d.over !== d.card) await swap(d.card.dataset.caseCard, d.over.dataset.caseCard);
  };
  const start = (d) => {
    d.active = true;
    const r = d.card.getBoundingClientRect();
    d.dx = d.x - r.left; d.dy = d.y - r.top;
    d.ghost = d.card.cloneNode(true);
    d.ghost.classList.add("li-pf-case-ghost");
    Object.assign(d.ghost.style, { width: r.width + "px", height: r.height + "px", left: r.left + "px", top: r.top + "px" });
    document.body.appendChild(d.ghost);
    d.card.classList.add("dragging");
  };
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      if (drag.touch && !drag.grip) return end(false); // on a phone, a finger moving elsewhere on the card is a scroll
      start(drag);
    }
    e.preventDefault();
    drag.ghost.style.left = e.clientX - drag.dx + "px";
    drag.ghost.style.top = e.clientY - drag.dy + "px";
    const over = cardAt(e.clientX, e.clientY);
    if (over !== drag.over) { drag.over?.classList.remove("drop-target"); drag.over = over && over !== drag.card ? over : null; drag.over?.classList.add("drop-target"); }
  }
  grid.addEventListener("pointerdown", (e) => {
    const card = e.target.closest("[data-case-card]");
    if (!card || e.button > 0) return;
    const touch = e.pointerType !== "mouse";
    drag = { id: e.pointerId, card, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, touch, grip: !!e.target.closest("[data-grip]"), active: false, over: null };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });
  function up(e) { if (drag && e.pointerId === drag.id) end(true); }
  function cancel(e) { if (drag && e.pointerId === drag.id) end(false); }
  grid.addEventListener("click", (e) => {
    if (suppressClick) return;
    if (e.target.closest("#li-pf-case-add")) return edit(null);
    const card = e.target.closest("[data-case-card]");
    if (card) edit(card.dataset.caseCard);
  });
  // Keyboard: Enter opens; Ctrl/⌘ + arrow keys swap with the neighbour.
  grid.addEventListener("keydown", (e) => {
    const card = e.target.closest("[data-case-card]");
    if (!card) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(card.dataset.caseCard); return; }
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const cards = [...grid.querySelectorAll("[data-case-card]")], i = cards.indexOf(card), other = cards[i + step];
    if (other) swap(card.dataset.caseCard, other.dataset.caseCard).then(() => grid.querySelector(`[data-case-card="${CSS.escape(card.dataset.caseCard)}"]`)?.focus());
  });
  return { edit };
}

// ---------------------------------------------------------------------------
// Case study editor (the form; case-editor.js edits on the page)
// ---------------------------------------------------------------------------

/** Delete a case study (after asking). */
async function removeCase(id) {
  const site = currentSite();
  const c = (site.cases || []).find((x) => x.id === id);
  if (!c || !(await confirmDialog(`Delete the case study "${c.title}"?`))) return false;
  site.cases = site.cases.filter((x) => x.id !== id);
  await saveSite(site);
  toast("Case study deleted");
  portfolioChanged();
  return true;
}

/** Tell whoever shows the portfolio (the Portfolio page) that it changed. */
export const portfolioChanged = () => document.dispatchEvent(new CustomEvent("li:portfolio-changed"));

/** Open a case study (or a new one, id null) in the page editor from anywhere (the ☰ menu). */
export function openCaseStudy(id) {
  const c = id ? (currentSite().cases || []).find((x) => x.id === id) || null : null;
  const onDelete = c ? () => removeCase(c.id) : null;
  openCaseEditor(c, { save: storeCase, onDelete, done: portfolioChanged,
    openForm: (draft) => editCase(c ? { ...draft, id: c.id } : draft, portfolioChanged, onDelete, c) });
}

/** Save a case study: replace the one it was (by id), or add it with a fresh id. */
export async function storeCase(next, original) {
  next = { ...next };
  if (!next.id) next.id = next.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "case-" + Date.now().toString(36);
  const site = currentSite();
  site.cases = site.cases || [];
  const i = original ? site.cases.findIndex((x) => x.id === original.id) : -1;
  if (i >= 0) site.cases[i] = next;
  else {
    if (site.cases.some((x) => x.id === next.id)) next.id += "-" + Date.now().toString(36).slice(-4);
    site.cases.push(next);
  }
  await saveSite(site);
}

// draft: what the form opens with; saved: the stored case it replaces (defaults to draft).
function editCase(original, done, onDelete, saved = original) {
  const c = clone(original || { id: "", title: "", status: "live", shots: [], meta: META.map((label) => ({ label, value: "" })) });
  let shots = (c.shots || []).map((s) => ({ ...s }));
  let flow = (c.flow?.steps || []).map((s) => ({ ...s }));
  let personas = (c.personas?.items || []).map((p) => ({ ...p }));
  const meta = (label) => (c.meta || []).find((m) => m.label.toLowerCase() === label.toLowerCase())?.value || "";
  const compText = c.competitive?.rows?.length ? [(c.competitive.columns || []).join(" | "), ...c.competitive.rows.map((r) => [r.feature, ...(r.values || [])].join(" | "))].join("\n") : "";
  const iaText = (c.ia?.sections || []).map((s) => `${s.title}: ${(s.items || []).join("; ")}`).join("\n");
  const colorsText = (c.style?.colors || []).map((x) => `${x.name} ${x.hex}`).join("\n");

  const shotsHtml = () => shots.map((s, i) => `<figure><img src="${esc(imgUrl(s.src))}" alt=""><button type="button" class="li-icon-btn" data-shot-remove="${i}" aria-label="Remove screenshot">&#10005;</button></figure>`).join("");
  const flowHtml = () => flow.map((s, i) => `<div class="li-pf-grouprow li-pf-flowrow">${imgUrl(s.src) ? `<img src="${esc(s.src)}" alt="">` : `<span class="li-pf-noimg">No image</span>`}
      <input data-flow-label="${i}" maxlength="40" value="${esc(s.label || "")}" placeholder="Step, e.g. Search" aria-label="Step name">
      <label class="li-btn small li-pf-upload">Image<input type="file" accept="image/*" data-flow-img="${i}" hidden></label>
      <button type="button" class="li-icon-btn" data-flow-remove="${i}" aria-label="Remove step">&#10005;</button></div>`).join("");
  const SEXES = ["", "Female", "Male", "Other"];
  const personaHtml = () => personas.map((p, i) => `<div class="li-pf-persona" data-persona="${i}">
      <div class="li-pf-persona-head">
        <span class="li-pf-persona-photo">${imgUrl(p.photo) ? `<img src="${esc(p.photo)}" alt="">` : `<span aria-hidden="true">&#128100;</span>`}</span>
        <span class="li-btn-row"><label class="li-btn small li-pf-upload">${imgUrl(p.photo) ? "Change photo" : "Upload photo"}<input type="file" accept="image/*" data-persona-photo="${i}" hidden></label>
          ${imgUrl(p.photo) ? `<button type="button" class="li-btn small ghost" data-persona-photo-remove="${i}">Remove</button>` : ""}</span>
      </div>
      <input data-p="name" maxlength="60" value="${esc(p.name || "")}" placeholder="Persona, e.g. The Frequent Flyer" aria-label="Persona name">
      <div class="li-pf-persona-demo">
        <input data-p="age" maxlength="12" value="${esc(p.age || "")}" placeholder="Age, e.g. 32" aria-label="Age">
        <select data-p="sex" aria-label="Sex">${SEXES.map((x) => `<option value="${x}"${(p.sex || "") === x ? " selected" : ""}>${x || "Sex"}</option>`).join("")}</select>
        <input data-p="location" maxlength="60" value="${esc(p.location || "")}" placeholder="Location" aria-label="Location">
        <input data-p="occupation" maxlength="60" value="${esc(p.occupation || "")}" placeholder="Occupation" aria-label="Occupation">
      </div>
      <input data-p="summary" maxlength="160" value="${esc(p.summary || "")}" placeholder="One line about them" aria-label="Summary">
      <textarea data-p="needs" rows="2" placeholder="Needs, one per line" aria-label="Needs">${esc((p.needs || []).join("\n"))}</textarea>
      <textarea data-p="frustrations" rows="2" placeholder="Frustrations, one per line" aria-label="Frustrations">${esc((p.frustrations || []).join("\n"))}</textarea>
      <textarea data-p="goals" rows="2" placeholder="Goals, one per line" aria-label="Goals">${esc((p.goals || []).join("\n"))}</textarea>
      <button type="button" class="li-icon-btn" data-persona-remove="${i}" aria-label="Remove persona">&#10005;</button></div>`).join("");

  let readPersonas = () => {}, readFlow = () => {};
  openModal({
    eyebrow: original ? "Edit case study" : "New case study", title: c.title || "Case study", submitLabel: "Save case study", wide: true,
    extraButtons: onDelete ? `<button type="button" class="li-btn danger-ghost" data-case-delete>Delete</button>` : "",
    body: `
      <fieldset class="full li-pf-group"><legend>Card on your home page</legend>
        <label class="li-field">Title<input name="title" required maxlength="100" value="${esc(c.title || "")}" placeholder="e.g. Mobile Banking App"></label>
        <label class="li-field">Tag<input name="tag" maxlength="60" value="${esc(c.tag || "")}" placeholder="Mobile App UI/UX"></label>
        <label class="li-field full">Card description<textarea name="cardDesc" rows="2" maxlength="300">${esc(c.cardDesc || "")}</textarea></label>
        <label class="li-field">Status<select name="status"><option value="live"${c.status !== "progress" ? " selected" : ""}>Live case study</option><option value="progress"${c.status === "progress" ? " selected" : ""}>In progress (card only)</option></select></label>
        <label class="li-field">Live app link<input name="liveUrl" maxlength="300" value="${esc(c.liveUrl || "")}" placeholder="https://…"></label>
        <label class="li-check-row full"><input type="checkbox" name="phone"${c.phone !== false ? " checked" : ""}> Show "Try the app" in a phone frame on computers <small class="li-muted">(turn off for desktop websites)</small></label>
        <label class="li-field full">Dashboard project <small class="li-muted">(shows its live progress)</small><select name="project"><option value="">None</option>${(state.projects || []).map((p) => `<option${c.project === p.name ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>Top of the case study</legend>
        <label class="li-field">Status label<input name="pill" maxlength="40" value="${esc(c.pill || "")}" placeholder="Live case study"></label>
        <label class="li-field full">Subtitle<textarea name="subtitle" rows="2" maxlength="400">${esc(c.subtitle || "")}</textarea></label>
        <div class="li-field full"><span>Screenshots</span><div class="li-pf-imgs" id="li-pf-shots">${shotsHtml()}<label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" multiple data-shots hidden></label></div></div>
        ${META.map((l) => `<label class="li-field">${l}<input name="meta_${l}" maxlength="120" value="${esc(meta(l))}"></label>`).join("")}
      </fieldset>
      <fieldset class="full li-pf-group"><legend>The story</legend>
        <label class="li-field full">Overview<textarea name="overview" rows="3" maxlength="3000">${esc(c.overview || "")}</textarea></label>
        <label class="li-field full">Design process: intro<textarea name="processIntro" rows="2" maxlength="1000">${esc(c.process?.intro || "")}</textarea></label>
        <label class="li-field full">Design process: steps <small class="li-muted">(one per line)</small><textarea name="processSteps" rows="3" maxlength="400" placeholder="Research&#10;Define&#10;Ideate&#10;Design&#10;Test">${esc((c.process?.steps || []).join("\n"))}</textarea></label>
        <label class="li-field full">Problem statement<textarea name="problem" rows="3" maxlength="3000">${esc(c.problem || "")}</textarea></label>
        <label class="li-field full">Key insight<textarea name="insight" rows="2" maxlength="2000">${esc(c.insight || "")}</textarea></label>
        <label class="li-field full">Solution<textarea name="solution" rows="3" maxlength="3000">${esc(c.solution || "")}</textarea></label>
        <label class="li-field full">Outcome<textarea name="outcome" rows="2" maxlength="2000">${esc(c.outcome || "")}</textarea></label>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>Who I designed for</legend>
        <label class="li-field full">Intro<textarea name="personasIntro" rows="2" maxlength="1000">${esc(c.personas?.intro || "")}</textarea></label>
        <div class="li-pf-personas full" id="li-pf-personas">${personaHtml()}</div>
        <button type="button" class="li-btn small" id="li-pf-persona-add">+ Add a persona</button>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>Research and structure</legend>
        <label class="li-field full">Competitive analysis: intro<textarea name="compIntro" rows="2" maxlength="1000">${esc(c.competitive?.intro || "")}</textarea></label>
        <label class="li-field full">Comparison table <small class="li-muted">(first line: Feature | You | Competitor…; then Feature | yes | partial | no)</small><textarea name="compTable" rows="5" maxlength="3000">${esc(compText)}</textarea></label>
        <label class="li-field full">Information architecture: intro<textarea name="iaIntro" rows="2" maxlength="1000">${esc(c.ia?.intro || "")}</textarea></label>
        <label class="li-field">App name (top of the map)<input name="iaRoot" maxlength="60" value="${esc(c.ia?.root || "")}"></label>
        <label class="li-field full">Sections <small class="li-muted">(one per line: Section: item; item; item)</small><textarea name="iaSections" rows="5" maxlength="3000">${esc(iaText)}</textarea></label>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>User flow</legend>
        <label class="li-field">Title<input name="flowTitle" maxlength="100" value="${esc(c.flow?.title || "")}" placeholder="User flow — booking a flight"></label>
        <label class="li-field full">Intro<textarea name="flowIntro" rows="2" maxlength="1000">${esc(c.flow?.intro || "")}</textarea></label>
        <div class="li-pf-groups full" id="li-pf-flow">${flowHtml()}</div>
        <button type="button" class="li-btn small" id="li-pf-flow-add">+ Add a step</button>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>UI style guide</legend>
        <label class="li-field full">Intro<textarea name="styleIntro" rows="2" maxlength="1000">${esc(c.style?.intro || "")}</textarea></label>
        <label class="li-field full">Colours <small class="li-muted">(one per line: Name #HEX)</small><textarea name="styleColors" rows="4" maxlength="1000">${esc(colorsText)}</textarea></label>
        <label class="li-field">Font<input name="styleFont" maxlength="60" value="${esc(c.style?.font || "")}" placeholder="Poppins"></label>
        <label class="li-field">Button colour<input name="styleButton" maxlength="9" value="${esc(c.style?.button || "")}" placeholder="#3366FF"></label>
        <label class="li-field">Sample heading<input name="styleHead" maxlength="80" value="${esc(c.style?.sampleHead || "")}"></label>
        <label class="li-field">Sample text<input name="styleBody" maxlength="200" value="${esc(c.style?.sampleBody || "")}"></label>
      </fieldset>`,
    onReady(f) {
      f.querySelector("[data-case-delete]")?.addEventListener("click", async () => {
        // The confirm replaces this dialog; if you don't delete, the editor opens again.
        if (!(await onDelete())) editCase(original, done, onDelete, saved);
      });
      const draw = () => { f.querySelector("#li-pf-shots").innerHTML = shotsHtml() + `<label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" multiple data-shots hidden></label>`; };
      readPersonas = () => { personas = [...f.querySelectorAll("[data-persona]")].map((row, i) => ({
        photo: personas[i]?.photo || "",
        name: row.querySelector('[data-p="name"]').value.trim(), summary: row.querySelector('[data-p="summary"]').value.trim(),
        age: row.querySelector('[data-p="age"]').value.trim(), sex: row.querySelector('[data-p="sex"]').value,
        location: row.querySelector('[data-p="location"]').value.trim(), occupation: row.querySelector('[data-p="occupation"]').value.trim(),
        needs: lines(row.querySelector('[data-p="needs"]').value), frustrations: lines(row.querySelector('[data-p="frustrations"]').value), goals: lines(row.querySelector('[data-p="goals"]').value) })); };
      readFlow = () => { f.querySelectorAll("[data-flow-label]").forEach((i) => { flow[Number(i.dataset.flowLabel)].label = i.value.trim(); }); };
      f.addEventListener("change", async (e) => {
        const up = async (file) => upload(file, file.name);
        try {
          if (e.target.matches("[data-shots]")) { for (const file of e.target.files) shots.push({ src: await up(file), alt: "" }); draw(); }
          if (e.target.matches("[data-persona-photo]") && e.target.files[0]) {
            readPersonas();
            personas[Number(e.target.dataset.personaPhoto)].photo = await up(e.target.files[0]);
            f.querySelector("#li-pf-personas").innerHTML = personaHtml();
          }
          if (e.target.matches("[data-flow-img]")) { readFlow(); flow[Number(e.target.dataset.flowImg)].src = await up(e.target.files[0]); f.querySelector("#li-pf-flow").innerHTML = flowHtml(); }
        } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
      });
      f.addEventListener("click", (e) => {
        const b = e.target.closest("[data-shot-remove],[data-flow-remove],[data-persona-remove],[data-persona-photo-remove],#li-pf-persona-add,#li-pf-flow-add");
        if (!b) return;
        if (b.matches("[data-shot-remove]")) { shots.splice(Number(b.dataset.shotRemove), 1); draw(); }
        if (b.matches("[data-flow-remove]")) { readFlow(); flow.splice(Number(b.dataset.flowRemove), 1); f.querySelector("#li-pf-flow").innerHTML = flowHtml(); }
        if (b.matches("#li-pf-flow-add")) { readFlow(); flow.push({ label: "", src: "" }); f.querySelector("#li-pf-flow").innerHTML = flowHtml(); }
        if (b.matches("[data-persona-photo-remove]")) { readPersonas(); personas[Number(b.dataset.personaPhotoRemove)].photo = ""; f.querySelector("#li-pf-personas").innerHTML = personaHtml(); }
        if (b.matches("[data-persona-remove]")) { readPersonas(); personas.splice(Number(b.dataset.personaRemove), 1); f.querySelector("#li-pf-personas").innerHTML = personaHtml(); }
        if (b.matches("#li-pf-persona-add")) { readPersonas(); personas.push({}); f.querySelector("#li-pf-personas").innerHTML = personaHtml(); }
      });
    },
    async onSubmit(v) {
      if (!v.title.trim()) throw new Error("Give the case study a title.");
      readPersonas(); readFlow();
      const [head, ...rows] = lines(v.compTable).map((l) => l.split("|").map((x) => x.trim()));
      const next = {
        ...c,
        id: c.id || "",
        title: v.title.trim(), tag: v.tag.trim(), cardDesc: v.cardDesc.trim(), status: v.status === "progress" ? "progress" : "live",
        liveUrl: v.liveUrl.trim(), phone: !!v.phone, project: v.project || "", pill: v.pill.trim(), subtitle: v.subtitle.trim(),
        shots, meta: [...META.map((l) => ({ label: l, value: v["meta_" + l].trim() })), ...(c.meta || []).filter((m) => !META.includes(m.label))].filter((m) => m.value),
        overview: v.overview.trim(), problem: v.problem.trim(), insight: v.insight.trim(), solution: v.solution.trim(), outcome: v.outcome.trim(),
        process: { intro: v.processIntro.trim(), steps: lines(v.processSteps) },
        personas: { intro: v.personasIntro.trim(), items: personas.filter((p) => p.name) },
        competitive: { intro: v.compIntro.trim(), columns: head || [], rows: rows.map(([feature, ...values]) => ({ feature, values: values.map((x) => (/^(yes|y|✓)$/i.test(x) ? "yes" : /^(partial|~|≈)$/i.test(x) ? "partial" : "no")) })) },
        ia: { intro: v.iaIntro.trim(), root: v.iaRoot.trim(), sections: lines(v.iaSections).map((l) => { const [t, ...rest] = l.split(":"); return { title: t.trim(), items: rest.join(":").split(";").map((x) => x.trim()).filter(Boolean) }; }) },
        flow: { title: v.flowTitle.trim(), intro: v.flowIntro.trim(), steps: flow.filter((s) => s.label || s.src) },
        style: { ...(c.style || {}), intro: v.styleIntro.trim(), font: v.styleFont.trim(), button: v.styleButton.trim(), sampleHead: v.styleHead.trim(), sampleBody: v.styleBody.trim(),
          colors: lines(v.styleColors).map((l) => { const m = l.match(/^(.*?)\s*(#[0-9a-f]{3,8})$/i); return m ? { name: m[1].trim() || m[2], hex: m[2] } : null; }).filter(Boolean) },
      };
      await storeCase(next, saved);
      toast("Case study saved");
      done();
    },
  });
}
