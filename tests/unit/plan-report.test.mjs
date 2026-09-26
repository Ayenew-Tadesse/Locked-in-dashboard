import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildYearPlan, ticketSection, PLAN_STATS } from "../../app/plan/year-plan.js";
import { buildYearSetup } from "../../app/plan/setup.js";
import { roadmapDone } from "../../app/legacy-import.js";
import { weekdayIndex, addDays } from "../../app/core/dates.js";
import { computeMilestone, computeGoal } from "../../app/core/insights.js";
import { buildDailyReport, fetchCommits, pdfText } from "../../app/report/daily-report.js";

let n = 0;
const newId = () => "id" + ++n;

// The original dashboard's built-in data, straight from index.html.
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const grab = (name) => JSON.parse(new RegExp(`var ${name} = (\\{.*?\\});\\n`).exec(html)[1]);
const legacy = {
  daily: grab("FALLBACK_DAILY"), reports: grab("FALLBACK_REPORTS"), checklists: grab("FALLBACK_CHECKLISTS"),
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
  assert.equal(setup.tasks.length, 14 + PLAN_STATS.tickets, "14 history tasks + the plan's tickets");
  assert.equal(setup.dailyNotes.length, 3);
  const done = setup.milestones.filter((m) => m.status === "completed");
  assert.equal(done.length, 2);
  // Progress as the database computes it: the foundation goal is 2 of 6 done.
  const ms = setup.milestones.map((m) => computeMilestone(m, setup.tasks));
  const g1 = computeGoal(setup.goals[0], ms);
  assert.equal(Math.round(g1.percentage_complete), 33);
});

test("report: completed tasks with learning log, senior notes, open work and commits", () => {
  const plan = buildYearPlan(newId);
  const t = { ...plan.tasks[0], status: "completed", completed_at: "2026-09-28T14:00:00Z", actual_minutes: 170,
    learning_changed: "Added docs/booking-state.md", learning_how: "Listed screens and data", learning_solved: "Clear shape before coding" };
  const open = { ...plan.tasks[1], date: "2026-09-28" };
  const github = { repos: [{ repo: "a/b", commits: [{ sha: "abc1234", time: null, message: "Add store", files: [] }] }] };
  const r = buildDailyReport({ day: "2026-09-28", tasks: [t, open], milestones: plan.milestones, dailyNote: "Good start", score: 90, github, timeZone: "UTC" });
  assert.equal(r.completed.length, 1);
  assert.equal(r.completed[0].changed, "Added docs/booking-state.md");
  assert.match(r.completed[0].seniorNotes, /state store/);
  assert.match(r.completed[0].milestone, /state management/);
  assert.equal(r.open.length, 1);
  assert.equal(r.missingLogs, 0);
  assert.match(r.summary, /1 task completed · 2h 50m logged · daily score 90\/100 · 1 commit pushed/);
});

test("report: GitHub commits are read per repository and failures are explained", async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes("/missing/")) return { ok: false, status: 404 };
    if (url.includes("/limited/")) return { ok: false, status: 403 };
    if (url.includes("/commits/abc")) return { ok: true, status: 200, json: async () => ({ files: [{ filename: "src/store.ts", status: "added", additions: 40, deletions: 0 }] }) };
    return { ok: true, status: 200, json: async () => [{ sha: "abc123456", commit: { message: "Add store\n\nWhy: shared state", author: { date: "2026-09-28T15:00:00Z" } } }] };
  };
  const out = await fetchCommits(["me/app", "me/missing", "me/limited"], "2026-09-28", fake);
  assert.equal(out.repos[0].commits[0].sha, "abc1234");
  assert.equal(out.repos[0].commits[0].files[0].name, "src/store.ts");
  assert.match(out.repos[1].error, /not found/);
  assert.match(out.repos[2].error, /limit/);
  assert.match(calls[0], /since=.*&until=/);
});

test("report: PDF text is cleaned to what the PDF font can show", () => {
  assert.equal(pdfText("search → select — book · “done” ✓"), 'search -> select - book - "done" done');
  assert.equal(pdfText("ሰላም"), "???", "Ge'ez script falls back to ? (3 characters)");
});
