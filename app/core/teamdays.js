// The Activity map for everyone on a team except its owner: it starts the day
// they joined, and each day is
//   on time  every task planned for the day finished by its deadline (green)
//   late     a task finished after its deadline, or unfinished past it (red)
//   none     no tasks planned that day (light yellow)
//   pending  today, with time left on unfinished tasks (no colour yet)
// A task's deadline is its due date, or the day it's planned for.
import { addDays, dayOf } from "./dates.js";

export const deadlineOf = (t) => t.due_date || t.date;

/** One day: { s: "ontime" | "late" | "none" | "pending", text }. */
export function teamDayStatus(tasks, day, today, timeZone) {
  const planned = tasks.filter((t) => t.date === day && t.status !== "cancelled");
  if (!planned.length) return { s: "none", text: "No tasks" };
  let late = 0, onTime = 0, open = 0;
  for (const t of planned) {
    const deadline = deadlineOf(t);
    if (t.status === "completed") {
      const doneOn = dayOf(t.completed_at, timeZone) || t.date;
      if (doneOn > deadline) late++; else onTime++;
    } else if (deadline < today) late++;
    else open++;
  }
  const n = planned.length;
  if (late) return { s: "late", text: `${late} of ${n} late` + (onTime ? ` · ${onTime} on time` : "") };
  if (open) return { s: "pending", text: `${onTime} of ${n} done so far` };
  return { s: "ontime", text: `${n} of ${n} done on time` };
}

/** Every day from the join day to today: { start, status: { [day]: { s, text } } }. */
export function buildTeamDays(tasks, start, today, timeZone) {
  const status = {};
  if (start && start <= today) for (let d = start; d <= today; d = addDays(d, 1)) status[d] = teamDayStatus(tasks, d, today, timeZone);
  return { start: start || today, status };
}
