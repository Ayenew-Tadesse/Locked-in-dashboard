// Resume (owner): edit your resume section by section, like Edit portfolio,
// with a live preview underneath. Saved in preferences.portfolio.site.cv, so
// the Resume button on the page hiring managers open shows it
// (portfolio.html#t=…&page=resume). Starts from the resume you wrote.
import { state, toast } from "../state.js";
import { esc } from "../ui/dom.js";
import { sortable } from "../ui/sortable.js";
import { CV_SECTIONS, renderResume, printResume } from "../portfolio/resume.js";
import { announceSaved, openWebPreview } from "./portfolio.js";

const lines = (v) => String(v || "").split("\n").map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
const items = (v) => String(v || "").split(/\s*[•,\n]\s*/).map((x) => x.trim()).filter(Boolean);
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const openSections = new Set(["header"]);

// Which fields each kind of entry has: [key, label, placeholder].
const ENTRY_FIELDS = {
  projects: [["title", "Project", "Mobile Banking Application"], ["subtitle", "Type", "UI/UX Design"]],
  frontend: [["title", "Title", "Web Interface Development"]],
  experience: [["title", "Company", "The Home Depot"], ["subtitle", "Role", "Service Desk Associate"], ["place", "Place", "Aspen Hill, MD"], ["dates", "Dates", "September 2024 – Present"]],
  education: [["title", "Degree", "Bachelor of Science in Architecture"], ["subtitle", "School", "Mekelle University"], ["dates", "Years", "2016 – 2022"], ["note", "Relevant foundation", "Relevant foundation: Visual Design • …"]],
  certifications: [["title", "Certification", "UI/UX Design Foundations"]],
};
const ADD_LABEL = { projects: "+ Add a project", frontend: "+ Add an entry", experience: "+ Add a role", education: "+ Add education", certifications: "+ Add a certification" };

/** The resume you wrote, with your contact details filled in from your portfolio. */
function starterResume() {
  const site = state.settings.preferences?.portfolio?.site || {};
  const contact = site.contact || [];
  const find = (re) => contact.find((c) => re.test(c.href || "") || re.test(c.label || ""));
  const phone = find(/^tel:|phone/i), email = find(/^mailto:|email/i), linkedin = find(/linkedin/i);
  const portfolio = "https://ayenew-tadesse.github.io/Portfolio/", github = "https://github.com/Ayenew-Tadesse";
  const li = linkedin?.href || "";
  return {
    name: "AYENEW SHIFERAW",
    location: "Silver Spring, MD",
    title: "UI/UX DESIGNER | FRONT-END DEVELOPER",
    contacts: [
      { label: "Phone", value: phone?.value || "", href: phone?.href || "" },
      { label: "Email", value: email?.value || "", href: email?.href || "" },
      { label: "LinkedIn", value: "LinkedIn", href: li },
      { label: "Portfolio", value: "Portfolio", href: portfolio },
      { label: "GitHub", value: "GitHub", href: github },
    ],
    summary: "UI/UX Designer with a background in architecture and hands-on experience designing digital products across mobile, web, e-commerce, SaaS, travel, financial services, and data-visualization concepts. Skilled in translating user needs into intuitive interfaces through user-centered design, wireframing, prototyping, visual design, responsive layouts, and interactive prototypes. Proficient with Figma and familiar with HTML, CSS, and JavaScript, with an interest in building production-ready digital experiences and collaborating across design and development.",
    skills: [
      { label: "UI/UX Design", items: ["User-Centered Design", "User Flows", "Information Architecture", "Wireframing", "Prototyping", "Visual Design", "Responsive Design", "Interaction Design", "Design Systems", "Usability"] },
      { label: "Tools", items: ["Figma", "Prototyping", "Design Components", "Interactive Prototypes"] },
      { label: "Front-End", items: ["HTML", "CSS", "JavaScript", "Responsive Web Design"] },
      { label: "Design Foundation", items: ["Layout", "Typography", "Color", "Visual Hierarchy", "Accessibility Principles", "Design Thinking"] },
      { label: "Product Areas", items: ["Mobile Apps", "SaaS Dashboards", "E-Commerce", "FinTech", "Travel", "Data Visualization", "Consumer Applications"] },
    ],
    projects: [
      { title: "Mobile Banking Application", subtitle: "UI/UX Design", bullets: [
        "Designed a mobile banking experience focused on simplifying common financial tasks and improving navigation.",
        "Developed wireframes, interface concepts, and interactive prototypes in Figma.",
        "Applied user-centered design principles to organize financial information and prioritize important user actions.",
        "Designed reusable interface patterns to create a consistent experience across screens."] },
      { title: "Flight & Hotel Booking Experience", subtitle: "Product Design", bullets: [
        "Designed a travel-booking experience covering flight and hotel discovery, selection, and booking flows.",
        "Created user flows, wireframes, high-fidelity screens, and interactive prototypes.",
        "Focused on reducing friction during search and selection while maintaining clear information hierarchy.",
        "Applied responsive design principles for digital travel experiences."] },
      { title: "SaaS Analytics Dashboard", subtitle: "UI/UX Design", bullets: [
        "Designed a B2B/SaaS dashboard for presenting business and performance information in an accessible format.",
        "Created dashboard layouts, navigation structures, data visualization concepts, and reusable UI components.",
        "Focused on information hierarchy and helping users identify important metrics quickly.",
        "Designed the experience with scalability and consistency in mind."] },
      { title: "E-Commerce Experience", subtitle: "UI/UX Design", bullets: [
        "Designed an e-commerce interface covering product discovery, product details, shopping, and user interactions.",
        "Developed wireframes and high-fidelity Figma designs.",
        "Applied visual hierarchy, responsive design, and conversion-focused interface principles.",
        "Structured the experience around intuitive navigation and clear product information."] },
      { title: "Social Media Analytics Dashboard", subtitle: "UI/UX Design", bullets: [
        "Designed a dashboard concept for analyzing social-media performance and engagement.",
        "Organized complex information into accessible dashboard sections and visual metrics.",
        "Developed interface components and layouts designed for efficient information scanning.",
        "Applied consistent typography, spacing, hierarchy, and interaction patterns."] },
      { title: "Spotify Mobile Experience", subtitle: "UI/UX Concept", bullets: [
        "Designed a Spotify-inspired mobile interface exploring light and dark visual themes.",
        "Created high-fidelity screens and interactive prototypes in Figma.",
        "Explored visual hierarchy, navigation, content organization, and reusable components.",
        "Used the project to develop stronger skills in mobile interface design and visual systems."] },
    ],
    frontend: [
      { title: "Web Interface Development", bullets: [
        "Build responsive web interfaces using HTML, CSS, and JavaScript.",
        "Translate Figma designs into structured web interfaces with attention to spacing, typography, responsiveness, and interaction.",
        "Develop and maintain web projects using GitHub-based workflows.",
        "Work across the design-to-development process from interface concept through implementation."] },
    ],
    experience: [
      { title: "The Home Depot", subtitle: "Service Desk Associate", place: "Aspen Hill, MD", dates: "September 2024 – Present", bullets: [
        "Provide customer-facing support in a high-volume retail environment while managing multiple requests and priorities.",
        "Resolve customer issues by identifying needs, communicating solutions clearly, and coordinating with multiple departments.",
        "Maintain accuracy and attention to detail while handling service-desk processes and operational tasks.",
        "Collaborate with supervisors and associates across departments to resolve problems and improve the customer experience.",
        "Recognized as Employee of the Month twice within a four-month period."] },
    ],
    education: [
      { title: "Bachelor of Science in Architecture", subtitle: "Mekelle University", dates: "2016 – 2022",
        note: "Relevant foundation: Visual Design • Spatial Planning • Design Process • Problem Solving • Technical Drawing • Presentation • Design Communication" },
    ],
    certifications: [
      { title: "UI/UX Design Foundations", bullets: ["User-Centered Design", "Wireframing", "Prototyping", "Visual Design", "Figma", "Designing intuitive digital experiences"] },
    ],
    additional: [
      { label: "Portfolio", value: portfolio, href: portfolio },
      { label: "LinkedIn", value: li, href: li },
      { label: "GitHub", value: github, href: github },
    ],
    show: {},
  };
}

const savedResume = () => clone(state.settings.preferences?.portfolio?.site?.cv);

function section(key, title, body, hint = "") {
  return `<details class="li-pf-sec" data-sec="${key}"${openSections.has(key) ? " open" : ""}>
    <summary><span>${esc(title)}</span>${hint ? `<small class="li-muted">${esc(hint)}</small>` : ""}</summary>
    <div class="li-pf-sec-body li-form">${body}</div></details>`;
}
const grip = `<button type="button" class="li-sort-grip" data-sort-handle aria-label="Drag to reorder (or use the arrow keys)" title="Drag to reorder">&#10303;</button>`;
const remove = `<button type="button" class="li-icon-btn" data-remove aria-label="Remove" title="Remove">&#10005;</button>`;

function linkRow(c = {}) {
  return `<div class="li-cv-row li-cv-link" data-row>${grip}
    <input data-k="label" maxlength="40" value="${esc(c.label || "")}" placeholder="Label, e.g. Email" aria-label="Label">
    <input data-k="value" maxlength="160" value="${esc(c.value || "")}" placeholder="Shown text" aria-label="Shown text">
    <input data-k="href" maxlength="300" value="${esc(c.href || "")}" placeholder="Link: https://, mailto: or tel:" aria-label="Link">${remove}</div>`;
}
function skillRow(s = {}) {
  return `<div class="li-cv-row li-cv-skill" data-row>${grip}
    <input data-k="label" maxlength="40" value="${esc(s.label || "")}" placeholder="Label, e.g. Tools" aria-label="Skill group">
    <input data-k="items" maxlength="600" value="${esc((s.items || []).join(" • "))}" placeholder="Figma • Prototyping • …  (separate with • or commas)" aria-label="Skills">${remove}</div>`;
}
function entryCard(kind, e = {}) {
  const fields = ENTRY_FIELDS[kind];
  return `<div class="li-cv-entry" data-row data-kind="${kind}">
    <div class="li-cv-entry-head">${grip}<b>${esc([e.title, e.subtitle].filter(Boolean).join(" — ") || "New entry")}</b>${remove}</div>
    <div class="li-cv-entry-fields">
      ${fields.map(([k, label, ph]) => `<label class="li-field${k === "note" ? " full" : ""}">${esc(label)}<input data-k="${k}" maxlength="${k === "note" ? 400 : 160}" value="${esc(e[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}
      ${kind !== "education" ? `<label class="li-field full">Bullet points <small class="li-muted">(one per line)</small><textarea data-k="bullets" rows="${Math.max(3, (e.bullets || []).length + 1)}" maxlength="3000">${esc((e.bullets || []).join("\n"))}</textarea></label>` : ""}
    </div></div>`;
}

function editorHtml(cv, saved) {
  const heading = Object.fromEntries(CV_SECTIONS);
  const list = (kind) => `<div class="li-cv-list" data-list="${kind}">${(cv[kind] || []).map((e) => entryCard(kind, e)).join("")}</div>
    <button type="button" class="li-btn small" data-add="${kind}">${ADD_LABEL[kind]}</button>`;
  return `
  <section class="li-card li-pf-editor" id="li-cv-editor">
    <div class="li-card-head"><span class="card-label">Edit resume</span></div>
    <p class="li-sub">${saved ? "Your resume. The Resume button on your portfolio opens it, and hiring managers can download it as a PDF."
      : "<b>A starting draft from the resume you wrote.</b> Fill in anything missing and press Save: then the Resume button on your portfolio opens it."}
      Drag &#10303; to reorder entries.</p>
    <form class="li-pf-form li-pf-editor-form" id="li-cv-form" autocomplete="off">
      ${section("header", "Header", `
        <label class="li-field">Name<input name="name" maxlength="80" value="${esc(cv.name || "")}"></label>
        <label class="li-field">Location<input name="location" maxlength="80" value="${esc(cv.location || "")}" placeholder="Silver Spring, MD"></label>
        <label class="li-field full">Title line<input name="title" maxlength="120" value="${esc(cv.title || "")}" placeholder="UI/UX DESIGNER | FRONT-END DEVELOPER"></label>
        <div class="li-field full"><span>Contact links <small class="li-muted">(shown after the location, separated by |)</small></span></div>
        <div class="li-cv-list" data-list="contacts">${(cv.contacts || []).map(linkRow).join("")}</div>
        <button type="button" class="li-btn small" data-add="contacts">+ Add a contact</button>`)}
      ${section("summary", heading.summary, `<label class="li-field full">Summary<textarea name="summary" rows="6" maxlength="3000">${esc(cv.summary || "")}</textarea></label>`)}
      ${section("skills", heading.skills, `<div class="li-cv-list" data-list="skills">${(cv.skills || []).map(skillRow).join("")}</div>
        <button type="button" class="li-btn small" data-add="skills">+ Add a skill line</button>`)}
      ${section("projects", heading.projects, list("projects"))}
      ${section("frontend", heading.frontend, list("frontend"))}
      ${section("experience", heading.experience, list("experience"))}
      ${section("education", heading.education, list("education"))}
      ${section("certifications", heading.certifications, list("certifications"))}
      ${section("additional", heading.additional, `<div class="li-cv-list" data-list="additional">${(cv.additional || []).map(linkRow).join("")}</div>
        <button type="button" class="li-btn small" data-add="additional">+ Add a line</button>`)}
      ${section("show", "Sections to show", `<div class="li-pf-checks full">${CV_SECTIONS.map(([k, h]) => `<label class="li-check-row"><input type="checkbox" name="show_${k}"${cv.show?.[k] === false ? "" : " checked"}> ${esc(h)}</label>`).join("")}</div>`)}
      <div class="li-form-actions"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save</button></div>
    </form>
  </section>`;
}

function readForm(form) {
  const f = form.elements;
  const rows = (kind) => [...form.querySelectorAll(`[data-list="${kind}"] > [data-row]`)];
  const val = (row, k) => row.querySelector(`[data-k="${k}"]`)?.value.trim() || "";
  const links = (kind) => rows(kind).map((r) => ({ label: val(r, "label"), value: val(r, "value"), href: val(r, "href") })).filter((x) => x.label || x.value || x.href);
  const entries = (kind) => rows(kind).map((r) => {
    const e = {};
    for (const [k] of ENTRY_FIELDS[kind]) e[k] = val(r, k);
    if (kind !== "education") e.bullets = lines(r.querySelector('[data-k="bullets"]')?.value);
    return e;
  }).filter((e) => Object.values(e).some((v) => (Array.isArray(v) ? v.length : v)));
  return {
    name: f.name.value.trim(), location: f.location.value.trim(), title: f.title.value.trim(),
    contacts: links("contacts"),
    summary: f.summary.value.trim(),
    skills: rows("skills").map((r) => ({ label: val(r, "label"), items: items(r.querySelector('[data-k="items"]').value) })).filter((s) => s.label || s.items.length),
    projects: entries("projects"), frontend: entries("frontend"), experience: entries("experience"),
    education: entries("education"), certifications: entries("certifications"),
    additional: links("additional"),
    show: Object.fromEntries(CV_SECTIONS.map(([k]) => [k, !!f["show_" + k]?.checked])),
  };
}

export function renderResumeEditor(el) {
  if (state.isColleague) { el.innerHTML = `<p class="li-empty">The resume is for the team owner.</p>`; return; }
  const saved = savedResume();
  const cv = saved || starterResume();
  el.innerHTML = `
    ${editorHtml(cv, !!saved)}
    <section class="li-card li-cv-preview-card">
      <div class="li-card-head"><span class="card-label">Preview</span><button type="button" class="li-btn small" id="li-cv-print">Download PDF</button></div>
      <div class="li-cv-paper" id="li-cv-preview">${renderResume(cv)}</div>
    </section>`;

  const form = el.querySelector("#li-cv-form");
  const preview = el.querySelector("#li-cv-preview");
  const bar = document.getElementById("li-pagebar-actions");
  let dirty = false, typing = 0;
  const setDirty = (on) => {
    dirty = on;
    const b = bar?.querySelector("#li-cv-save");
    if (b) { b.classList.toggle("primary", on); b.textContent = on ? "Save •" : "Save"; }
  };
  const draw = () => { if (form.isConnected) preview.innerHTML = renderResume(readForm(form)); };
  const changed = () => { if (!dirty) setDirty(true); clearTimeout(typing); typing = setTimeout(draw, 250); };

  if (bar) {
    bar.innerHTML = `<div class="li-pf-modes" role="group" aria-label="Resume">
      <button type="button" class="li-btn small on" id="li-cv-edit" aria-current="page"><span class="li-ico" aria-hidden="true">&#9998;</span> Edit</button>
      <button type="button" class="li-btn small" id="li-cv-save">Save</button>
      <button type="button" class="li-btn small" id="li-cv-web" title="Open your resume in a new tab, as a hiring manager sees it."><span class="li-ico" aria-hidden="true">&#8599;</span> Preview on web</button>
    </div>`;
    bar.querySelector("#li-cv-edit").addEventListener("click", () => el.querySelector("#li-cv-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    bar.querySelector("#li-cv-save").addEventListener("click", () => form.requestSubmit());
    bar.querySelector("#li-cv-web").addEventListener("click", () => {
      if (!savedResume()) { toast("Save your resume first, then preview it on the web", "error"); return; }
      openWebPreview("resume");
    });
  }
  if (!saved) setDirty(true); // the starting draft isn't saved yet

  el.querySelectorAll(".li-pf-sec").forEach((d) => d.addEventListener("toggle", () => { if (d.open) openSections.add(d.dataset.sec); else openSections.delete(d.dataset.sec); }));
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  form.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const kind = add.dataset.add, list = form.querySelector(`[data-list="${kind}"]`);
      list.insertAdjacentHTML("beforeend", kind === "contacts" || kind === "additional" ? linkRow() : kind === "skills" ? skillRow() : entryCard(kind));
      list.lastElementChild.querySelector("input")?.focus();
      changed();
      return;
    }
    const rm = e.target.closest("[data-remove]");
    if (rm) { rm.closest("[data-row]").remove(); changed(); }
  });
  form.querySelectorAll("[data-list]").forEach((list) => sortable(list, { item: "[data-row]", onChange: changed }));
  el.querySelector("#li-cv-print").addEventListener("click", () => { draw(); printResume(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearTimeout(typing);
    const cvNew = readForm(form);
    if (!cvNew.name) { toast("Add your name first", "error"); return; }
    const prefs = state.settings.preferences || {}, old = prefs.portfolio || {};
    try {
      const s = await state.store.savePreferences({ ...prefs, portfolio: { ...old, site: { ...(old.site || {}), cv: cvNew } } });
      state.settings = { ...state.settings, ...s };
      setDirty(false);
      draw();
      el.querySelector("#li-cv-editor .li-sub").innerHTML = "Your resume. The Resume button on your portfolio opens it, and hiring managers can download it as a PDF. Drag &#10303; to reorder entries.";
      announceSaved();
      toast("Resume saved");
    } catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });
}
