// Draws the portfolio (the summary from public.portfolio_view, or from
// buildPortfolioData for the owner's preview) as HTML. Shared by the
// hiring-manager page (portfolio.html) and the owner's Portfolio page.
import { esc } from "../ui/dom.js";
import { addDays, formatDay, formatMinutes } from "../core/dates.js";
import { projectProgress, safeUrl, LINK_LABELS } from "../core/projects.js";
import { activityStats, PORTFOLIO_LINKS } from "../core/portfolio.js";
import { hasSite, renderSite } from "./site.js";
import { hasResume, renderResumePage } from "./resume.js";
import { yearConfig, quarterOfGoal } from "../core/quarters.js";

const STATUS = { not_started: "Not started", in_progress: "In progress", completed: "Completed", on_hold: "On hold" };
const PROJECT_STATE = { good: "On track", warn: "Needs attention", idle: "Not started" };

function contactLinks(links = {}, resume = false) {
  const out = PORTFOLIO_LINKS.map(([k, label]) => {
    const v = (links[k] || "").trim();
    if (!v) return "";
    const href = k === "email" ? (/^[^@\s]+@[^@\s]+$/.test(v) ? `mailto:${v}` : null) : safeUrl(v);
    return href ? `<a class="pf-contact" href="${esc(href)}"${k === "email" ? "" : ' target="_blank" rel="noopener"'}>${esc(label)}</a>` : "";
  }).filter(Boolean);
  if (resume) out.push(`<a class="pf-contact" href="#page=resume" data-resume>Resume</a>`);
  return out.length ? `<nav class="pf-contacts" aria-label="Contact">${out.join("")}</nav>` : "";
}

function heatmap(activity) {
  const today = activity.today;
  const count = new Map((activity.days || []).map((d) => [d.date, d.done]));
  // 26 columns (weeks) x 7 rows (Mon..Sun), ending with this week.
  const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;
  const start = addDays(today, -(25 * 7 + dow));
  const cells = [];
  for (let i = 0; i < 26 * 7; i++) {
    const d = addDays(start, i);
    if (d > today) { cells.push(`<i class="pf-cell future"></i>`); continue; }
    const n = count.get(d) || 0;
    const level = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
    cells.push(`<i class="pf-cell l${level}" title="${esc(formatDay(d, { weekday: "short", month: "short", day: "numeric" }))}: ${n} task${n === 1 ? "" : "s"} finished"></i>`);
  }
  return `<div class="pf-heat-wrap"><div class="pf-heat" role="img" aria-label="Tasks finished per day over the last 6 months">${cells.join("")}</div>
    <div class="pf-heat-legend"><span>${esc(formatDay(start, { month: "short", year: "numeric" }))}</span><span class="pf-heat-scale">Less <i class="pf-cell l0"></i><i class="pf-cell l1"></i><i class="pf-cell l2"></i><i class="pf-cell l3"></i><i class="pf-cell l4"></i> More</span><span>Today</span></div></div>`;
}

function stat(value, label) { return `<div class="pf-stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`; }

function projectCard(p) {
  const prog = projectProgress(p);
  const links = Object.entries(p.links || {}).map(([k, u]) => safeUrl(u) ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(LINK_LABELS[k] || k)}</a>` : "").filter(Boolean).join("");
  return `<article class="pf-project">
    <header><h3>${esc(p.name)}</h3>${p.stage ? `<span class="pf-tag">${esc(p.stage)}</span>` : ""}</header>
    ${p.description ? `<p>${esc(p.description)}</p>` : ""}
    <div class="pf-bar" role="img" aria-label="${prog.pct}% complete"><i style="width:${prog.pct}%"></i></div>
    <div class="pf-row"><span>${prog.total ? `${prog.pct}% · ${prog.done} of ${prog.total} steps done` : esc(PROJECT_STATE[p.status] || "")}</span>${links ? `<span class="pf-links">${links}</span>` : ""}</div>
  </article>`;
}

/** The whole portfolio as HTML. opts.view: a case study's id to show that case study. */
export function renderPortfolio(data, opts = {}) {
  const a = data.about || {};
  const act = data.activity;
  const projects = data.projects || [];
  const ongoing = projects.filter((p) => projectProgress(p).pct < 100);
  const finished = projects.filter((p) => projectProgress(p).total && projectProgress(p).pct >= 100);
  const ms = data.milestones || [];
  const msDone = ms.filter((m) => m.status === "completed");
  const msOpen = ms.filter((m) => m.status !== "completed");
  const d = a.details || {};
  const sections = {};
  const tags = (items) => `<ul class="pf-tags">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;

  if (d.highlights?.length) {
    sections.highlights = `<section class="pf-section" id="pf-highlights"><h2>Highlights</h2>
      <ul class="pf-highlights">${d.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></section>`;
  }
  if (d.experience?.length) {
    sections.experience = `<section class="pf-section" id="pf-experience"><h2>Experience</h2>
      <ol class="pf-timeline">${d.experience.map((e) => `<li>
        <div class="pf-when">${esc([e.from, e.to].filter(Boolean).join(" – "))}</div>
        <div><b>${esc(e.role)}</b>${e.company ? `<span class="pf-at"> · ${esc(e.company)}</span>` : ""}${e.summary ? `<p>${esc(e.summary)}</p>` : ""}</div>
      </li>`).join("")}</ol></section>`;
  }
  if (d.skills?.length || d.tools?.length) {
    sections.skills = `<section class="pf-section" id="pf-skills"><h2>Skills &amp; tools</h2>
      ${d.skills?.length ? `<h3 class="pf-h3">Skills</h3>${tags(d.skills)}` : ""}
      ${d.tools?.length ? `<h3 class="pf-h3">Tools</h3>${tags(d.tools)}` : ""}
</section>`;
  }

  if (act) {
    const s = activityStats(act);
    const weeks = act.weeks || [];
    sections.activity = (`<section class="pf-section" id="pf-activity"><h2>Activity</h2>
      <div class="pf-act"><div class="pf-stats">
        ${stat(act.completed_total, "tasks finished")}
        ${stat(act.completed_30, "in the last 30 days")}
        ${stat(s.activeDays90, "active days (90)")}
        ${stat(s.streak ? `${s.streak} day${s.streak === 1 ? "" : "s"}` : "—", "current streak")}
        ${act.minutes_total ? stat(formatMinutes(act.minutes_total), "logged") : ""}
      </div>
      ${heatmap(act)}</div>
      ${weeks.length ? `<div class="pf-weeks" aria-label="Weekly score, last ${weeks.length} weeks">${weeks.map((w) => `<span title="Week of ${esc(formatDay(w.week_start, { month: "short", day: "numeric" }))}: ${Math.round(w.score)}/100"><i style="height:${Math.max(4, Math.round(w.score))}%"></i></span>`).join("")}</div>
        <p class="pf-note">Weekly score (0–100): tasks finished on time, time logged and consistency.</p>` : ""}
    </section>`);
  }
  if (data.projects) {
    sections.projects = (`<section class="pf-section" id="pf-projects"><h2>Ongoing projects</h2>
      ${ongoing.length ? `<div class="pf-grid">${ongoing.map(projectCard).join("")}</div>` : `<p class="pf-empty">No ongoing projects right now.</p>`}
      ${finished.length ? `<h2 class="pf-sub">Projects completed</h2><div class="pf-grid">${finished.map(projectCard).join("")}</div>` : ""}
    </section>`);
  }
  if (data.milestones && ms.length) {
    const item = (m) => `<li><div><b>${esc(m.title)}</b>${m.description ? `<p>${esc(m.description)}</p>` : ""}</div>
      <span class="pf-ms-meta">${m.status === "completed" ? `Completed${m.completed_at ? " " + esc(formatDay(String(m.completed_at).slice(0, 10), { month: "short", day: "numeric", year: "numeric" })) : ""}`
        : `${m.pct}%${m.deadline ? " · due " + esc(formatDay(m.deadline, { month: "short", day: "numeric", year: "numeric" })) : ""}`}</span></li>`;
    sections.milestones = (`<section class="pf-section" id="pf-milestones"><h2>Milestones</h2>
      ${msOpen.length ? `<h3 class="pf-h3">In progress</h3><ul class="pf-ms">${msOpen.map(item).join("")}</ul>` : ""}
      ${msDone.length ? `<h3 class="pf-h3">Achieved</h3><ul class="pf-ms done">${msDone.map(item).join("")}</ul>` : ""}
    </section>`);
  }
  const planYear = yearConfig(data.site?.year);
  if (data.plan && data.plan.length) {
    sections.plan = (`<section class="pf-section" id="pf-plan"><h2>The plan</h2>
      <ol class="pf-plan">${data.plan.map((g) => `<li><span class="pf-q">${esc(quarterOfGoal(g, planYear).long)}</span><b>${esc(g.title)}</b>
        <div class="pf-bar"><i style="width:${g.pct}%"></i></div><span class="pf-plan-meta">${esc(STATUS[g.status] || "")} · ${g.pct}%</span></li>`).join("")}</ol>
    </section>`);
  }
  const hasProcess = d.process?.length || d.methods?.length;
  if (data.work?.length || a.approach || hasProcess) {
    sections.work = (`<section class="pf-section" id="pf-work"><h2>How I work</h2>
      ${a.approach ? `<p class="pf-approach">${esc(a.approach)}</p>` : ""}
      ${d.process?.length ? `<ol class="pf-process" id="pf-process">${d.process.map((p, i) => `<li><span>${i + 1}</span>${esc(p)}</li>`).join("")}</ol>` : ""}
      ${d.methods?.length ? `<h3 class="pf-h3">Research methods</h3>${tags(d.methods)}` : ""}
      ${data.work?.length ? `<p class="pf-note">Recent finished work, in my own words: what changed, how, and the problem it solved.</p>
        <div class="pf-work">${data.work.map((w) => `<article>
          <header><h3>${esc(w.title)}</h3><span>${esc(formatDay(w.day, { month: "short", day: "numeric", year: "numeric" }))}${w.milestone ? ` · ${esc(w.milestone)}` : w.category ? ` · ${esc(w.category)}` : ""}${w.minutes ? ` · ${esc(formatMinutes(w.minutes))}` : ""}</span></header>
          <dl>${w.changed ? `<dt>What changed</dt><dd>${esc(w.changed)}</dd>` : ""}${w.how ? `<dt>How</dt><dd>${esc(w.how)}</dd>` : ""}${w.solved ? `<dt>Problem solved</dt><dd>${esc(w.solved)}</dd>` : ""}</dl>
        </article>`).join("")}</div>` : ""}
    </section>`);
  }

  // Laid out like your portfolio website when you've set one up (or imported it).
  if (opts.view === "resume" && hasResume(data.site)) return renderResumePage(data.site.cv);
  if (hasSite(data.site)) return renderSite(data, sections, opts.view);

  const headline = a.headline || [d.title, d.years ? `${d.years} years of experience` : ""].filter(Boolean).join(" · ");
  const open = Object.entries(d.open || {}).filter(([, v]) => v).map(([k]) => ({ remote: "remote", hybrid: "hybrid", relocation: "relocation" })[k]);
  const facts = [a.headline && d.title ? d.title : null, a.headline && d.years ? `${d.years} years` : null, d.location || null,
    open.length ? `Open to ${open.join(", ").replace(/, ([^,]*)$/, " or $1")}` : null].filter(Boolean);
  // Highlights and experience first: what hiring managers look for.
  const order = ["highlights", "experience", "projects", "work", "skills", "activity", "milestones", "plan"];
  return `<div class="pf">
    <header class="pf-hero">
      <p class="pf-eyebrow">Portfolio</p>
      <h1>${esc(a.name || "Portfolio")}</h1>
      ${headline ? `<p class="pf-headline">${esc(headline)}</p>` : ""}
      ${facts.length ? `<p class="pf-facts">${facts.map(esc).join(" · ")}</p>` : ""}
      ${d.roles ? `<p class="pf-facts">Looking for: ${esc(d.roles)}</p>` : ""}
      ${a.bio ? `<p class="pf-bio">${esc(a.bio)}</p>` : ""}
      ${contactLinks(a.links, hasResume(data.site))}
    </header>
    ${order.map((k) => sections[k] || "").join("") || `<p class="pf-empty">Nothing to show yet.</p>`}
    <footer class="pf-foot">Live from my work dashboard · updated ${esc(formatDay(String(data.generated_at || new Date().toISOString()).slice(0, 10), { month: "long", day: "numeric", year: "numeric" }))}</footer>
  </div>`;
}
