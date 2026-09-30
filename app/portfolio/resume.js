// Your resume: a classic one-page US resume (white paper, black text, ruled
// section headings), drawn from preferences.portfolio.site.cv. The same
// HTML is used for the dashboard's Resume preview and for the Resume button
// on the page hiring managers open (portfolio.html#t=…&page=resume).
import { esc } from "../ui/dom.js";
import { safeUrl } from "../core/projects.js";

/** The sections, in order: [key, heading]. */
export const CV_SECTIONS = [
  ["summary", "Professional Summary"],
  ["skills", "Core Skills"],
  ["projects", "Selected UI/UX Projects"],
  ["frontend", "Front-End Development"],
  ["experience", "Professional Experience"],
  ["education", "Education"],
  ["certifications", "Certification"],
  ["additional", "Additional"],
];

/** Is there a resume to show? */
export function hasResume(site) {
  return !!site?.cv && typeof site.cv === "object" && !!String(site.cv.name || "").trim();
}

// mailto:, tel: and web links only.
function href(u) {
  const s = String(u || "").trim();
  if (/^(mailto|tel):/i.test(s)) return s;
  return safeUrl(s) || "";
}
const a = (url, text) => {
  const h = href(url);
  return h ? `<a href="${esc(h)}"${/^https?:/i.test(h) ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>` : esc(text);
};
// A contact or link line with something to show (not just its label).
const filled = (c) => !!(c && (String(c.href || "").replace(/^(mailto|tel):$/i, "").trim() || (c.value && c.value.trim() !== String(c.label || "").trim())));
const bullets = (list) => (list || []).filter(Boolean).length ? `<ul>${list.filter(Boolean).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";

function entry(e, kind) {
  const title = [e.title, e.subtitle].filter(Boolean).map(esc).join(" — ");
  const meta = [e.place, e.dates].filter(Boolean).map(esc).join(" | ");
  if (kind === "education") {
    return `<div class="cv-entry">
      ${e.title ? `<p class="cv-entry__title">${esc(e.title)}</p>` : ""}
      ${e.subtitle || e.dates ? `<p class="cv-entry__meta">${[e.subtitle, e.dates].filter(Boolean).map(esc).join(" | ")}</p>` : ""}
      ${e.note ? `<p class="cv-entry__note">${esc(e.note)}</p>` : ""}
      ${bullets(e.bullets)}</div>`;
  }
  return `<div class="cv-entry">
    ${title ? `<p class="cv-entry__title">${title}</p>` : ""}
    ${meta ? `<p class="cv-entry__meta">${meta}</p>` : ""}
    ${e.note ? `<p class="cv-entry__note">${esc(e.note)}</p>` : ""}
    ${bullets(e.bullets)}</div>`;
}

/** The resume itself (an <article class="cv">). */
export function renderResume(cv) {
  const show = cv.show || {};
  const on = (k) => show[k] !== false;
  const sec = (k, heading, body) => (on(k) && body ? `<section class="cv-sec" id="cv-${k}"><h2>${esc(heading)}</h2>${body}</section>` : "");
  const contacts = [cv.location ? esc(cv.location) : "", ...(cv.contacts || []).filter(filled).map((c) => a(c.href, c.value || c.label))].filter(Boolean);
  const heading = Object.fromEntries(CV_SECTIONS);
  const list = (k) => (cv[k] || []).filter((e) => e && (e.title || e.subtitle || e.bullets?.length || e.note));
  return `<article class="cv" aria-label="Resume">
    <header class="cv-head">
      <h1>${esc(cv.name)}</h1>
      ${contacts.length ? `<p class="cv-contacts">${contacts.join('<span aria-hidden="true"> | </span>')}</p>` : ""}
      ${cv.title ? `<p class="cv-title">${esc(cv.title)}</p>` : ""}
    </header>
    ${sec("summary", heading.summary, cv.summary ? String(cv.summary).split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join("") : "")}
    ${sec("skills", heading.skills, (cv.skills || []).filter((s) => s.label || s.items?.length).length
      ? `<ul class="cv-skills">${cv.skills.filter((s) => s.label || s.items?.length).map((s) => `<li>${s.label ? `<b>${esc(s.label)}:</b> ` : ""}${(s.items || []).map(esc).join(" • ")}</li>`).join("")}</ul>` : "")}
    ${["projects", "frontend", "experience", "education", "certifications"].map((k) => sec(k, heading[k], list(k).map((e) => entry(e, k)).join(""))).join("")}
    ${sec("additional", heading.additional, (cv.additional || []).filter(filled).length
      ? `<ul class="cv-plain">${cv.additional.filter(filled).map((x) => `<li>${x.label ? `<b>${esc(x.label)}:</b> ` : ""}${a(x.href || x.value, x.value || x.href)}</li>`).join("")}</ul>` : "")}
  </article>`;
}

/** The resume with Back and Download PDF, as the portfolio shows it. */
export function renderResumePage(cv) {
  return `<div class="pf pf--resume">
    <nav class="cv-bar" aria-label="Resume">
      <a class="pf-back" href="#" data-home>&larr; Back to portfolio</a>
      <button type="button" class="pf-btn pf-btn--solid" data-print-resume>Download PDF</button>
    </nav>
    ${renderResume(cv)}
  </div>`;
}

/** Print only the resume (the browser's Save as PDF). */
export function printResume() {
  const root = document.documentElement;
  root.classList.add("cv-print");
  const done = () => { root.classList.remove("cv-print"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}
