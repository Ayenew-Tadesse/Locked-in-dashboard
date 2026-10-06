// The portfolio laid out like your portfolio website (github.com/Ayenew-Tadesse/portfolio):
// a home page (hero, stats, featured projects, about, key skills, contact) and
// a page per case study (overview, process, problem, personas, competitive
// analysis, insight, information architecture, user flow, solution, style
// guide, outcome). Live sections from the dashboard (activity, milestones,
// how I work) sit between them. Links use data-case / data-home so the page
// that shows it decides how to switch views.
import { esc } from "../ui/dom.js";
import { safeUrl } from "../core/projects.js";
import { hasResume } from "./resume.js";

/** Is there a site to lay out? */
export function hasSite(site) {
  return !!site && typeof site === "object" && !!(site.hero?.name || site.hero?.role || site.hero?.description || site.cases?.length || site.about?.length);
}

const img = (src, alt, cls = "") => {
  const url = typeof src === "string" && (/^https?:\/\//i.test(src) || /^data:image\//i.test(src) || /^blob:/i.test(src)) ? src : null;
  return url ? `<img class="${cls}" src="${esc(url)}" alt="${esc(alt || "")}" loading="lazy">` : "";
};
/** What a case study's app runs on: "phone" (the default), "tablet", "computer" or "both" (phone and computer; older ones: phone: false). */
export const deviceOf = (c) => (["phone", "tablet", "computer", "both"].includes(c?.device) ? c.device : c?.phone === false ? "computer" : "phone");
/** What the card says the app runs on. */
export const DEVICE_LABELS = { phone: "Phone", tablet: "Tablet", computer: "Computer", both: "Phone and computer" };
/** Are the case study's screenshots phone screens? (Phone apps, and apps for phone and computer.) */
export const phoneShots = (c) => ["phone", "both"].includes(deviceOf(c));
/** A website's screenshot in a laptop frame (screen with bezel and camera, on a base). */
export const laptop = (html) => (html ? `<span class="pf-laptop"><span class="pf-laptop__screen">${html}</span></span>` : "");
/** A screenshot in a landscape tablet (even bezel, front camera). */
export const tablet = (html) => (html ? `<span class="pf-tablet"><span class="pf-tablet__screen">${html}</span></span>` : "");
/** How a case study's screenshots are framed: phones as they are; tablets and computers wide, in their device. */
export const screenFrame = (c) => ({ phone: String, both: String, tablet, computer: laptop })[deviceOf(c)];
const link = (href, label, cls = "pf-btn pf-btn--outline") => {
  const url = safeUrl(href) || (/^mailto:|^tel:/i.test(href || "") ? href : null);
  return url ? `<a class="${cls}" href="${esc(url)}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>` : "";
};
// "Try the app": opens in a phone frame on computers (phone.js) unless the
// case study turns that off.
const tryLink = (c, label, cls) => {
  const a = link(c.liveUrl, label, cls);
  const device = deviceOf(c);
  return a && device !== "computer" ? a.replace("<a ", `<a data-try="${esc(c.title || "")}" data-device="${device === "tablet" ? "tablet" : "phone"}" `) : a;
};
const paras = (t) => String(t || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
const SOCIAL = { linkedin: "LinkedIn", behance: "Behance", dribbble: "Dribbble", instagram: "Instagram", github: "GitHub", website: "Website" };
// Outline icons for the social links (24 × 24, drawn in the text colour).
const svg = (body) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const SOCIAL_ICONS = {
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>'),
  linkedin: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V17M8 7.2v.1M12 17v-3.8a2.2 2.2 0 0 1 4.4 0V17M12 10.5V17"/>'),
  behance: svg('<path d="M3 6.5h5a2.6 2.6 0 0 1 0 5.2H3zM3 11.7h5.6a2.9 2.9 0 0 1 0 5.8H3zM3 6.5v11"/><path d="M14.5 13.6h6.3a3.2 3.2 0 1 0-.9 2.5M15.2 7.5h4.6"/>'),
  github: svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  dribbble: svg('<circle cx="12" cy="12" r="9"/><path d="M19.1 6.6C15.5 9.4 9 10 3.3 9.6M8.6 3.7c3 3.6 6.2 10.6 7.2 16.5M3.4 13.9c5-1.6 11.6-1.5 17.4.5"/>'),
  website: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
};
// Contact cards: a filled icon (picked from the link or label), the label, the value.
// The whole card is the link (call, email, open the profile).
const filled = (d) => `<svg class="pf-cc__icon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
export const CONTACT_ICONS = {
  phone: filled("M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"),
  email: filled("M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm.8 2v.3l8.2 5.2 8.2-5.2V7l-8.2 5.1z"),
  linkedin: filled("M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3.3 7.2H5v8.3h2.3zM6.2 5.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm4.1 4.7v8.3h2.3v-4.3c0-1.2.4-2 1.5-2s1.4.9 1.4 2v4.3h2.3v-4.8c0-2.4-1.3-3.6-3.1-3.6-1.4 0-2 .7-2.3 1.2v-1.1z"),
  github: filled("M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"),
  behance: filled("M3 6h5.3c2 0 3.3 1 3.3 2.7 0 1.1-.6 1.9-1.6 2.2 1.3.3 2.1 1.3 2.1 2.6 0 2-1.6 3.5-4 3.5H3zm2.4 2v2.5h2.6c.9 0 1.4-.5 1.4-1.3S8.9 8 8 8zm0 4.4v2.6h2.9c1 0 1.6-.5 1.6-1.3s-.6-1.3-1.6-1.3zM15 7h5v1.3h-5zm2.6 2.3c2.3 0 3.6 1.6 3.4 4.2h-5.3c.1 1.2.8 1.9 1.9 1.9.8 0 1.4-.4 1.6-1h1.7c-.4 1.6-1.7 2.5-3.4 2.5-2.3 0-3.8-1.5-3.8-3.8s1.6-3.8 3.9-3.8zm-1.9 3h3.5c0-1-.7-1.6-1.7-1.6s-1.6.6-1.8 1.6z"),
  instagram: filled("M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm5.3-3.3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"),
  location: filled("M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"),
  web: filled("M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.7 2.2A8 8 0 0 0 4.1 11h3.4a15 15 0 0 1 2.8-6.8zm3.4 0A15 15 0 0 1 16.5 11h3.4a8 8 0 0 0-6.2-6.8zM12 4.6A13 13 0 0 0 9.5 11h5A13 13 0 0 0 12 4.6zM4.1 13a8 8 0 0 0 6.2 6.8A15 15 0 0 1 7.5 13zm5.4 0a13 13 0 0 0 2.5 6.4 13 13 0 0 0 2.5-6.4zm7 0a15 15 0 0 1-2.8 6.8 8 8 0 0 0 6.2-6.8z"),
  link: filled("M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM8.5 19a4.5 4.5 0 0 1-3.2-7.7l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a2.5 2.5 0 0 0 3.5 3.5l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1A4.5 4.5 0 0 1 8.5 19zm7.4-4.8a1 1 0 0 1-.7-1.7l2.1-2.1a2.5 2.5 0 0 0-3.5-3.5l-2.1 2.1a1 1 0 1 1-1.4-1.4l2.1-2.1a4.5 4.5 0 0 1 6.4 6.4l-2.1 2.1a1 1 0 0 1-.8.2z"),
};
/** Which icon a contact row gets, from its link, then its label. */
export function contactIcon(c) {
  const href = String(c.href || "").toLowerCase(), label = String(c.label || "").toLowerCase();
  if (href.startsWith("tel:") || /phone|mobile|call/.test(label)) return "phone";
  if (href.startsWith("mailto:") || /e-?mail/.test(label)) return "email";
  for (const k of ["linkedin", "github", "behance", "instagram"]) if (href.includes(k) || label.includes(k)) return k;
  if (/address|location|based|city/.test(label)) return "location";
  if (/^https?:/.test(href) || /website|portfolio|site/.test(label)) return "web";
  return "link";
}
function contactCard(c) {
  const href = /^(mailto:|tel:)/i.test(c.href || "") ? c.href : safeUrl(c.href);
  const inner = `${CONTACT_ICONS[contactIcon(c)]}<b class="pf-cc__label">${esc(c.label)}</b><span class="pf-cc__value">${esc(c.value)}</span>`;
  return href ? `<a class="pf-cc" data-icon="${contactIcon(c)}" href="${esc(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`
    : `<div class="pf-cc" data-icon="${contactIcon(c)}">${inner}</div>`;
}

// The featured projects row's arrows (see rail.js).
const chevron = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const CHEVRON_LEFT = chevron("M15 5l-7 7 7 7"), CHEVRON_RIGHT = chevron("M9 5l7 7-7 7");
// The resume button's icon: a page with a folded corner and four lines of text.
const RESUME_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.3 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.3z"/><path d="M14.3 2.5v3.6a1.2 1.2 0 0 0 1.2 1.2H19"/><path d="M8.6 11h6.8M8.6 13.3h6.8M8.6 15.6h6.8M8.6 17.9h4.6"/></svg>`;
const LINK_ICON = svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
/** The social links as icon buttons (the site's name is the label for screen readers and the tooltip). */
function socialIcons(s, about) {
  const links = { ...(s.social || {}) };
  if (!links.github && about?.links?.github) links.github = about.links.github;
  return Object.entries(links).map(([k, v]) => {
    const name = esc(SOCIAL[k] || k);
    return link(v, SOCIAL_ICONS[k] || LINK_ICON, "pf-social").replace("<a ", `<a aria-label="${name}" title="${name}" `);
  }).filter(Boolean).join("");
}


/** The card's chosen screens ([front, left, right]; a tablet or computer uses the first; phone and computer: [computer, phone]), or null when none are chosen. */
export function cardScreens(c) {
  const list = Array.isArray(c?.cardShots) ? c.cardShots.slice(0, 3).map((x) => (img(x) ? x : "")) : [];
  return list.some(Boolean) ? [0, 1, 2].map((i) => list[i] || "") : null;
}

// A screen without a picture yet: soft skeleton blocks (header, cards, button).
const placeholderScreen = (note) => `<span class="pf-screen-ph" aria-hidden="true"><i class="pf-screen-ph__head"></i><i></i><i></i><i class="pf-screen-ph__short"></i><b></b>${note ? `<em>${note}</em>` : ""}</span>`;
const widePlaceholder = (note) => `<span class="pf-screen-ph--wide">${placeholderScreen(note)}</span>`;
// One small phone on a card (status bar, then the screenshot or a placeholder).
export const miniPhone = (src, alt, attrs = "", note = "") => `<span class="pf-mini-phone"${attrs}><span class="pf-mini-phone__screen">
    <span class="pf-mini-phone__status" aria-hidden="true"><i>9:41</i><b></b><u></u></span>${src ? img(src, alt) : placeholderScreen(note)}</span></span>`;
const SLOT_NAMES = { phone: ["front", "left", "right"], both: ["computer", "phone"] };
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** The app's main button colour (its style guide), which tints the card behind its screens; "" uses the page's. */
export const cardTint = (c) => (HEX.test(String(c?.style?.button || "").trim()) ? String(c.style.button).trim() : "");

/**
 * A case study card's picture: the same realistic device frame on every card.
 * Phone apps: three phones, the front one in the middle. Tablet and computer
 * apps: one tablet or laptop. Phone and computer: a laptop with a phone in
 * front of it at the lower right. Screens are the ones you chose for the card
 * (cardShots), else the first screenshots; a screen without a picture shows
 * a placeholder, so a project you're still making already has its frame.
 * Behind the screens: a gradient of the app's main button colour (cardTint), else the page's.
 * opts.slots: mark each screen with data-slot (the editor taps them to choose).
 */
export function cardThumb(c, { tag = "div", slots = false } = {}) {
  const chosen = cardScreens(c);
  const shots = chosen || (c.shots || []).map((x) => x?.src).filter((src) => img(src)).slice(0, 3);
  const alt = (i) => (i ? "" : `${c.title || "App"} screen`);
  const device = deviceOf(c);
  const tint = cardTint(c) ? ` style="--pf-thumb:${cardTint(c)}"` : "";
  const slot = (i) => (slots ? ` data-slot="${i}" data-act="cardslot" data-path="${i}" role="button" tabindex="0" aria-label="Choose the ${SLOT_NAMES[device]?.[i] || "card's"} screen"` : "");
  if (device === "both") {
    const pc = laptop(shots[0] ? img(shots[0], alt(0)) : widePlaceholder("Screens coming soon"));
    return `<${tag}${tint} class="pf-card__thumb has-img has-frame pf-card__both"><span class="pf-card__frame"${slot(0)}>${pc}</span>${miniPhone(shots[1], alt(1), slot(1), "")}</${tag}>`;
  }
  if (device !== "phone") {
    const src = shots[0];
    const screen = src ? img(src, alt(0)) : widePlaceholder("Screens coming soon");
    return `<${tag}${tint} class="pf-card__thumb has-img has-frame"><span class="pf-card__frame"${slot(0)}>${screenFrame(c)(screen)}</span></${tag}>`;
  }
  // Without chosen screens, a project with one or two screenshots shows that many phones; otherwise three.
  const n = chosen || !shots.length ? 3 : shots.length;
  const phones = Array.from({ length: n }, (_, i) => miniPhone(shots[i], alt(i), slot(i), i === 0 ? "Screens coming soon" : ""));
  return `<${tag}${tint} class="pf-card__thumb has-img pf-card__phones pf-card__phones--${n}">${phones.join("")}</${tag}>`;
}

// No project status reaches the public page (progress, "In progress"): a case study
// that isn't live yet simply has no "View case study" button. Under the screens: the
// title, the type of app, the devices it runs on, then the description (two lines at most).
function caseCard(c) {
  const cta = c.status === "progress" ? tryLink(c, "Try the app &#8599;")
    : `<a class="pf-btn pf-btn--solid" href="#case=${esc(c.id)}" data-case="${esc(c.id)}">View case study</a>${tryLink(c, "Try the app &#8599;")}`;
  return `<article class="pf-card">
    ${cardThumb(c)}
    <div class="pf-card__body">
      <h3>${esc(c.title)}</h3>
      ${c.tag ? `<p class="pf-card__tag">${esc(c.tag)}</p>` : ""}
      <p class="pf-card__devices">${DEVICE_LABELS[deviceOf(c)]}</p>
      ${c.cardDesc ? `<p class="pf-card__desc">${esc(c.cardDesc)}</p>` : ""}
      ${cta ? `<div class="pf-card__cta">${cta}</div>` : ""}
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

/** What shows next to your introduction: "illustration" (the default), "photo" or "none". */
export const pictureOf = (s) => (["illustration", "photo", "none"].includes(s?.picture) ? s.picture : "illustration");

/**
 * A product-designer scene (no person): a phone and a tablet showing app
 * screens, with colour swatches, a type sample, a pen tool and a cursor.
 * Drawn in the page's own colours, so it follows light and dark themes.
 */
export const ILLUSTRATION = `<svg class="pf-ill pf-s-portrait" viewBox="0 0 480 440" role="img" aria-label="Illustration: app screens on a phone and a tablet, with design tools">
  <circle class="bg" cx="250" cy="225" r="192"/>
  <g class="card" transform="rotate(-6 175 195)">
    <rect class="fr" x="40" y="100" width="270" height="190" rx="18"/>
    <rect class="sf" x="52" y="112" width="246" height="166" rx="8"/>
    <path class="nv" d="M60 112h230a8 8 0 0 1 8 8v20H52v-20a8 8 0 0 1 8-8z"/>
    <circle class="sf" cx="68" cy="126" r="5"/><rect class="sf o" x="80" y="123" width="56" height="6" rx="3"/>
    <rect class="s2" x="64" y="150" width="124" height="116" rx="8"/>
    <rect class="ln" x="74" y="160" width="60" height="6" rx="3"/>
    ${[48, 70, 38, 86, 60, 76].map((h, i) => `<rect class="ac" x="${76 + i * 18}" y="${256 - h}" width="10" height="${h}" rx="3"/>`).join("")}
    <rect class="s2" x="198" y="150" width="88" height="52" rx="8"/>
    <rect class="ln" x="208" y="160" width="40" height="6" rx="3"/><rect class="tx" x="208" y="174" width="56" height="12" rx="4"/>
    <rect class="s2" x="198" y="212" width="88" height="54" rx="8"/>
    <circle class="gd" cx="216" cy="230" r="9"/><rect class="ln" x="232" y="226" width="44" height="6" rx="3"/><rect class="ln" x="208" y="248" width="66" height="6" rx="3"/>
  </g>
  <g class="card" transform="rotate(5 345 270)">
    <rect class="fr" x="270" y="118" width="150" height="304" rx="26"/>
    <rect class="sf" x="280" y="128" width="130" height="284" rx="18"/>
    <rect class="fr" x="325" y="136" width="40" height="8" rx="4"/>
    <rect class="as" x="290" y="156" width="110" height="50" rx="10"/>
    <rect class="ac" x="300" y="168" width="54" height="7" rx="3.5"/><rect class="ln" x="300" y="184" width="80" height="6" rx="3"/>
    <rect class="s2" x="290" y="216" width="110" height="40" rx="8"/>
    <circle class="ac" cx="306" cy="236" r="8"/><rect class="ln" x="320" y="228" width="60" height="6" rx="3"/><rect class="ln" x="320" y="240" width="40" height="6" rx="3"/>
    <rect class="s2" x="290" y="264" width="110" height="40" rx="8"/>
    <circle class="nv" cx="306" cy="284" r="8"/><rect class="ln" x="320" y="276" width="56" height="6" rx="3"/><rect class="ln" x="320" y="288" width="34" height="6" rx="3"/>
    <rect class="s2" x="290" y="312" width="110" height="34" rx="8"/>
    <rect class="nv" x="290" y="364" width="110" height="32" rx="8"/><rect class="sf" x="322" y="377" width="46" height="6" rx="3"/>
  </g>
  <g class="card"><rect class="sf st" x="358" y="36" width="104" height="48" rx="12"/>
    <circle class="ac" cx="382" cy="60" r="11"/><circle class="nv" cx="410" cy="60" r="11"/><circle class="gd" cx="438" cy="60" r="11"/></g>
  <g class="card"><rect class="sf st" x="22" y="34" width="84" height="64" rx="12"/>
    <text class="tx" x="64" y="78" text-anchor="middle" font-size="30" font-family="inherit">Aa</text></g>
  <g class="card"><rect class="sf st" x="40" y="318" width="168" height="76" rx="12"/>
    <path class="pen" d="M60 376 C 90 320, 130 392, 188 340"/>
    <rect class="sf pt" x="55" y="371" width="10" height="10" rx="2"/><rect class="sf pt" x="183" y="335" width="10" height="10" rx="2"/>
    <circle class="ac" cx="90" cy="338" r="4"/><circle class="ac" cx="150" cy="384" r="4"/>
    <path class="hl" d="M90 338 L124 357 L150 384"/></g>
  <path class="cur" d="M246 300 l0 34 l9 -9 l7 15 l7 -3 l-7 -15 l12 0 z"/>
  <circle class="ac o" cx="448" cy="170" r="6"/><circle class="nv o" cx="30" cy="250" r="5"/><circle class="ac o" cx="232" cy="28" r="4"/>
</svg>`;

/** The picture beside your introduction: the illustration, your photo, or nothing. */
export function heroPicture(s, name) {
  const pick = pictureOf(s);
  if (pick === "illustration") return ILLUSTRATION;
  return pick === "photo" ? img(s.portrait, `Portrait of ${name}`, "pf-s-portrait") : "";
}

function home(data, live) {
  const s = data.site, h = s.hero || {}, name = h.name || data.about?.name || "";
  const icons = socialIcons(s, data.about), portrait = heroPicture(s, name);
  const social = icons ? `<nav class="pf-socials" aria-label="Social">${icons}</nav>` : "";
  const resumeCls = "pf-btn pf-btn--outline pf-resume-btn"; // fills like Download PDF on hover
  const resume = hasResume(s) ? `<a class="${resumeCls}" href="#page=resume" data-resume>${RESUME_ICON}<span>Resume</span></a>` : link(s.resume, `${RESUME_ICON}<span>Resume</span>`, resumeCls);
  return `
  ${resume ? `<div class="pf-s-top">${resume}</div>` : ""}
  <section class="pf-s-hero" id="pf-top">
    <div class="pf-s-hero__text">
      ${h.eyebrow ? `<p class="pf-s-eyebrow">${esc(h.eyebrow)}</p>` : ""}
      <h1>${esc(name)}</h1>
      ${h.role || h.location ? `<p class="pf-s-role"><b>${esc(h.role || "")}</b>${h.location ? `${h.role ? "," : ""} based in ${esc(h.location)}` : ""}</p>` : ""}
      ${h.description ? `<p class="pf-s-desc">${esc(h.description)}</p>` : ""}
      ${openLine(h)}
      ${portrait ? "" : social}
    </div>
    ${portrait ? `<div class="pf-s-figure">${portrait}${social}</div>` : ""}
  </section>
  ${s.stats?.length ? `<div class="pf-s-stats">${s.stats.map((x, i) => `<div${i === Math.floor((s.stats.length - 1) / 2) ? ' class="is-hi"' : ""}><b>${esc(x.num)}</b><span>${esc(x.label)}</span></div>`).join("")}</div>` : ""}
  ${withBars([
    live.highlights || "",
    s.cases?.length ? `<section class="pf-section pf-rail-wrap" id="pf-cases">
      <div class="pf-rail-head"><h2>Featured projects</h2>
        <div class="pf-rail-nav" hidden>
          <button type="button" class="pf-rail-btn" data-rail="prev" aria-label="Previous project">${CHEVRON_LEFT}</button>
          <button type="button" class="pf-rail-btn" data-rail="next" aria-label="Next project">${CHEVRON_RIGHT}</button>
        </div></div>
      <div class="pf-rail" role="list" aria-label="Featured projects">${s.cases.map((c) => `<div class="pf-rail__item" role="listitem">${caseCard(c)}</div>`).join("")}</div>
      <div class="pf-rail-dots" hidden></div>
    </section>` : "",
    live.experience || "",
    s.about?.length ? `<section class="pf-section" id="pf-about"><h2>About me</h2><div class="pf-s-about">${s.about.map((p) => `<p>${esc(p)}</p>`).join("")}</div></section>` : "",
    s.skills?.length ? `<section class="pf-section" id="pf-keyskills"><h2>Key skills</h2><div class="pf-s-skills">${s.skills.map((g) => `<div class="pf-s-skill"><h3>${esc(g.title)}</h3><ul>${(g.items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div></section>` : "",
    live.work || "",
    live.activity || "",
    live.milestones || "",
    live.plan || "",
    s.contact?.length ? `<section class="pf-section" id="pf-contact"><h2>Contact me</h2><div class="pf-s-contact">${s.contact.map(contactCard).join("")}</div></section>` : "",
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

/**
 * The screenshots at the top of a case study. Phone apps: a row of phones.
 * Tablets and computers: a slider (in a line, arrows, dots, swipe; slider.js)
 * when there are two or more, else the one screenshot large.
 */
function shotsHtml(c) {
  const list = (c.shots || []).map((s) => screenFrame(c)(img(s.src, s.alt || c.title))).filter(Boolean);
  if (!list.length) return "";
  if (phoneShots(c)) return `<div class="pf-shots">${list.join("")}</div>`;
  if (list.length < 2) return `<div class="pf-shots pf-shots--wide">${list[0]}</div>`;
  return `<div class="pf-slider" data-slider>
      <div class="pf-slider__track" tabindex="0" role="region" aria-label="Screenshots of ${esc(c.title || "the app")} (${list.length})">
        ${list.map((h, i) => `<div class="pf-slider__item" aria-label="${i + 1} of ${list.length}">${h}</div>`).join("")}
      </div>
      <button type="button" class="pf-slider__btn pf-slider__btn--prev" data-slide="-1" aria-label="Previous screenshot" disabled>&#8249;</button>
      <button type="button" class="pf-slider__btn pf-slider__btn--next" data-slide="1" aria-label="Next screenshot">&#8250;</button>
      <div class="pf-slider__dots">${list.map((_, i) => `<button type="button" data-slide-to="${i}" aria-label="Screenshot ${i + 1}"${i ? "" : ' aria-current="true"'}></button>`).join("")}</div>
    </div>`;
}

function casePage(data, c) {
  const all = data.site.cases || [];
  const i = all.indexOf(c), next = all.slice(i + 1).concat(all.slice(0, i)).find((x) => x.status !== "progress" && x !== c);
  const block = (title, body, id = "") => body ? `<section class="pf-case-block"${id ? ` id="${id}"` : ""}><h2>${esc(title)}</h2>${body}</section>` : "";
  const intro = (t) => (t ? `<p class="pf-intro">${esc(t)}</p>` : "");
  return `
  <article class="pf-case" id="pf-case-${esc(c.id)}">
    <a class="pf-back" href="#" data-home>&larr; Back to projects</a>
    ${c.pill ? `<p class="pf-pill">${esc(c.pill)}</p>` : ""}
    <h1 class="pf-case__title">${esc(c.title)}</h1>
    ${c.subtitle ? `<p class="pf-s-desc">${esc(c.subtitle)}</p>` : ""}
    ${shotsHtml(c)}
    ${c.liveUrl ? `<p class="pf-center">${tryLink(c, "Try the live prototype &#8599;")}</p>` : ""}
    ${c.meta?.length ? `<dl class="pf-meta">${c.meta.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl>` : ""}
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
    ${block(c.flow?.title || "User flow", c.flow?.steps?.length ? `${intro(c.flow.intro)}<ol class="pf-flow${phoneShots(c) ? "" : " pf-flow--wide"}">${c.flow.steps.map((s) => `<li>${screenFrame(c)(img(s.src, s.label))}<span>${esc(s.label)}</span></li>`).join("")}</ol>` : "")}
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
    <footer class="pf-foot pf-foot--band">&copy; ${new Date().getFullYear()} ${esc(data.site.hero?.name || data.about?.name || "")}. All rights reserved.</footer>
  </div>`;
}
