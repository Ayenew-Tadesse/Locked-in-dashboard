// Draws the portfolio (the summary from public.portfolio_view, or from
// buildPortfolioData for the owner's preview) as HTML. Shared by the
// hiring-manager page (portfolio.html) and the owner's Portfolio page.
import { esc } from "../ui/dom.js";
import { addDays, formatDay, formatMinutes } from "../core/dates.js";
import { projectProgress, safeUrl, LINK_LABELS } from "../core/projects.js";
import { activityStats, PORTFOLIO_LINKS } from "../core/portfolio.js";

const STATUS = { not_started: "Not started", in_progress: "In progress", completed: "Completed", on_hold: "On hold" };
const PROJECT_STATE = { good: "On track", warn: "Needs attention", idle: "Not started" };

function contactLinks(links = {}) {
  const out = PORTFOLIO_LINKS.map(([k, label]) => {
    const v = (links[k] || "").trim();
    if (!v) return "";
    const href = k === "email" ? (/^[^@\s]+@[^@\s]+$/.test(v) ? `mailto:${v}` : null) : safeUrl(v);
    return href ? `<a class="pf-contact" href="${esc(href)}"${k === "email" ? "" : ' target="_blank" rel="noopener"'}>${esc(label)}</a>` : "";
  }).filter(Boolean);
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
  return `<div class="pf-heat" role="img" aria-label="Tasks finished per day over the last 6 months">${cells.join("")}</div>
    <div class="pf-heat-legend"><span>${esc(formatDay(start, { month: "short", year: "numeric" }))}</span><span class="pf-heat-scale">Less <i class="pf-cell l0"></i><i class="pf-cell l1"></i><i class="pf-cell l2"></i><i class="pf-cell l3"></i><i class="pf-cell l4"></i> More</span><span>Today</span></div>`;
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

/** The whole portfolio as HTML. */
export function renderPortfolio(data) {
  const a = data.about || {};
  const act = data.activity;
  const projects = data.projects || [];
  const ongoing = projects.filter((p) => projectProgress(p).pct < 100);
  const finished = projects.filter((p) => projectProgress(p).total && projectProgress(p).pct >= 100);
  const ms = data.milestones || [];
  const msDone = ms.filter((m) => m.status === "completed");
  const msOpen = ms.filter((m) => m.status !== "completed");
  const sections = [];

  if (act) {
    const s = activityStats(act);
    const weeks = act.weeks || [];
    sections.push(`<section class="pf-section" id="pf-activity"><h2>Activity</h2>
      <div class="pf-stats">
        ${stat(act.completed_total, "tasks finished")}
        ${stat(act.completed_30, "in the last 30 days")}
        ${stat(s.activeDays90, "active days (90)")}
        ${stat(s.streak ? `${s.streak} day${s.streak === 1 ? "" : "s"}` : "—", "current streak")}
        ${act.minutes_total ? stat(formatMinutes(act.minutes_total), "logged") : ""}
      </div>
      ${heatmap(act)}
      ${weeks.length ? `<div class="pf-weeks" aria-label="Weekly score, last ${weeks.length} weeks">${weeks.map((w) => `<span title="Week of ${esc(formatDay(w.week_start, { month: "short", day: "numeric" }))}: ${Math.round(w.score)}/100"><i style="height:${Math.max(4, Math.round(w.score))}%"></i></span>`).join("")}</div>
        <p class="pf-note">Weekly score (0–100): tasks finished on time, time logged and consistency.</p>` : ""}
    </section>`);
  }
  if (data.projects) {
    sections.push(`<section class="pf-section" id="pf-projects"><h2>Ongoing projects</h2>
      ${ongoing.length ? `<div class="pf-grid">${ongoing.map(projectCard).join("")}</div>` : `<p class="pf-empty">No ongoing projects right now.</p>`}
      ${finished.length ? `<h2 class="pf-sub">Projects completed</h2><div class="pf-grid">${finished.map(projectCard).join("")}</div>` : ""}
    </section>`);
  }
  if (data.milestones && ms.length) {
    const item = (m) => `<li><div><b>${esc(m.title)}</b>${m.description ? `<p>${esc(m.description)}</p>` : ""}</div>
      <span class="pf-ms-meta">${m.status === "completed" ? `Completed${m.completed_at ? " " + esc(formatDay(String(m.completed_at).slice(0, 10), { month: "short", day: "numeric", year: "numeric" })) : ""}`
        : `${m.pct}%${m.deadline ? " · due " + esc(formatDay(m.deadline, { month: "short", day: "numeric", year: "numeric" })) : ""}`}</span></li>`;
    sections.push(`<section class="pf-section" id="pf-milestones"><h2>Milestones</h2>
      ${msOpen.length ? `<h3 class="pf-h3">In progress</h3><ul class="pf-ms">${msOpen.map(item).join("")}</ul>` : ""}
      ${msDone.length ? `<h3 class="pf-h3">Achieved</h3><ul class="pf-ms done">${msDone.map(item).join("")}</ul>` : ""}
    </section>`);
  }
  if (data.plan && data.plan.length) {
    sections.push(`<section class="pf-section" id="pf-plan"><h2>The plan</h2>
      <ol class="pf-plan">${data.plan.map((g) => `<li><span class="pf-q">Q${g.quarter} ${g.year}</span><b>${esc(g.title)}</b>
        <div class="pf-bar"><i style="width:${g.pct}%"></i></div><span class="pf-plan-meta">${esc(STATUS[g.status] || "")} · ${g.pct}%</span></li>`).join("")}</ol>
    </section>`);
  }
  if (data.work || a.approach) {
    sections.push(`<section class="pf-section" id="pf-work"><h2>How I work</h2>
      ${a.approach ? `<p class="pf-approach">${esc(a.approach)}</p>` : ""}
      ${data.work?.length ? `<p class="pf-note">Recent finished work, in my own words: what changed, how, and the problem it solved.</p>
        <div class="pf-work">${data.work.map((w) => `<article>
          <header><h3>${esc(w.title)}</h3><span>${esc(formatDay(w.day, { month: "short", day: "numeric", year: "numeric" }))}${w.milestone ? ` · ${esc(w.milestone)}` : w.category ? ` · ${esc(w.category)}` : ""}${w.minutes ? ` · ${esc(formatMinutes(w.minutes))}` : ""}</span></header>
          <dl>${w.changed ? `<dt>What changed</dt><dd>${esc(w.changed)}</dd>` : ""}${w.how ? `<dt>How</dt><dd>${esc(w.how)}</dd>` : ""}${w.solved ? `<dt>Problem solved</dt><dd>${esc(w.solved)}</dd>` : ""}</dl>
        </article>`).join("")}</div>` : ""}
    </section>`);
  }

  return `<div class="pf">
    <header class="pf-hero">
      <p class="pf-eyebrow">Portfolio</p>
      <h1>${esc(a.name || "Portfolio")}</h1>
      ${a.headline ? `<p class="pf-headline">${esc(a.headline)}</p>` : ""}
      ${a.bio ? `<p class="pf-bio">${esc(a.bio)}</p>` : ""}
      ${contactLinks(a.links)}
    </header>
    ${sections.join("") || `<p class="pf-empty">Nothing to show yet.</p>`}
    <footer class="pf-foot">Live from my work dashboard · updated ${esc(formatDay(String(data.generated_at || new Date().toISOString()).slice(0, 10), { month: "long", day: "numeric", year: "numeric" }))}</footer>
  </div>`;
}
