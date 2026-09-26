// Sample data for demo mode (?demo=1). Built relative to today so the
// dashboard always has a realistic few weeks of history. Nothing is saved.
import { addDays, quarterOf, quarterRange, todayKey } from "./core/dates.js";

export function demoSeed(today = todayKey()) {
  const q = quarterOf(today);
  const qr = quarterRange(q.quarter, q.year);
  const ts = (day, h = 15) => `${day}T${String(h).padStart(2, "0")}:00:00Z`;
  const goals = [
    { id: "g1", title: "Ship Guxo Flights publicly", quarter: q.quarter, year: q.year, deadline: qr.end, progress_mode: "milestones",
      target: 100, current_progress: 0, status: "in_progress", description: "First sibling app live." },
    { id: "g2", title: "Complete React Native course", quarter: q.quarter, year: q.year, deadline: qr.end, progress_mode: "manual",
      target: 20, current_progress: 12, status: "in_progress", description: "20 modules." },
  ];
  const milestones = [
    { id: "m1", goal_id: "g1", title: "Launch personal portfolio", category: "Portfolio", priority: "high", progress_mode: "tasks",
      start_date: addDays(today, -30), deadline: addDays(today, 20), status: "in_progress", description: "Case studies + contact page." },
    { id: "m2", goal_id: "g1", title: "Booking flow end-to-end", category: "Guxo Flights", priority: "urgent", progress_mode: "tasks",
      start_date: addDays(today, -21), deadline: addDays(today, 6), status: "in_progress" },
    { id: "m3", title: "Read 6 design books", category: "Learning", priority: "low", progress_mode: "manual",
      target: 6, current_progress: 2, start_date: addDays(today, -60), deadline: addDays(today, 60), status: "in_progress" },
  ];
  const cats = ["Guxo Flights", "Portfolio", "Learning", "Admin"];
  const titles = [
    "Wire search results to the API", "Write portfolio case study", "Fix date picker on Android", "Review pull requests",
    "Draft checkout screen", "Record demo video", "Plan next sprint", "Update README", "Design empty states", "Refactor auth hooks",
    "Watch RN module", "Reply to emails", "Test on real phone", "Polish landing hero",
  ];
  const tasks = [];
  let n = 0;
  for (let back = 20; back >= 1; back--) {
    const day = addDays(today, -back);
    const dow = new Date(day + "T12:00:00Z").getUTCDay();
    if (dow === 0) continue; // Sundays off
    const count = 2 + ((back * 7) % 3);
    for (let i = 0; i < count; i++) {
      n++;
      const finished = (back + i) % 5 !== 0;
      const ms = i === 0 ? (back % 2 ? "m1" : "m2") : null;
      const priority = ["low", "medium", "high", "urgent"][(back + i) % 4];
      tasks.push({
        id: "d" + n, title: titles[n % titles.length], date: day, due_date: i === 0 ? day : null, priority,
        status: finished ? "completed" : back < 4 && i === 1 ? "in_progress" : "not_started",
        completion_percentage: finished ? 100 : back < 4 && i === 1 ? 40 : 0,
        category: cats[(n + i) % cats.length], estimated_minutes: 45 + (n % 4) * 15, actual_minutes: finished ? 40 + (n % 5) * 20 : null,
        completed_at: finished ? ts(day, 10 + i * 2) : null, milestone_id: ms, created_at: ts(day, 8),
      });
    }
  }
  const t = (o) => tasks.push({ id: "t" + ++n, completion_percentage: 0, status: "not_started", priority: "medium", created_at: ts(today, 8), ...o });
  t({ title: "Finish booking confirmation screen", date: today, due_date: today, priority: "urgent", category: "Guxo Flights", milestone_id: "m2", estimated_minutes: 120, status: "in_progress", completion_percentage: 50, actual_minutes: 60 });
  t({ title: "Write About page copy", date: today, priority: "high", category: "Portfolio", milestone_id: "m1", estimated_minutes: 60, status: "completed", completion_percentage: 100, completed_at: new Date().toISOString(), actual_minutes: 55 });
  t({ title: "Stand-up notes", date: today, priority: "low", category: "Admin", estimated_minutes: 15, status: "completed", completion_percentage: 100, completed_at: new Date().toISOString(), actual_minutes: 10 });
  t({ title: "Test keyboard handling on iOS", date: today, priority: "medium", category: "Guxo Flights", estimated_minutes: 45 });
  t({ title: "Send invoice to client", date: addDays(today, -4), due_date: addDays(today, -2), priority: "high", category: "Admin", estimated_minutes: 20, notes: "Needs the updated hours." });
  t({ title: "Portfolio: add contact form", date: addDays(today, 1), due_date: addDays(today, 2), priority: "high", category: "Portfolio", milestone_id: "m1", estimated_minutes: 90 });
  t({ title: "Payment sheet prototype", date: addDays(today, 2), due_date: addDays(today, 5), priority: "urgent", category: "Guxo Flights", milestone_id: "m2", estimated_minutes: 180 });
  t({ title: "Quarterly review", date: addDays(today, 7), priority: "medium", category: "Admin", estimated_minutes: 60 });
  return {
    profile: { id: "demo", name: "Demo user", email: "demo@example.com", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    settings: { scoring: {}, legacy_imported_at: null },
    tasks, milestones, goals,
    daily: [{ date: addDays(today, -1), notes: "Lost the afternoon to a build issue." }],
    weekly: [],
  };
}
