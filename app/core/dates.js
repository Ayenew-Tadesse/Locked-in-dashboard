// Calendar helpers. Days are passed around as "YYYY-MM-DD" keys; the maths
// runs in UTC so daylight-saving changes never shift a day.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86400000;

export function pad2(n) { return (n < 10 ? "0" : "") + n; }

function toUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

export function isDayKey(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

/** Local calendar day of a Date (browser time zone). */
export function isoDay(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/** Today's key, in the given IANA time zone (default: this device's). */
export function todayKey(timeZone) {
  return dayOf(new Date(), timeZone);
}

/** The calendar day a timestamp falls on, in a time zone (default: local). */
export function dayOf(ts, timeZone) {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return null;
  if (!timeZone) return isoDay(d);
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return isoDay(d);
  }
}

export function addDays(key, n) { return fromUtc(toUtc(key) + n * DAY_MS); }
export function diffDays(from, to) { return Math.round((toUtc(to) - toUtc(from)) / DAY_MS); }
export function weekdayIndex(key) { return (new Date(toUtc(key)).getUTCDay() + 6) % 7; } // Mon = 0

export function weekRange(key) {
  const start = addDays(key, -weekdayIndex(key));
  return { start, end: addDays(start, 6) };
}
export function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return { start: `${y}-${pad2(m)}-01`, end: fromUtc(Date.UTC(y, m, 0)) };
}
export function quarterOf(key) {
  const [y, m] = key.split("-").map(Number);
  return { quarter: Math.floor((m - 1) / 3) + 1, year: y };
}
export function quarterRange(quarter, year) {
  const m = (quarter - 1) * 3;
  return { start: `${year}-${pad2(m + 1)}-01`, end: fromUtc(Date.UTC(year, m + 3, 0)) };
}
export function eachDay(start, end) {
  const out = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}
export function clampKey(key, min, max) { return key < min ? min : key > max ? max : key; }

export function formatDay(key, opts = { weekday: "short", month: "short", day: "numeric" }) {
  if (!key) return "";
  return new Date(toUtc(key)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
export function shortDay(key) {
  const [, m, d] = key.split("-").map(Number);
  return MONTHS[m - 1] + " " + d;
}
export function formatRange(start, end) {
  const [ys, ms] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  if (ys === ye && ms === me) return shortDay(start) + "–" + de;
  return shortDay(start) + " – " + shortDay(end) + (ys !== ye ? ", " + ye : "");
}
/** 320 -> "5h 20m", 45 -> "45m", 0 -> "0m". */
export function formatMinutes(min) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  return h ? h + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m";
}
/** Human "in 3 days" / "2 days ago" / "today". */
export function relativeDay(key, today) {
  const n = diffDays(today, key);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
