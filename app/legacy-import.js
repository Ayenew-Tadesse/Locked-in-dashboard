// Turns the original dashboard's data (daily checklists, daily reports and
// the quarterly roadmap) into database rows. Used once from Settings.
//
// Mapping:
//   daily checklist items  -> tasks (date = that day, completed if ticked)
//   daily reports          -> notes on that day's score
//   roadmap phases (Q1-Q4) -> quarterly goals, placed in the calendar quarter
//                             where the phase ends (e.g. "Sep–Dec 2026" -> Q4 2026)
//   roadmap checklist items-> milestones under their goal (deadline = end of
//                             the month given, e.g. "Oct 2026" -> Oct 31, 2026)
import { MONTHS, pad2, monthRange, quarterOf } from "./core/dates.js";

const clip = (s, n) => (s || "").trim().slice(0, n);

function monthEnd(label) {
  const m = /([A-Z][a-z]{2})\w*\s+(\d{4})/.exec(label || "");
  if (!m || MONTHS.indexOf(m[1]) < 0) return null;
  return monthRange(`${m[2]}-${pad2(MONTHS.indexOf(m[1]) + 1)}-01`).end;
}

export function buildLegacyImport(legacy, newId) {
  const goals = [], milestones = [], tasks = [], dailyNotes = [];

  for (const [date, day] of Object.entries(legacy.daily || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const t of day.tasks || []) {
      if (!t.text) continue;
      tasks.push({
        id: newId(), title: clip(t.text, 300), date, status: t.done ? "completed" : "not_started",
        completion_percentage: t.done ? 100 : 0, priority: "medium", category: "Build",
        completed_at: t.done ? new Date(`${date}T17:00:00`).toISOString() : null,
      });
    }
  }

  for (const [date, r] of Object.entries(legacy.reports || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !r) continue;
    const next = Array.isArray(r.next) && r.next.length ? "\n\nNext up:\n- " + r.next.join("\n- ") : "";
    const notes = clip((r.summary || "") + next, 10000);
    if (notes) dailyNotes.push({ date, notes });
  }

  const phases = (legacy.objective && legacy.objective.phases) || [];
  phases.forEach((p, i) => {
    const id = p.id || "q" + (i + 1);
    // "Q1 · Sep–Dec 2026": the phase ends in the last month named.
    const range = (p.tag || "").split("·")[1] || "";
    const endMonth = /([A-Z][a-z]{2})\s+(\d{4})\s*$/.exec(range.trim());
    const deadline = endMonth ? monthEnd(`${endMonth[1]} ${endMonth[2]}`) : null;
    if (!deadline) return;
    const q = quarterOf(deadline);
    const goalId = newId();
    goals.push({
      id: goalId, title: clip(`${(p.tag || "").split("·")[0].trim() || "Roadmap"} roadmap: ${p.text || ""}`, 200),
      description: clip([legacy.objective.objective, p.tag].filter(Boolean).join("\n"), 5000),
      quarter: q.quarter, year: q.year, deadline, progress_mode: "milestones", status: "not_started",
    });
    for (const item of (legacy.checklists && legacy.checklists[id]) || []) {
      if (!item.text) continue;
      milestones.push({
        id: newId(), goal_id: goalId, title: clip(item.text, 200), category: "Roadmap", priority: "medium",
        deadline: monthEnd(item.deadline) || deadline, progress_mode: "manual", target: 1,
        current_progress: item.done ? 1 : 0, status: item.done ? "completed" : "not_started",
      });
    }
  });
  return { goals, milestones, tasks, dailyNotes };
}
