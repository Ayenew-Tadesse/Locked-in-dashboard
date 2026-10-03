// Edit the portfolio home page on the page itself (the case-study editor's
// way): the page as a hiring manager sees it, with the introduction, photo,
// numbers, About me, Key skills and Contact edited in place, + to add, ✕ to
// remove, and a Shown / Hidden switch on each section. Case-study cards open
// the case-study editor. Highlights, experience and "How I work" are still
// edited with the form for now; Activity, Milestones and The plan come from
// the dashboard (they can only be shown or hidden).
import { state, toast } from "../state.js";
import { esc, openModal, closeModal, confirmDialog } from "../ui/dom.js";
import { openPageEditor, ed, add, del, paraList, imgUrl } from "./page-editor.js";
import { CONTACT_ICONS, contactIcon } from "../portfolio/site.js";
import { portfolioPrefs } from "../core/portfolio.js";

const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const OPEN = [["remote", "Remote"], ["hybrid", "Hybrid"], ["relocation", "Relocation"]];
const MAX_STATS = 4;

// A section's Shown / Hidden switch (hidden sections stay here, faded).
const toggle = (model, key, label) => {
  const on = model.show[key] !== false;
  return `<button type="button" class="ce-toggle${on ? " on" : ""}" data-act="toggle" data-path="${key}" aria-pressed="${on}" aria-label="${esc(label)}: ${on ? "shown" : "hidden"}. Tap to ${on ? "hide" : "show"}">${on ? "Shown" : "Hidden"}</button>`;
};
const head = (model, key, title) => `<div class="ce-sechead"><h2>${esc(title)}</h2>${toggle(model, key, title)}</div>`;
const section = (model, key, title, body, id = "") => `<section class="pf-section ce-sec${model.show[key] === false ? " ce-hidden" : ""}"${id ? ` id="${id}"` : ""}>${head(model, key, title)}${body}</section>`;
const note = (text, form) => `<p class="ce-sec-note">${esc(text)}${form ? ` <button type="button" class="li-btn small" data-act="form">Edit as a form</button>` : ""}</p>`;

function render(m) {
  const h = m.hero;
  const webLinks = m.contact.map((c, i) => [c, i]).filter(([c]) => /^https?:\/\//i.test(c.href || ""));
  return `
  <div class="pf-s-top"><button type="button" class="pf-btn pf-btn--outline pf-resume-btn" data-act="resume" aria-label="Resume link">Resume${m.resume ? "" : " · add a link"}</button></div>
  <section class="pf-s-hero ce-hero">
    <div class="pf-s-hero__text">
      ${ed("hero.eyebrow", h.eyebrow, { tag: "p", cls: "pf-s-eyebrow", ph: "Greeting, e.g. Hello there, I am" })}
      ${ed("hero.name", h.name, { tag: "h1", ph: "Your name" })}
      <p class="pf-s-role"><b>${ed("hero.role", h.role, { ph: "Role" })}</b>, based in ${ed("hero.location", h.location, { ph: "Location" })}</p>
      ${ed("hero.description", h.description, { tag: "p", cls: "pf-s-desc", ph: "One or two sentences: what you design and how", multi: true })}
      <p class="pf-s-open ce-open">${OPEN.map(([k, l]) => `<button type="button" class="ce-chiptoggle${h.open[k] ? " on" : ""}" data-act="open" data-path="${k}" aria-pressed="${!!h.open[k]}">Open to ${l}</button>`).join("")}</p>
      <p class="ce-roles">Looking for: ${ed("hero.roles", h.roles, { ph: "Roles, e.g. Senior Product Designer" })}</p>
    </div>
    <div class="pf-s-figure">
      <span class="ce-item ce-photo">${imgUrl(m.portrait)
        ? `<button type="button" class="ce-img" data-act="img" data-path="portrait" aria-label="Change photo"><img class="pf-s-portrait" src="${esc(m.portrait)}" alt=""></button>${del("photo", "Remove photo").replace('data-act="del"', 'data-act="unphoto"')}`
        : `<button type="button" class="ce-add ce-add--photo" data-act="img" data-path="portrait">+ Photo</button>`}</span>
      <nav class="pf-socials ce-socials" aria-label="Social links (edit them in Contact)">${webLinks.map(([c, i]) => `<button type="button" class="pf-social" data-act="gocontact" data-path="${i}" title="${esc(c.label)}: edit in Contact" aria-label="${esc(c.label)}: edit its link in Contact">${CONTACT_ICONS[contactIcon(c)]}</button>`).join("")}
        <button type="button" class="pf-social ce-social-add" data-act="contact" data-path="contact" aria-label="Add a social link" title="Add a social link">+</button></nav>
    </div>
  </section>
  <div class="ce-sec ce-stats${m.show.stats === false ? " ce-hidden" : ""}"><div class="ce-sechead ce-sechead--small"><span>Numbers</span>${toggle(m, "stats", "Numbers")}</div>
    <div class="pf-s-stats">${m.stats.map((x, i) => `<div class="ce-item${i === Math.floor((m.stats.length - 1) / 2) ? " is-hi" : ""}">${del(`stats.${i}`, "Remove number")}<b>${ed(`stats.${i}.num`, x.num, { ph: "3+" })}</b><span>${ed(`stats.${i}.label`, x.label, { ph: "Label" })}</span></div>`).join("")}</div>
    ${m.stats.length < MAX_STATS ? add("stat", "stats", "Number") : ""}</div>
  ${section(m, "cases", "Featured projects", `<div class="ce-cases">${m.cases.map((c) => `<button type="button" class="pf-card ce-casecard" data-act="case" data-path="${esc(c.id)}">
      <span class="pf-card__thumb${imgUrl(c.shots?.[0]?.src) ? " has-img" : ""}">${imgUrl(c.shots?.[0]?.src) ? `<img src="${esc(c.shots[0].src)}" alt="">` : `<span>${esc(c.title)}</span>`}</span>
      <span class="pf-card__body">${c.tag ? `<span class="pf-card__tag">${esc(c.tag)}</span>` : ""}<b class="ce-casecard__title">${esc(c.title)}</b><span class="ce-casecard__edit">Edit on the page &rarr;</span></span></button>`).join("")}
      <button type="button" class="ce-add ce-add--case" data-act="case" data-path="">+ Add a case study</button></div>`, "pf-cases")}
  ${section(m, "about", "About me", `<div class="pf-s-about">${paraList("about", m.about, "About me")}</div>`)}
  ${section(m, "skillgroups", "Key skills", `<div class="pf-s-skills">${m.skills.map((g, i) => `<div class="pf-s-skill ce-item">${del(`skills.${i}`, "Remove group")}
      ${ed(`skills.${i}.title`, g.title, { tag: "h3", ph: "Group, e.g. Tools" })}
      <ul>${g.items.map((it, j) => `<li class="ce-li">${ed(`skills.${i}.items.${j}`, it, { ph: "Skill" })}${del(`skills.${i}.items.${j}`, "Remove")}</li>`).join("")}</ul>
      ${add("item", `skills.${i}.items`, "Skill")}</div>`).join("")}</div>${add("group", "skills", "Skill group")}`)}
  ${section(m, "highlights", "Highlights", note("Your best results. Edited with the form for now.", true))}
  ${section(m, "experience", "Experience", note("Roles and companies. Edited with the form for now.", true))}
  <section class="pf-section ce-sec"><div class="ce-sechead"><h2>How I work</h2>${toggle(m, "process", "Process")}${toggle(m, "logs", "Finished work notes")}</div>
    ${note("Your approach, process and finished-work notes. Edited with the form for now.", true)}</section>
  ${section(m, "activity", "Activity", note("Filled in from your dashboard: tasks finished, streak and the activity map."))}
  ${section(m, "milestones", "Milestones", note("Filled in from your dashboard."))}
  ${section(m, "plan", "The plan", note("Filled in from your dashboard: this year's quarterly goals."))}
  ${section(m, "contact", "Contact me", `<div class="pf-s-contact">${m.contact.map((c, i) => `<div class="pf-cc ce-item" data-contact="${i}">${del(`contact.${i}`, "Remove contact")}
      ${CONTACT_ICONS[contactIcon(c)]}${ed(`contact.${i}.label`, c.label, { tag: "b", cls: "pf-cc__label", ph: "Label, e.g. Email Address" })}
      ${ed(`contact.${i}.value`, c.value, { cls: "pf-cc__value", ph: "What people see" })}
      <small class="ce-link">Link: ${ed(`contact.${i}.href`, c.href, { ph: "https://…, mailto: or tel:" })}</small></div>`).join("")}</div>
    ${add("contact", "contact", "Contact")}`, "pf-contact")}`;
}

/** The portfolio's home as an editable model (from what's saved, as the form starts). */
export function siteModel(site, prefs) {
  const p = portfolioPrefs(prefs);
  const h = site.hero || {};
  return {
    hero: { eyebrow: h.eyebrow || "", name: h.name || "", role: h.role || "", location: h.location || "", description: h.description || "",
      open: { remote: !!h.open?.remote, hybrid: !!h.open?.hybrid, relocation: !!h.open?.relocation }, roles: h.roles || "" },
    portrait: site.portrait || "", resume: site.resume || "",
    stats: (site.stats || []).map((x) => ({ num: x.num || "", label: x.label || "" })).slice(0, MAX_STATS),
    about: [...(site.about || [])],
    skills: (site.skills || []).map((g) => ({ title: g.title || "", items: [...(g.items || [])] })),
    contact: (site.contact || []).map((c) => ({ label: c.label || "", value: c.value || "", href: c.href || "" })),
    cases: clone(site.cases || []),
    show: { ...p.show },
  };
}

/**
 * Open it. opts.site / opts.prefs: what to start from; opts.save(model) stores it;
 * opts.openCase(id): edit a case study (after this editor has closed); opts.openForm(); opts.done().
 */
export function openSiteEditor(opts) {
  const model = siteModel(opts.site, opts.prefs);
  const save = async () => { await opts.save(model); toast("Portfolio saved"); };

  // Leaving for a case study or the form: keep (save) what you've changed first.
  const leave = async (ctx, then) => {
    if (ctx.isDirty()) {
      if (!(await confirmDialog("Save your changes to the page first?", "Save and continue"))) return;
      try { await save(); } catch (err) { toast("Couldn't save: " + err.message, "error"); return; }
    }
    ctx.close(true);
    then();
  };

  const settings = (ctx) => openModal({
    eyebrow: "Portfolio", title: "Settings", submitLabel: "Done",
    extraButtons: `<button type="button" class="li-btn ghost" data-site-form>Edit as a form</button>`,
    body: `<label class="li-field full">Resume link <small class="li-muted">(a web link or mailto:; your built-in resume is used when you've made one)</small>
      <input name="resume" maxlength="500" value="${esc(model.resume)}" placeholder="https://… or mailto:you@example.com"></label>`,
    onReady(f) { f.querySelector("[data-site-form]").addEventListener("click", () => { closeModal(); leave(ctx, opts.openForm); }); },
    async onSubmit(v) { model.resume = v.resume.trim(); ctx.markDirty(); ctx.draw(); },
  });

  const ctx = openPageEditor({
    model, label: "Edit portfolio", title: "Your portfolio, on the page", className: "ce-site",
    discardText: "Discard your changes to the portfolio?",
    focus: '[data-k="hero.name"]',
    render, settings, done: opts.done, onClose: opts.onClose,
    async save(m, c) {
      if (!m.hero.name.trim()) { toast("Add your name first.", "error"); c.page.querySelector('[data-k="hero.name"]')?.focus(); return false; }
      await save();
    },
    actions: {
      toggle(key) { model.show[key] = model.show[key] === false; },
      open(key) { model.hero.open[key] = !model.hero.open[key]; },
      unphoto() { model.portrait = ""; },
      stat() { model.stats.push({ num: "", label: "" }); return `stats.${model.stats.length - 1}.num`; },
      group() { model.skills.push({ title: "", items: [] }); return `skills.${model.skills.length - 1}.title`; },
      contact() { model.contact.push({ label: "", value: "", href: "" }); return `contact.${model.contact.length - 1}.label`; },
      gocontact(i, c) {
        const el = c.page.querySelector(`[data-k="contact.${i}.href"]`);
        el?.scrollIntoView({ block: "center" });
        el?.focus();
        return false;
      },
      resume(path, c) { settings(c); return false; },
      form(path, c) { leave(c, opts.openForm); return false; },
      case(id, c) { leave(c, () => opts.openCase(id || null)); return false; },
    },
  });
  return ctx;
}
