// The portfolio laid out like your portfolio website (github.com/Ayenew-Tadesse/portfolio):
// a home page (hero, stats, featured projects, about, key skills, contact) and
// a page per case study (overview, process, problem, personas, competitive
// analysis, insight, information architecture, user flow, solution, style
// guide, outcome). Live sections from the dashboard (activity, milestones,
// how I work) sit between them. Links use data-case / data-home so the page
// that shows it decides how to switch views.
import { esc } from "../ui/dom.js";
import { safeUrl, projectProgress } from "../core/projects.js";
import { hasResume } from "./resume.js";

/** Is there a site to lay out? */
export function hasSite(site) {
  return !!site && typeof site === "object" && !!(site.hero?.name || site.hero?.role || site.hero?.description || site.cases?.length || site.about?.length);
}

const img = (src, alt, cls = "") => {
  const url = typeof src === "string" && (/^https?:\/\//i.test(src) || /^data:image\//i.test(src) || /^blob:/i.test(src)) ? src : null;
  return url ? `<img class="${cls}" src="${esc(url)}" alt="${esc(alt || "")}" loading="lazy">` : "";
};
const link = (href, label, cls = "pf-btn pf-btn--outline") => {
  const url = safeUrl(href) || (/^mailto:|^tel:/i.test(href || "") ? href : null);
  return url ? `<a class="${cls}" href="${esc(url)}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>` : "";
};
// "Try the app": opens in a phone frame on computers (phone.js) unless the
// case study turns that off.
const tryLink = (c, label, cls) => {
  const a = link(c.liveUrl, label, cls);
  return a && c.phone !== false ? a.replace("<a ", `<a data-try="${esc(c.title || "")}" `) : a;
};
const paras = (t) => String(t || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
const SOCIAL = { linkedin: "LinkedIn", behance: "Behance", dribbble: "Dribbble", instagram: "Instagram", github: "GitHub", website: "Website" };

// The dashboard project a case study belongs to (by name), for live progress.
function projectFor(c, projects) {
  const want = (c.project || c.title || "").toLowerCase();
  return (projects || []).find((p) => p.name && (want === p.name.toLowerCase() || (c.project && c.project === p.name)))
    || (projects || []).find((p) => p.name && want.startsWith(p.name.toLowerCase() + " "));
}

function caseCard(c, projects) {
  const shot = c.shots?.[0]?.src;
  const p = projectFor(c, projects);
  const prog = p ? projectProgress(p) : null;
  return `<article class="pf-card">
    <div class="pf-card__thumb${shot ? " has-img" : ""}">${shot ? img(shot, `${c.title} screen`) : `<span>${esc(c.thumbWord || c.title)}</span>`}</div>
    <div class="pf-card__body">
      ${c.tag ? `<p class="pf-card__tag">${esc(c.tag)}</p>` : ""}
      <h3>${esc(c.title)}</h3>
      ${c.cardDesc ? `<p class="pf-card__desc">${esc(c.cardDesc)}</p>` : ""}
      ${prog && prog.total ? `<div class="pf-card__prog"><div class="pf-bar"><i style="width:${prog.pct}%"></i></div><span>${prog.pct}% · live from my dashboard</span></div>` : ""}
      <div class="pf-card__cta">
        ${c.status === "progress" ? `<span class="pf-btn pf-btn--disabled">In progress</span>` : `<a class="pf-btn pf-btn--solid" href="#case=${esc(c.id)}" data-case="${esc(c.id)}">View case study</a>`}
        ${c.status !== "progress" ? tryLink(c, "Try the app &#8599;") : ""}
      </div>
    </div>
  </article>`;
}

// "Open to remote · relocation · Looking for: Senior Product Designer"
function openLine(h) {
  const open = [["remote", "remote"], ["hybrid", "hybrid"], ["relocation", "relocation"]].filter(([k]) => h.open?.[k]).map(([, l]) => l);
  const parts = [open.length ? `Open to ${open.join(" · ")}` : "", h.roles ? `Looking for: ${h.roles}` : ""].filter(Boolean);
  return parts.length ? `<p class="pf-s-open">${parts.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : "";
}

// The "broken level" strip: thin bars fading in, then a solid block. Decorative.
const BARS = `<div class="pf-bars" aria-hidden="true"></div>`;
/** The sections that have content, with the strip before each one. */
const withBars = (sections) => sections.filter(Boolean).map((x) => BARS + x).join("");

function home(data, live) {
  const s = data.site, h = s.hero || {}, name = h.name || data.about?.name || "";
  const social = Object.entries(s.social || {}).map(([k, v]) => link(v, esc(SOCIAL[k] || k), "pf-social")).filter(Boolean).join("");
  return `
  <section class="pf-s-hero" id="pf-top">
    <div class="pf-s-hero__text">
      ${h.eyebrow ? `<p class="pf-s-eyebrow">${esc(h.eyebrow)}</p>` : ""}
      <h1>${esc(name)}</h1>
      ${h.role || h.location ? `<p class="pf-s-role"><b>${esc(h.role || "")}</b>${h.location ? `${h.role ? "," : ""} based in ${esc(h.location)}` : ""}</p>` : ""}
      ${h.description ? `<p class="pf-s-desc">${esc(h.description)}</p>` : ""}
      ${openLine(h)}
      <div class="pf-s-actions">
        ${s.cases?.length ? `<a class="pf-btn pf-btn--solid" href="#pf-cases" data-scroll="pf-cases">View projects</a>` : ""}
        ${s.contact?.length ? `<a class="pf-btn pf-btn--outline" href="#pf-contact" data-scroll="pf-contact">Contact me</a>` : ""}
        ${hasResume(s) ? `<a class="pf-btn pf-btn--outline" href="#page=resume" data-resume>Resume</a>` : link(s.resume, "Resume")}
      </div>
      ${social ? `<nav class="pf-socials" aria-label="Social">${social}</nav>` : ""}
    </div>
    ${img(s.portrait, `Portrait of ${name}`, "pf-s-portrait")}
  </section>
  ${s.stats?.length ? `<div class="pf-s-stats">${s.stats.map((x) => `<div><b>${esc(x.num)}</b><span>${esc(x.label)}</span></div>`).join("")}</div>` : ""}
  ${withBars([
    live.highlights || "",
    s.cases?.length ? `<section class="pf-section" id="pf-cases"><h2>Featured projects</h2><div class="pf-cards">${s.cases.map((c) => caseCard(c, data.projects)).join("")}</div></section>` : "",
    live.experience || "",
    s.about?.length ? `<section class="pf-section" id="pf-about"><h2>About me</h2><div class="pf-s-about">${s.about.map((p) => `<p>${esc(p)}</p>`).join("")}</div></section>` : "",
    s.skills?.length ? `<section class="pf-section" id="pf-keyskills"><h2>Key skills</h2><div class="pf-s-skills">${s.skills.map((g) => `<div class="pf-s-skill"><h3>${esc(g.title)}</h3><ul>${(g.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div></section>` : "",
    live.work || "",
    live.activity || "",
    live.milestones || "",
    live.plan || "",
    s.contact?.length ? `<section class="pf-section" id="pf-contact"><h2>Contact me</h2><div class="pf-s-contact">${s.contact.map((c) => {
      const href = /^(mailto:|tel:)/i.test(c.href || "") ? c.href : safeUrl(c.href);
      return `<div><span>${esc(c.label)}</span>${href ? `<a href="${esc(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ""}>${esc(c.value)}</a>` : `<b>${esc(c.value)}</b>`}</div>`;
    }).join("")}</div></section>` : "",
  ])}`;
}

// A persona's photo in a circle, or their initials when there's none.
function personaPhoto(p) {
  const photo = img(p.photo, `Photo of ${p.name || "persona"}`, "pf-persona__photo");
  if (photo) return photo;
  const initials = String(p.name || "?").replace(/^the\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  return `<span class="pf-persona__photo pf-persona__initials" aria-hidden="true">${esc(initials)}</span>`;
}
// "32 · Female · Addis Ababa · Sales manager" (empty ones skipped).
function demography(p) {
  const bits = [p.age, p.sex, p.location, p.occupation].map((x) => String(x || "").trim()).filter(Boolean);
  return bits.length ? `<p class="pf-persona__demo">${bits.map(esc).join(" · ")}</p>` : "";
}

const MARK = { yes: "&#10003;", partial: "&#8776;", no: "&#8212;" };

function casePage(data, c) {
  const all = data.site.cases || [];
  const i = all.indexOf(c), next = all.slice(i + 1).concat(all.slice(0, i)).find((x) => x.status !== "progress" && x !== c);
  const p = projectFor(c, data.projects), prog = p ? projectProgress(p) : null;
  const block = (title, body, id = "") => body ? `${BARS}<section class="pf-case-block"${id ? ` id="${id}"` : ""}><h2>${esc(title)}</h2>${body}</section>` : "";
  const intro = (t) => (t ? `<p class="pf-intro">${esc(t)}</p>` : "");
  return `
  <article class="pf-case" id="pf-case-${esc(c.id)}">
    <a class="pf-back" href="#" data-home>&larr; Back to projects</a>
    ${c.pill ? `<p class="pf-pill">${esc(c.pill)}</p>` : ""}
    <h1 class="pf-case__title">${esc(c.title)}</h1>
    ${c.subtitle ? `<p class="pf-s-desc">${esc(c.subtitle)}</p>` : ""}
    ${c.shots?.length ? `<div class="pf-shots">${c.shots.map((s) => img(s.src, s.alt || c.title)).join("")}</div>` : ""}
    ${c.liveUrl ? `<p class="pf-center">${tryLink(c, "Try the live prototype &#8599;")}</p>` : ""}
    ${c.meta?.length ? `<dl class="pf-meta">${c.meta.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl>` : ""}
    ${prog && prog.total ? `<p class="pf-live-prog"><b>Live from my dashboard:</b> ${prog.pct}% done · ${prog.done} of ${prog.total} steps${p.stage ? ` · ${esc(p.stage)}` : ""}</p>` : ""}
    ${block("Overview", paras(c.overview))}
    ${block("Design process", c.process && (c.process.intro || c.process.steps?.length) ? `${paras(c.process.intro)}<ol class="pf-steps">${(c.process.steps || []).map((s, n) => `<li><span>${String(n + 1).padStart(2, "0")}</span>${esc(s)}</li>`).join("")}</ol>` : "")}
    ${block("Problem statement", paras(c.problem))}
    ${block("Who I designed for", c.personas?.items?.length ? `${intro(c.personas.intro)}<div class="pf-personas">${c.personas.items.map((p) => `<div class="pf-persona">
        <div class="pf-persona__head">${personaPhoto(p)}<div><h3>${esc(p.name)}</h3>${demography(p)}</div></div>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
        ${[["Needs", p.needs], ["Frustrations", p.frustrations], ["Goals", p.goals]].filter(([, v]) => v?.length).map(([l, v]) => `<div class="pf-persona__row"><span>${l}</span><div>${v.map((t) => `<em>${esc(t)}</em>`).join("")}</div></div>`).join("")}
      </div>`).join("")}</div>` : "")}
    ${block("Competitive analysis", c.competitive?.rows?.length ? `${intro(c.competitive.intro)}<div class="pf-table-wrap"><table class="pf-compare"><thead><tr>${(c.competitive.columns || []).map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${c.competitive.rows.map((r) => `<tr><td>${esc(r.feature)}</td>${(r.values || []).map((v) => `<td class="${esc(v)}" aria-label="${esc(v)}">${MARK[v] || esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "")}
    ${block("Key insight", c.insight ? `<blockquote class="pf-insight">${esc(c.insight)}</blockquote>` : "")}
    ${block("Information architecture", c.ia?.sections?.length ? `${intro(c.ia.intro)}<div class="pf-ia">${c.ia.root ? `<div class="pf-ia__root">${esc(c.ia.root)}</div>` : ""}<div class="pf-ia__sections">${c.ia.sections.map((s) => `<div><h3>${esc(s.title)}</h3><ul>${(s.items || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div></div>` : "")}
    ${block(c.flow?.title || "User flow", c.flow?.steps?.length ? `${intro(c.flow.intro)}<ol class="pf-flow">${c.flow.steps.map((s) => `<li>${img(s.src, s.label)}<span>${esc(s.label)}</span></li>`).join("")}</ol>` : "")}
    ${block("Solution", paras(c.solution))}
    ${block("UI style guide", c.style && (c.style.colors?.length || c.style.font) ? `${intro(c.style.intro)}
      ${c.style.colors?.length ? `<h3 class="pf-h3">Color palette</h3><div class="pf-swatches">${c.style.colors.map((x) => `<div><i style="background:${/^#[0-9a-f]{3,8}$/i.test(x.hex) ? x.hex : "transparent"}"></i><b>${esc(x.name)}</b><span>${esc(x.hex)}</span></div>`).join("")}</div>` : ""}
      ${c.style.font ? `<h3 class="pf-h3">Typography</h3><div class="pf-type"><b>${esc(c.style.sampleHead || c.style.font)}</b>${c.style.sampleBody ? `<p>${esc(c.style.sampleBody)}</p>` : ""}<span>${esc(c.style.font)}</span></div>` : ""}
      ${/^#[0-9a-f]{3,8}$/i.test(c.style.button || "") ? `<h3 class="pf-h3">Buttons</h3><div class="pf-s-actions"><span class="pf-btn pf-btn--solid" style="background:${c.style.button};border-color:${c.style.button}">Primary action</span><span class="pf-btn pf-btn--outline">Secondary action</span></div>` : ""}` : "")}
    ${block("Outcome", paras(c.outcome))}
    ${(c.extra || []).map((x) => block(x.title, paras(x.text))).join("")}
    <nav class="pf-case-nav">
      <a class="pf-btn pf-btn--outline" href="#" data-home>&larr; All projects</a>
      ${next ? `<a class="pf-btn pf-btn--solid" href="#case=${esc(next.id)}" data-case="${esc(next.id)}">Next: ${esc(next.title)} &rarr;</a>` : ""}
    </nav>
  </article>`;
}

/** The site: the home page, or a case study when view is its id. */
export function renderSite(data, live, view) {
  const c = view && (data.site.cases || []).find((x) => x.id === view && x.status !== "progress");
  return `<div class="pf pf--site">${c ? casePage(data, c) : home(data, live)}
    <footer class="pf-foot">Live from my work dashboard · updated ${esc(new Date(data.generated_at || Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))}</footer>
  </div>`;
}
