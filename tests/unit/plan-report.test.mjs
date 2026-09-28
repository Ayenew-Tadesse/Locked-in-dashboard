import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildYearPlan, ticketSection, PLAN_STATS } from "../../app/plan/year-plan.js";
import { buildYearSetup, buildMissingHistory } from "../../app/plan/setup.js";
import { roadmapDone } from "../../app/legacy-import.js";
import { projectsFromLegacy, projectProgress, safeUrl } from "../../app/core/projects.js";
import { weekdayIndex, addDays } from "../../app/core/dates.js";
import { computeMilestone, computeGoal } from "../../app/core/insights.js";
import { buildReport, pdfText } from "../../app/report/daily-report.js";

let n = 0;
const newId = () => "id" + ++n;

// The original dashboard's built-in data, straight from index.html.
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const grab = (name) => JSON.parse(new RegExp(`var ${name} = (\\{.*?\\});\\n`).exec(html)[1]);
const legacy = {
  daily: grab("FALLBACK_DAILY"), reports: grab("FALLBACK_REPORTS"), checklists: grab("FALLBACK_CHECKLISTS"),
  contributions: grab("FALLBACK_CONTRIBUTIONS"),
  objective: { objective: "Ship three sibling apps", phases: [
    { id: "q1", tag: "Q1 · Sep–Dec 2026", text: "Foundation" }, { id: "q2", tag: "Q2 · Jan–Mar 2027", text: "Ship Guxo Flights" },
    { id: "q3", tag: "Q3 · Apr–Jun 2027", text: "Ship Guxo" }, { id: "q4", tag: "Q4 · Jul–Sep 2027", text: "Ship Gexi" }] },
};

test("plan: every daily ticket is a weekday morning, due that Friday, with all four sections", () => {
  const plan = buildYearPlan(newId);
  assert.equal(plan.tasks.length, PLAN_STATS.tickets);
  assert.equal(plan.milestones.length, 23);
  assert.equal(plan.goals.length, 4);
  const dates = plan.tasks.map((t) => t.date);
  assert.equal(new Set(dates).size, dates.length, "one ticket per morning");
  for (const t of plan.tasks) {
    assert.ok(weekdayIndex(t.date) <= 4, `${t.date} is a weekday`);
    assert.equal(t.due_date, addDays(t.date, 4 - weekdayIndex(t.date)), `${t.title} due Friday`);
    assert.ok(t.date >= "2026-09-28" && t.date <= "2026-12-23");
    for (const s of ["Goal", "How it works", "Steps", "Done when"]) assert.ok(ticketSection(t.description, s), `${t.title}: ${s}`);
    assert.ok(plan.milestones.some((m) => m.id === t.milestone_id), "linked to a milestone");
  }
  // Every weekday from Sep 28 to Dec 23 has a ticket.
  for (let d = "2026-09-28"; d <= "2026-12-23"; d = addDays(d, 1)) {
    if (weekdayIndex(d) <= 4) assert.ok(dates.includes(d), `ticket on ${d}`);
  }
});

test("plan: milestones and goals line up with the roadmap and calendar quarters", () => {
  const plan = buildYearPlan(newId);
  for (const m of plan.milestones) {
    assert.ok(plan.goals.some((g) => g.id === m.goal_id));
    assert.ok(!m.start_date || !m.deadline || m.start_date <= m.deadline, `${m.title} starts before its deadline`);
  }
  assert.deepEqual(plan.goals.map((g) => `Q${g.quarter} ${g.year}`), ["Q4 2026", "Q1 2027", "Q2 2027", "Q3 2027"]);
  const later = plan.milestones.filter((m) => m.start_date >= "2027-01-01");
  assert.ok(later.every((m) => /Week of/.test(m.description)), "Jan-Sep milestones carry week-by-week plans");
  assert.equal(plan.milestones.at(-1).deadline, "2027-09-23", "last milestone lands on launch day");
});

test("setup: history + plan, finished roadmap items stay finished", () => {
  assert.deepEqual(Object.keys(roadmapDone(legacy)).sort(), ["q1-1", "q1-2"]);
  const setup = buildYearSetup(legacy, newId);
  assert.equal(setup.goals.length, 4, "roadmap goals come from the plan only (no duplicates)");
  assert.equal(setup.milestones.length, 23);
  assert.equal(setup.tasks.length, 16 + PLAN_STATS.tickets, "16 history tasks (14 checklist + Sep 20-21 activity) + the plan's tickets");
  // Sep 20 and 21 had activity but no checklist: they become completed tasks.
  const early = setup.tasks.filter((t) => t.date < "2026-09-23");
  assert.deepEqual(early.map((t) => [t.date, t.status, t.category]), [["2026-09-20", "completed", "Guxo Flights"], ["2026-09-21", "completed", "Guxo"]]);
  // Days with a checklist don't also get their activity (no double counting).
  assert.equal(setup.tasks.filter((t) => t.date === "2026-09-25").length, 5);
  assert.equal(setup.dailyNotes.length, 3);
  const done = setup.milestones.filter((m) => m.status === "completed");
  assert.equal(done.length, 2);
  // Progress as the database computes it: the foundation goal is 2 of 6 done.
  const ms = setup.milestones.map((m) => computeMilestone(m, setup.tasks));
  const g1 = computeGoal(setup.goals[0], ms);
  assert.equal(Math.round(g1.percentage_complete), 33);
});

test("report: completed tasks with learning log and files, open work, milestones and the team", () => {
  const plan = buildYearPlan(newId);
  const t = { ...plan.tasks[0], status: "completed", completed_at: "2026-09-28T14:00:00Z", actual_minutes: 170,
    learning_changed: "Added docs/booking-state.md", learning_how: "Listed screens and data", learning_solved: "Clear shape before coding" };
  const open = { ...plan.tasks[1], date: "2026-09-28" };
  const late = { id: "late", title: "Late thing", date: "2026-09-24", due_date: "2026-09-25", status: "not_started" };
  const files = [{ task_id: t.id, name: "booking-state.png" }];
  const ana = { id: "a1", user_id: "ana", title: "Ana's screen", status: "completed", completed_at: "2026-09-27T10:00:00Z", date: "2026-09-27", learning_changed: "Built it" };
  // A week: Sep 22-28.
  const r = buildReport({ period: "week", start: "2026-09-22", end: "2026-09-28", label: "Sep 22 - 28", tasks: [t, open, late], milestones: plan.milestones,
    files, note: "Good week", score: 90, people: [{ name: "Ana", tasks: [ana] }], today: "2026-09-28", timeZone: "UTC" });
  assert.equal(r.title, "Weekly report");
  assert.equal(r.completed.length, 1);
  assert.equal(r.completed[0].changed, "Added docs/booking-state.md");
  assert.deepEqual(r.completed[0].files, ["booking-state.png"]);
  assert.match(r.completed[0].milestone, /state management/);
  assert.deepEqual(r.open.map((o) => [o.title, o.overdue]), [[open.title, false], ["Late thing", true]]);
  assert.equal(r.missingLogs, 0);
  assert.ok(r.milestones.length > 0 && "pct" in r.milestones[0] && "pace" in r.milestones[0], "every milestone's progress");
  assert.deepEqual(r.people.map((p) => [p.name, p.completed.length]), [["Ana", 1]]);
  assert.match(r.summary, /^1 task completed · 2h 50m logged · 2 still open \(1 overdue\) · score 90\/100$/);
  assert.ok(!("code" in r), "no GitHub section");
  // A day only counts that day.
  const d = buildReport({ period: "day", start: "2026-09-27", end: "2026-09-27", label: "Sep 27", tasks: [t, open], today: "2026-09-28", timeZone: "UTC" });
  assert.equal(d.title, "Daily report");
  assert.equal(d.completed.length, 0);
});

test("report: PDF text is cleaned to what the PDF font can show", () => {
  assert.equal(pdfText("search → select — book · “done” ✓"), 'search -> select - book - "done" done');
  assert.equal(pdfText("ሰላም"), "???", "Ge'ez script falls back to ? (3 characters)");
});

test("setup: adding missing history only adds what isn't there yet", () => {
  // An account set up before activity-only days were imported: 14 checklist tasks and 3 reports.
  const before = buildYearSetup({ ...legacy, contributions: {} }, newId);
  const daily = Object.fromEntries(before.dailyNotes.map((n) => [n.date, n]));
  const missing = buildMissingHistory(legacy, newId, { tasks: before.tasks, daily });
  assert.deepEqual(missing.tasks.map((t) => t.date), ["2026-09-20", "2026-09-21"]);
  assert.equal(missing.dailyNotes.length, 0);
  assert.equal(missing.goals.length + missing.milestones.length, 0, "never re-adds the plan");
  // Running it again adds nothing.
  const again = buildMissingHistory(legacy, newId, { tasks: [...before.tasks, ...missing.tasks], daily });
  assert.equal(again.tasks.length + again.dailyNotes.length, 0);
  // A fresh account gets all of it.
  const fresh = buildMissingHistory(legacy, newId, {});
  assert.equal(fresh.tasks.length, 16);
  assert.equal(fresh.dailyNotes.length, 3);
});

test("projects: the original apps become project rows with their checklists and links", () => {
  const apps = [...html.matchAll(/name: "([^"]+)",\s*routeCode: "([A-Z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(apps, ["Guxo Flights", "Guxo", "Gexi"]);
  const legacyApps = [
    { id: "hidgo", name: "Guxo Flights", routeCode: "FLT", category: "Flight booking", statusLevel: "good", stage: "Case study drafted", facts: ["a", ""], webAppLink: "https://x.io/", repoLink: "https://github.com/x", appRepoLink: null },
    { id: "gexi", name: "Gexi", routeCode: "SHP", statusLevel: "weird", facts: [], webAppLink: null },
  ];
  const rows = projectsFromLegacy({ apps: legacyApps, checklists: legacy.checklists });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.name, r.code, r.status, r.position]), [["Guxo Flights", "FLT", "good", 0], ["Gexi", "SHP", "idle", 1]]);
  assert.deepEqual(rows[0].links, { web: "https://x.io/", repo: "https://github.com/x" });
  assert.deepEqual(rows[0].facts, ["a"]);
  assert.equal(rows[0].checklist.length, 6, "Guxo Flights keeps its 6 checklist items");
  assert.deepEqual(projectProgress(rows[0]), { done: rows[0].checklist.filter((i) => i.done).length, total: 6, pct: Math.round(rows[0].checklist.filter((i) => i.done).length / 6 * 100) });
  assert.deepEqual(projectProgress(rows[1]), { done: 0, total: 0, pct: 0 });
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl(" https://ok.io "), "https://ok.io");
});
