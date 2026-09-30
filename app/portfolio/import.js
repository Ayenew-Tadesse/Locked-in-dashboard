// Reads a portfolio website built like github.com/Ayenew-Tadesse/portfolio
// (hero, stats, featured projects, about, key skills, contact, and one page
// per case study) and turns it into the dashboard's portfolio "site" data.
// Images arrive as they are in the page (data: URIs); uploadSiteImages then
// moves them into storage so the saved data stays small.

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const all = (root, sel) => (root ? [...root.querySelectorAll(sel)] : []);

/** The raw index.html of a GitHub repository ("owner/name", default branch). */
export async function fetchGitHubPortfolio(repo, fetchImpl = fetch) {
  const clean = String(repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) throw new Error("Use the repository as owner/name, e.g. Ayenew-Tadesse/portfolio.");
  for (const branch of ["main", "master"]) {
    const res = await fetchImpl(`https://raw.githubusercontent.com/${clean}/${branch}/index.html`);
    if (res.ok) return res.text();
  }
  throw new Error(`Couldn't find index.html in ${clean} (is the repository public?)`);
}

/** Parses the portfolio HTML into { hero, portrait, social, resume, stats, about, skills, contact, cases }. */
export function parsePortfolioHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const role = doc.querySelector(".hero__role");
  const roleStrong = text(role?.querySelector("strong")).replace(/,$/, "");
  const location = (text(role).match(/based in (.+)$/i) || [])[1] || "";
  const site = {
    hero: {
      eyebrow: text(doc.querySelector(".hero__eyebrow")),
      name: text(doc.querySelector(".hero__name")),
      role: roleStrong || text(role),
      location,
      description: text(doc.querySelector(".hero__desc")),
    },
    portrait: doc.querySelector(".hero__portrait img")?.getAttribute("src") || "",
    social: Object.fromEntries(all(doc, ".social-row a").map((a) => [(a.getAttribute("aria-label") || "").toLowerCase(), a.getAttribute("href") || ""]).filter(([k, v]) => k && v)),
    resume: doc.querySelector(".nav__cta")?.getAttribute("href") || "",
    stats: all(doc, ".stats__item").map((s) => ({ num: text(s.querySelector(".stats__num")), label: text(s.querySelector(".stats__label")) })).filter((s) => s.num || s.label),
    about: all(doc, "#about .about__text p, #about p").map(text).filter(Boolean),
    skills: all(doc, ".skill-card").map((c) => ({ title: text(c.querySelector("h3")), items: all(c, "li").map(text).filter(Boolean) })).filter((g) => g.title || g.items.length),
    contact: all(doc, ".contact-card").map((c) => {
      const a = c.querySelector("a");
      return { label: text(c.querySelector("h4")), value: text(a), href: a?.getAttribute("href") || "" };
    }).filter((c) => c.value),
    cases: [],
  };
  site.about = [...new Set(site.about)];

  for (const card of all(doc, ".project-card")) {
    const caseLink = card.querySelector("[data-case]");
    const id = caseLink?.getAttribute("data-case") || text(card.querySelector(".project-card__title")).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const live = [...card.querySelectorAll("a[target=_blank]")].map((a) => a.getAttribute("href")).find(Boolean) || "";
    const c = {
      id, title: text(card.querySelector(".project-card__title")), tag: text(card.querySelector(".project-card__tag")),
      cardDesc: text(card.querySelector(".project-card__desc")), liveUrl: live,
      status: card.querySelector(".btn--disabled") ? "progress" : "live",
      thumbWord: text(card.querySelector(".thumb-word")),
    };
    const page = doc.getElementById(`page-${id}`);
    if (page) Object.assign(c, parseCasePage(page));
    site.cases.push(c);
  }
  return site;
}

function parseCasePage(page) {
  const hero = page.querySelector(".case-hero");
  const c = {
    pill: text(page.querySelector(".status-pill")),
    subtitle: text(hero?.querySelector(".hero__desc")),
    shots: all(hero, ".case-hero-shots img").map((i) => ({ src: i.getAttribute("src") || "", alt: i.getAttribute("alt") || "" })).filter((s) => s.src),
    meta: all(page, ".meta-item").map((m) => ({ label: text(m.querySelector(".meta-item__label")), value: text(m.querySelector(".meta-item__value")) })).filter((m) => m.label),
    extra: [],
  };
  const title = text(page.querySelector(".case-hero__title"));
  if (title) c.title = title;
  const live = hero && [...hero.querySelectorAll("a[target=_blank]")].map((a) => a.getAttribute("href")).find(Boolean);
  if (live) c.liveUrl = live;
  for (const block of all(page, ".case-block")) {
    const h = text(block.querySelector("h2"));
    const intro = text(block.querySelector(".section-intro"));
    const para = all(block, ":scope > p:not(.section-intro)").map(text).filter(Boolean).join("\n\n");
    const key = h.toLowerCase();
    if (key === "overview") c.overview = para;
    else if (key.startsWith("design process")) c.process = { intro: para || intro, steps: all(block, ".process-step__label").map(text) };
    else if (key.startsWith("problem")) c.problem = para;
    else if (key.startsWith("who i designed")) {
      c.personas = { intro, items: all(block, ".persona-card").map((p) => {
        const rows = Object.fromEntries(all(p, ".persona-row").map((r) => [text(r.querySelector(".persona-label")).toLowerCase(), all(r, ".persona-tag").map(text)]));
        return { name: text(p.querySelector("h4")), summary: text(p.querySelector(".persona-card__top p")), needs: rows.needs || [], frustrations: rows.frustrations || [], goals: rows.goals || [] };
      }) };
    } else if (key.startsWith("competitive")) {
      const table = block.querySelector("table");
      c.competitive = {
        intro,
        columns: all(table, "thead th").map(text),
        rows: all(table, "tbody tr").map((tr) => {
          const cells = all(tr, "td");
          return { feature: text(cells[0]), values: cells.slice(1).map((td) => (td.classList.contains("yes") ? "yes" : td.classList.contains("partial") ? "partial" : "no")) };
        }),
      };
    } else if (key.startsWith("key insight")) c.insight = para;
    else if (key.startsWith("information architecture")) {
      c.ia = { intro, root: text(block.querySelector(".ia-root")), sections: all(block, ".ia-section").map((s) => ({ title: text(s.querySelector("h5")), items: all(s, "li").map(text) })) };
    } else if (key.startsWith("user flow")) {
      c.flow = { title: h, intro, steps: all(block, ".flow-step").map((s) => ({ label: text(s.querySelector("span")), src: s.querySelector("img")?.getAttribute("src") || "" })) };
    } else if (key === "solution") c.solution = para;
    else if (key.startsWith("ui style guide")) {
      const head = block.querySelector(".sg-type-sample .head");
      c.style = {
        intro,
        colors: all(block, ".sg-swatch").map((s) => ({ name: text(s.querySelector(".sg-swatch__label")), hex: text(s.querySelector(".sg-swatch__hex")) })).filter((x) => /^#[0-9a-f]{3,8}$/i.test(x.hex)),
        font: ((head?.getAttribute("style") || "").match(/font-family:\s*'?([^',;]+)/i) || [])[1] || "",
        sampleHead: text(head), sampleBody: text(block.querySelector(".sg-type-sample .body")),
        button: ((block.querySelector(".sg-buttons .btn--solid")?.getAttribute("style") || "").match(/background:\s*(#[0-9a-f]{3,8})/i) || [])[1] || "",
      };
    } else if (key === "outcome") c.outcome = para;
    else if (h) c.extra.push({ title: h, text: [intro, para].filter(Boolean).join("\n\n") });
  }
  return c;
}

const dataUri = (s) => typeof s === "string" && s.startsWith("data:image/");

/** Every image in the site that is still a data: URI, as [object, key] pairs to replace. */
function imageSlots(site) {
  const slots = [];
  if (dataUri(site.portrait)) slots.push([site, "portrait", "portrait"]);
  for (const c of site.cases || []) {
    (c.shots || []).forEach((s, i) => dataUri(s.src) && slots.push([s, "src", `${c.id}-shot-${i + 1}`]));
    (c.flow?.steps || []).forEach((s, i) => dataUri(s.src) && slots.push([s, "src", `${c.id}-flow-${i + 1}`]));
  }
  return slots;
}

export function dataUriToBlob(uri) {
  const [head, body] = uri.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/png";
  const bin = /;base64/.test(head) ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Uploads the site's embedded images with upload(blob, name) → url, replacing them in place. */
export async function uploadSiteImages(site, upload, onProgress = () => {}) {
  const slots = imageSlots(site);
  let done = 0;
  for (const [obj, key, name] of slots) {
    const blob = dataUriToBlob(obj[key]);
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
    obj[key] = await upload(blob, `${name}.${ext}`);
    onProgress(++done, slots.length);
  }
  return site;
}
