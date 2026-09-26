// Daily report PDF: what was modified, how, and what problem was solved,
// for one day. Built from the day's tasks (with their Learning logs and the
// ticket's "How it works" notes), your daily note, and the commits you pushed
// to your GitHub repositories that day.
import { dayOf, formatDay, formatMinutes } from "../core/dates.js";
import { ticketSection } from "../plan/year-plan.js";

export const DEFAULT_REPOS = ["Ayenew-Tadesse/Guxo-Flights", "Ayenew-Tadesse/guxo-flights-app"];

// ---------------------------------------------------------------------------
// GitHub commits for a day (public repositories, no token needed)
// ---------------------------------------------------------------------------

/** Start and end of a calendar day in this device's time zone, as ISO strings. */
function dayBounds(day) {
  const [y, m, d] = day.split("-").map(Number);
  return { since: new Date(y, m - 1, d, 0, 0, 0).toISOString(), until: new Date(y, m - 1, d, 23, 59, 59).toISOString() };
}

/**
 * Returns { repos: [{ repo, commits: [{ sha, time, message, files: [{ name, status, additions, deletions }] }], error }] }.
 * Never throws: a repository that can't be read carries an `error` message.
 */
export async function fetchCommits(repos, day, fetchImpl = fetch, { maxCommits = 8 } = {}) {
  const { since, until } = dayBounds(day);
  const out = [];
  for (const repo of repos) {
    try {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/commits?since=${since}&until=${until}&per_page=${maxCommits}`,
        { headers: { Accept: "application/vnd.github+json" } });
      if (res.status === 404) { out.push({ repo, commits: [], error: "Repository not found (or private)." }); continue; }
      if (res.status === 403 || res.status === 429) { out.push({ repo, commits: [], error: "GitHub's hourly limit was reached. Try again later." }); continue; }
      if (!res.ok) { out.push({ repo, commits: [], error: `GitHub returned ${res.status}.` }); continue; }
      const list = await res.json();
      const commits = [];
      for (const c of list.slice(0, maxCommits)) {
        let files = [];
        try {
          const d = await fetchImpl(`https://api.github.com/repos/${repo}/commits/${c.sha}`, { headers: { Accept: "application/vnd.github+json" } });
          if (d.ok) files = ((await d.json()).files || []).map((f) => ({ name: f.filename, status: f.status, additions: f.additions, deletions: f.deletions }));
        } catch { /* keep the commit without its file list */ }
        commits.push({ sha: c.sha.slice(0, 7), time: c.commit?.author?.date || null, message: c.commit?.message || "", files });
      }
      out.push({ repo, commits: commits.reverse() }); // oldest first
    } catch {
      out.push({ repo, commits: [], error: "Couldn't reach GitHub (offline?)." });
    }
  }
  return { repos: out };
}

// ---------------------------------------------------------------------------
// Report content (pure: easy to test)
// ---------------------------------------------------------------------------

/**
 * Builds the report as plain data:
 *   { title, day, summary, completed: [...], open: [...], note, code, lessons }
 */
export function buildDailyReport({ day, tasks, milestones = [], dailyNote = "", score = null, github = null, timeZone }) {
  const msName = (id) => milestones.find((m) => m.id === id)?.title || null;
  const completedOnDay = tasks.filter((t) => t.status === "completed" && (dayOf(t.completed_at, timeZone) || t.date) === day);
  const plannedOpen = tasks.filter((t) => t.date === day && !["completed", "cancelled"].includes(t.status));
  const minutes = completedOnDay.reduce((s, t) => s + (Number(t.actual_minutes) || 0), 0);
  const completed = completedOnDay.map((t) => ({
    title: t.title,
    milestone: msName(t.milestone_id),
    minutes: t.actual_minutes,
    changed: t.learning_changed || null,
    how: t.learning_how || null,
    solved: t.learning_solved || null,
    seniorNotes: ticketSection(t.description, "How it works"),
    goal: ticketSection(t.description, "Goal"),
  }));
  const commitCount = github ? github.repos.reduce((s, r) => s + r.commits.length, 0) : 0;
  return {
    title: "Daily report",
    day,
    dayLabel: formatDay(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    summary: [
      `${completed.length} task${completed.length === 1 ? "" : "s"} completed`,
      minutes ? `${formatMinutes(minutes)} logged` : null,
      score != null ? `daily score ${score}/100` : null,
      github ? `${commitCount} commit${commitCount === 1 ? "" : "s"} pushed` : null,
    ].filter(Boolean).join(" · "),
    completed,
    open: plannedOpen.map((t) => ({ title: t.title, status: t.status, completion: t.completion_percentage })),
    note: dailyNote || null,
    code: github,
    missingLogs: completed.filter((c) => !c.changed && !c.how && !c.solved).length,
  };
}

// ---------------------------------------------------------------------------
// PDF (jsPDF, shipped with the site in app/vendor)
// ---------------------------------------------------------------------------

/** The PDF's built-in fonts only cover Latin-1: swap in look-alikes for the rest. */
export function pdfText(s) {
  return String(s ?? "")
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[→⟶]/g, "->")
    .replace(/←/g, "<-").replace(/[·•◆●]/g, "-").replace(/[✓✔]/g, "done")
    .replace(/×/g, "x").replace(/ /g, " ")
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "?");
}

let jsPdfLoading = null;
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!jsPdfLoading) {
    jsPdfLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("../vendor/jspdf.umd.min.js", import.meta.url).href;
      s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("PDF library didn't load.")));
      s.onerror = () => { jsPdfLoading = null; reject(new Error("Couldn't load the PDF library.")); };
      document.head.appendChild(s);
    });
  }
  return jsPdfLoading;
}

/** Renders the report to a PDF and returns the jsPDF document. */
export async function renderDailyReportPdf(report) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const ink = [20, 28, 45], muted = [110, 120, 140], accent = [40, 90, 170];

  const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const text = (s, { size = 10.5, bold = false, color = ink, indent = 0, gap = 4 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(s), W - 2 * M - indent);
    const lh = size * 1.35;
    for (const line of lines) { ensure(lh); doc.text(line, M + indent, y + size); y += lh; }
    y += gap;
  };
  const rule = () => { ensure(12); doc.setDrawColor(210, 215, 225); doc.line(M, y + 4, W - M, y + 4); y += 12; };
  const heading = (s) => { ensure(40); y += 8; text(s.toUpperCase(), { size: 9, bold: true, color: accent, gap: 6 }); };

  text("Locked in", { size: 9, bold: true, color: accent, gap: 2 });
  text(`${report.title} - ${report.dayLabel}`, { size: 18, bold: true, gap: 4 });
  text(report.summary || "Nothing recorded for this day.", { size: 10.5, color: muted, gap: 6 });
  if (report.missingLogs) {
    text(`${report.missingLogs} completed task${report.missingLogs === 1 ? " has" : "s have"} no learning log yet. Open the task and fill in "What changed / How / Problem solved" to make this report more useful.`,
      { size: 9.5, color: [160, 100, 20] });
  }
  rule();

  heading("What was done, how, and what problem it solved");
  if (!report.completed.length) text("No tasks were completed on this day.", { color: muted });
  report.completed.forEach((c, i) => {
    ensure(60);
    text(`${i + 1}. ${c.title}`, { size: 12, bold: true, gap: 2 });
    const meta = [c.milestone ? `Milestone: ${c.milestone}` : null, c.minutes ? `Time: ${formatMinutes(c.minutes)}` : null].filter(Boolean).join("   ");
    if (meta) text(meta, { size: 9, color: muted, gap: 6 });
    if (c.goal) { text("Goal", { size: 9.5, bold: true, indent: 12, gap: 1 }); text(c.goal, { indent: 12 }); }
    text("What was modified", { size: 9.5, bold: true, indent: 12, gap: 1 });
    text(c.changed || "(not recorded)", { indent: 12, color: c.changed ? ink : muted });
    text("How it was modified", { size: 9.5, bold: true, indent: 12, gap: 1 });
    text(c.how || "(not recorded)", { indent: 12, color: c.how ? ink : muted });
    text("What problem was solved", { size: 9.5, bold: true, indent: 12, gap: 1 });
    text(c.solved || "(not recorded)", { indent: 12, color: c.solved ? ink : muted });
    if (c.seniorNotes) {
      text("Senior developer notes: how it works", { size: 9.5, bold: true, indent: 12, gap: 1, color: accent });
      text(c.seniorNotes, { indent: 12, size: 10 });
    }
    y += 4;
  });

  if (report.code) {
    heading("Code pushed to GitHub");
    for (const r of report.code.repos) {
      text(r.repo, { size: 10.5, bold: true, gap: 2 });
      if (r.error) { text(r.error, { color: muted, indent: 12 }); continue; }
      if (!r.commits.length) { text("No commits on this day.", { color: muted, indent: 12 }); continue; }
      for (const c of r.commits) {
        const time = c.time ? new Date(c.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
        text(`${c.sha}  ${time}  ${c.message.split("\n")[0]}`, { indent: 12, gap: 2 });
        const body = c.message.split("\n").slice(1).join("\n").trim();
        if (body) text(body, { indent: 24, size: 9, color: muted, gap: 2 });
        for (const f of c.files.slice(0, 12)) text(`${f.status}: ${f.name}  (+${f.additions} / -${f.deletions})`, { indent: 24, size: 9, color: muted, gap: 0 });
        if (c.files.length > 12) text(`...and ${c.files.length - 12} more files`, { indent: 24, size: 9, color: muted, gap: 0 });
        y += 4;
      }
    }
  }

  if (report.open.length) {
    heading("Still open from this day");
    for (const o of report.open) text(`- ${o.title}${o.completion ? ` (${o.completion}%)` : ""}`, { indent: 6, gap: 2 });
  }
  if (report.note) {
    heading("Your notes");
    text(report.note);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(pdfText(`Locked in - daily report - ${report.day}`), M, H - 24);
    doc.text(`${p} / ${pages}`, W - M, H - 24, { align: "right" });
  }
  return doc;
}
