// Quarters of your plan year. With a year set (Settings → My year, e.g.
// Sep 22, 2026 → Sep 23, 2027) Q1 runs from the start to the end of the
// calendar quarter that's mostly inside it (Sep 22 – Dec 31), Q2–Q4 follow
// the calendar and Q4 ends on the last day of your year (launch day). The
// next year starts the day after. Without a year, quarters are the calendar's.
//
// Goals keep their stored calendar quarter (quarterly_goals.quarter/year): a
// goal belongs to the plan quarter that contains its calendar quarter's first
// day, and a new goal is stored under the calendar quarter of the plan
// quarter's last day. So no data changes.
import { addDays, quarterOf as calQuarterOf, quarterRange as calQuarterRange, formatRange, isDayKey } from "./dates.js";

/** A clean { start, end } plan year, or null (calendar quarters). */
export function yearConfig(y) {
  if (!y || !isDayKey(y.start) || !isDayKey(y.end) || y.end <= y.start) return null;
  return { start: y.start, end: y.end };
}

function addYears(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// Year k: 0 is the configured one, 1 the next, -1 the one before.
function yearBounds(cfg, k) {
  if (k === 0) return { start: cfg.start, end: cfg.end };
  if (k > 0) return { start: addDays(addYears(cfg.end, k - 1), 1), end: addYears(cfg.end, k) };
  return { start: addYears(cfg.start, k), end: addDays(addYears(cfg.start, k + 1), -1) };
}
function yearIndexOf(cfg, day) {
  let k = 0;
  while (day > yearBounds(cfg, k).end) k++;
  while (day < yearBounds(cfg, k).start) k--;
  return k;
}

function quartersOfYear(cfg, k) {
  const { start, end } = yearBounds(cfg, k);
  const firstEnd = calQuarterRange(...Object.values(calQuarterOf(addDays(start, 45)))).end;
  const out = [];
  let s = start;
  for (let n = 1; n <= 4; n++) {
    let e = n === 1 ? firstEnd : calQuarterRange(...Object.values(calQuarterOf(s))).end;
    if (n === 4 || e > end) e = end;
    out.push({ start: s, end: e });
    s = addDays(e, 1);
  }
  return out;
}

const withYear = (range) => { const t = formatRange(range.start, range.end); return /\d{4}/.test(t) ? t : `${t}, ${range.end.slice(0, 4)}`; };

function make(n, range, yearStart, cfg) {
  const y = Number(yearStart.slice(0, 4));
  return {
    quarter: n, year: y, start: range.start, end: range.end, plan: !!cfg,
    yearLabel: cfg ? `${y}–${String(y + 1).slice(2)}` : String(y),
    title: cfg ? `Q${n}` : `Q${n} ${y}`,
    long: `Q${n} · ${withYear(range)}`,
  };
}

/** The quarter a day is in. */
export function quarterAt(day, cfg) {
  if (!cfg) { const q = calQuarterOf(day); return make(q.quarter, calQuarterRange(q.quarter, q.year), `${q.year}-01-01`, null); }
  const k = yearIndexOf(cfg, day);
  const qs = quartersOfYear(cfg, k);
  const n = qs.findIndex((r) => day >= r.start && day <= r.end) + 1;
  return make(n, qs[n - 1], yearBounds(cfg, k).start, cfg);
}

/** Quarter n of the year that starts in calendar year y. */
export function quarterBy(n, y, cfg) {
  n = Math.min(4, Math.max(1, Number(n) || 1));
  if (!cfg) return make(n, calQuarterRange(n, y), `${y}-01-01`, null);
  const k = yearIndexOf(cfg, addYears(cfg.start, y - Number(cfg.start.slice(0, 4))));
  return make(n, quartersOfYear(cfg, k)[n - 1], yearBounds(cfg, k).start, cfg);
}

/** The quarter before (-1) or after (+1). */
export function shiftQuarter(q, step, cfg) {
  return quarterAt(step < 0 ? addDays(q.start, -1) : addDays(q.end, 1), cfg);
}

/** Does a goal (stored by calendar quarter) belong to this quarter? */
export function goalInQuarter(goal, q) {
  if (!goal?.quarter || !goal?.year) return false;
  const first = calQuarterRange(goal.quarter, goal.year).start;
  return first >= q.start && first <= q.end;
}

/** The goal's plan quarter. */
export function quarterOfGoal(goal, cfg) {
  return quarterAt(calQuarterRange(goal.quarter, goal.year).start, cfg);
}

/** How a new goal in this quarter is stored: { quarter, year } of the calendar. */
export function storageQuarter(q) {
  return calQuarterOf(q.end);
}
