// Work report PDF for a day, week, month or quarter: what was completed (with
// each task's learning log and the files shared), what's still open or
// overdue, and how every milestone stands. The team owner's report adds a
// section per colleague. Built from the dashboard's own data only.
import { dayOf, formatDay, formatMinutes } from "../core/dates.js";
import { completedDay, isOverdue } from "../core/tasks.js";
import { milestoneInfo, PACE_LABELS } from "../core/insights.js";
import { ticketSection } from "../plan/year-plan.js";

export const PERIOD_NAMES = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly" };

// ---------------------------------------------------------------------------
// Report content (pure: easy to test)
// ---------------------------------------------------------------------------

const inRange = (d, start, end) => !!d && d >= start && d <= end;

function completedItems(tasks, { start, end, milestones, files, timeZone }) {
  const msName = (id) => milestones.find((m) => m.id === id)?.title || null;
  return tasks.filter((t) => t.status === "completed" && inRange(completedDay(t, timeZone) || t.date, start, end))
    .sort((a, b) => String(completedDay(a, timeZone) || a.date).localeCompare(String(completedDay(b, timeZone) || b.date)))
    .map((t) => ({
      title: t.title,
      day: completedDay(t, timeZone) || t.date,
      milestone: msName(t.milestone_id),
      minutes: t.actual_minutes,
      changed: t.learning_changed || null,
      how: t.learning_how || null,
      solved: t.learning_solved || null,
      files: (files || []).filter((f) => f.task_id === t.id).map((f) => f.name),
      goal: ticketSection(t.description, "Goal"),
    }));
}

/**
 * Builds the report as plain data:
 *   { title, period, label, summary, completed, open, milestones, people, note, missingLogs }
 * `people` (owner only): [{ name, tasks }] for each colleague.
 */
export function buildReport({ period = "day", start, end, label, tasks, milestones = [], files = [], note = "", score = null, people = [], today, timeZone }) {
  const opts = { start, end, milestones, files, timeZone };
  const completed = completedItems(tasks, opts);
  const open = tasks.filter((t) => inRange(t.date, start, end) && !["completed", "cancelled"].includes(t.status))
    .map((t) => ({ title: t.title, day: t.date, status: t.status, completion: t.completion_percentage, overdue: isOverdue(t, today), due: t.due_date }));
  const minutes = completed.reduce((s, c) => s + (Number(c.minutes) || 0), 0);
  const allTasks = [...tasks, ...people.flatMap((p) => p.tasks)];
  const ms = milestones.filter((m) => m.status !== "cancelled").map((m) => {
    const info = milestoneInfo(m, allTasks, today, timeZone);
    return { title: m.title, pct: Math.round(Number(m.percentage_complete) || 0), done: info.completed_tasks, total: info.total_tasks,
      deadline: m.deadline, pace: PACE_LABELS[info.pace] || "", completedInPeriod: m.status === "completed" && inRange(dayOf(m.completed_at, timeZone) || m.deadline, start, end) };
  });
  const team = people.map((p) => {
    const done = completedItems(p.tasks, opts);
    const still = p.tasks.filter((t) => inRange(t.date, start, end) && !["completed", "cancelled"].includes(t.status));
    return { name: p.name, completed: done, open: still.length, overdue: still.filter((t) => isOverdue(t, today)).length };
  });
  const overdue = open.filter((o) => o.overdue).length;
  return {
    title: `${PERIOD_NAMES[period] || "Daily"} report`,
    period, start, end, label,
    summary: [
      `${completed.length} task${completed.length === 1 ? "" : "s"} completed`,
      minutes ? `${formatMinutes(minutes)} logged` : null,
      open.length ? `${open.length} still open${overdue ? ` (${overdue} overdue)` : ""}` : null,
      score != null ? `score ${score}/100` : null,
    ].filter(Boolean).join(" · "),
    completed, open, milestones: ms, people: team,
    note: note || null,
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
export async function renderReportPdf(report) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const ink = [20, 28, 45], muted = [110, 120, 140], accent = [40, 90, 170], red = [180, 50, 50];
  const multiDay = report.start !== report.end;

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
  const completedList = (items, indent = 0) => {
    items.forEach((c, i) => {
      ensure(60);
      text(`${i + 1}. ${c.title}`, { size: 11.5, bold: true, gap: 2, indent });
      const meta = [multiDay ? formatDay(c.day, { weekday: "short", month: "short", day: "numeric" }) : null,
        c.milestone ? `Milestone: ${c.milestone}` : null, c.minutes ? `Time: ${formatMinutes(c.minutes)}` : null].filter(Boolean).join("   ");
      if (meta) text(meta, { size: 9, color: muted, gap: 4, indent });
      const i2 = indent + 12;
      if (c.goal) { text("Goal", { size: 9.5, bold: true, indent: i2, gap: 1 }); text(c.goal, { indent: i2 }); }
      text("What was done", { size: 9.5, bold: true, indent: i2, gap: 1 });
      text(c.changed || "(not recorded)", { indent: i2, color: c.changed ? ink : muted });
      if (c.how) { text("How", { size: 9.5, bold: true, indent: i2, gap: 1 }); text(c.how, { indent: i2 }); }
      if (c.solved) { text("Problem solved", { size: 9.5, bold: true, indent: i2, gap: 1 }); text(c.solved, { indent: i2 }); }
      if (c.files?.length) { text("Files shared", { size: 9.5, bold: true, indent: i2, gap: 1 }); text(c.files.join(", "), { indent: i2 }); }
      y += 4;
    });
  };

  text("Locked in", { size: 9, bold: true, color: accent, gap: 2 });
  text(`${report.title} - ${report.label}`, { size: 18, bold: true, gap: 4 });
  text(report.summary || "Nothing recorded in this period.", { size: 10.5, color: muted, gap: 6 });
  if (report.missingLogs) {
    text(`${report.missingLogs} completed task${report.missingLogs === 1 ? " has" : "s have"} no learning log yet. Open the task and fill in "What changed / How / Problem solved" to make this report more useful.`,
      { size: 9.5, color: [160, 100, 20] });
  }
  rule();

  heading("Completed");
  if (!report.completed.length) text("No tasks were completed in this period.", { color: muted });
  completedList(report.completed);

  if (report.open.length) {
    heading("Still open");
    for (const o of report.open) {
      const bits = [multiDay ? formatDay(o.day, { month: "short", day: "numeric" }) : null, o.completion ? `${o.completion}%` : null,
        o.overdue ? "OVERDUE" : o.due ? `due ${formatDay(o.due, { month: "short", day: "numeric" })}` : null].filter(Boolean).join(" · ");
      text(`- ${o.title}${bits ? `  (${bits})` : ""}`, { indent: 6, gap: 2, color: o.overdue ? red : ink });
    }
  }

  if (report.milestones.length) {
    heading("Milestones");
    for (const m of report.milestones) {
      ensure(30);
      text(`${m.title}${m.completedInPeriod ? "  - completed in this period" : ""}`, { size: 10.5, bold: true, gap: 1 });
      text([`${m.pct}% complete`, m.total ? `${m.done} of ${m.total} tasks done` : null, m.deadline ? `deadline ${formatDay(m.deadline, { month: "short", day: "numeric", year: "numeric" })}` : null, m.pace].filter(Boolean).join(" · "),
        { size: 9.5, color: muted, indent: 12, gap: 5 });
    }
  }

  if (report.people.length) {
    heading("Team");
    for (const p of report.people) {
      ensure(40);
      text(p.name, { size: 12, bold: true, gap: 1 });
      text(`${p.completed.length} completed · ${p.open} still open${p.overdue ? ` (${p.overdue} overdue)` : ""}`, { size: 9.5, color: muted, gap: 4 });
      completedList(p.completed, 12);
    }
  }

  if (report.note) {
    heading("Notes");
    text(report.note);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(pdfText(`Locked in - ${report.title.toLowerCase()} - ${report.start === report.end ? report.start : report.start + " to " + report.end}`), M, H - 24);
    doc.text(`${p} / ${pages}`, W - M, H - 24, { align: "right" });
  }
  return doc;
}
