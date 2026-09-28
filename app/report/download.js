// Makes and downloads the work report PDF for a period (see daily-report.js).
import { state } from "../state.js";
import { scoreDay, scorePeriod } from "../core/scoring.js";
import { buildReport, renderReportPdf, PERIOD_NAMES } from "./daily-report.js";

/**
 * period: "day" | "week" | "month" | "quarter"; start/end: YYYY-MM-DD; label: e.g. "Sep 22 – 28".
 * `userId` makes a report for one colleague (owner's Team page); otherwise
 * it's yours, and the owner's also covers each colleague.
 */
export async function downloadReport({ period, start, end, label, userId = null, name = null }) {
  const opts = { today: state.today, timeZone: state.timeZone };
  const mine = !userId || userId === state.me;
  const tasks = mine ? state.tasks : state.teamTasks.filter((t) => t.user_id === userId);
  const score = period === "day" ? scoreDay(tasks, start, state.cfg, opts).score : scorePeriod(tasks, start, end, state.cfg, opts).score;
  const people = mine && state.isOwner
    ? state.members.filter((m) => m.user_id !== state.me).map((m) => ({ name: m.name, tasks: state.teamTasks.filter((t) => t.user_id === m.user_id) }))
    : [];
  const note = !mine ? "" : period === "day" ? state.daily[start]?.notes : period === "week" ? state.weekly[start]?.notes : "";
  const report = buildReport({ period, start, end, label, tasks, milestones: state.milestones, files: state.files || [], note, score, people, today: state.today, timeZone: state.timeZone });
  if (name) report.title = `${PERIOD_NAMES[period]} report: ${name}`;
  const doc = await renderReportPdf(report);
  const who = name ? "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "";
  doc.save(`locked-in-${PERIOD_NAMES[period].toLowerCase()}-report${who}-${start === end ? start : start + "-to-" + end}.pdf`);
  return report;
}
