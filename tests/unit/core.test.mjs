import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../../app/core/dates.js";
import { effectiveStatus, filterTasks, normalizeTask, wasOverdueOn, sortTasks } from "../../app/core/tasks.js";
import { resolveScoring, scoreDay, scorePeriod, scoreWeek, scoreQuarter, describeFormula } from "../../app/core/scoring.js";
import { computeMilestone, computeGoal, milestoneInfo, buildWarnings, planForDay } from "../../app/core/insights.js";
import { displayName, needsProfile, greetingOptions } from "../../app/core/people.js";

const TZ = "UTC";
const cfg = resolveScoring({});
let n = 0;
const task = (o) => ({ id: "t" + ++n, title: "Task " + n, status: "not_started", priority: "medium",
  completion_percentage: 0, date: "2026-09-21", due_date: null, milestone_id: null, actual_minutes: null, ...o });
const done = (o) => task({ status: "completed", completion_percentage: 100, completed_at: (o.date || "2026-09-21") + "T15:00:00Z", ...o });

test("dates: weeks start on Monday, quarters are calendar quarters", () => {
  assert.deepEqual(D.weekRange("2026-09-26"), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(D.weekRange("2026-09-21"), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(D.weekRange("2026-09-27"), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(D.quarterOf("2026-09-26"), { quarter: 3, year: 2026 });
  assert.deepEqual(D.quarterRange(4, 2026), { start: "2026-10-01", end: "2026-12-31" });
  assert.deepEqual(D.monthRange("2028-02-10"), { start: "2028-02-01", end: "2028-02-29" });
  assert.equal(D.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(D.diffDays("2026-03-01", "2026-04-01"), 31); // across a DST change
  assert.equal(D.formatMinutes(320), "5h 20m");
  assert.equal(D.formatMinutes(45), "45m");
  assert.equal(D.dayOf("2026-09-26T02:00:00Z", "America/Los_Angeles"), "2026-09-25");
});

test("tasks: overdue is derived from the deadline", () => {
  const today = "2026-09-26";
  assert.equal(effectiveStatus(task({ due_date: "2026-09-25" }), today), "overdue");
  assert.equal(effectiveStatus(task({ due_date: "2026-09-26" }), today), "not_started");
  assert.equal(effectiveStatus(done({ due_date: "2026-09-25" }), today), "completed");
  assert.equal(effectiveStatus(task({ due_date: "2026-09-25", status: "cancelled" }), today), "cancelled");
  // Finished late: overdue on the days in between, not after.
  const late = done({ due_date: "2026-09-22", completed_at: "2026-09-24T10:00:00Z" });
  assert.equal(wasOverdueOn(late, "2026-09-23", TZ), true);
  assert.equal(wasOverdueOn(late, "2026-09-24", TZ), false);
});

test("tasks: search and filters", () => {
  const today = "2026-09-26";
  const list = [
    task({ title: "Design logo", category: "Design", priority: "high", due_date: "2026-09-25" }),
    task({ title: "Write copy", notes: "about page", category: "Writing", due_date: "2026-09-28", milestone_id: "m1" }),
    done({ title: "Ship", date: "2026-09-10" }),
  ];
  assert.equal(filterTasks(list, { q: "ABOUT" }, today).length, 1);
  assert.equal(filterTasks(list, { status: "overdue" }, today)[0].title, "Design logo");
  assert.equal(filterTasks(list, { priority: "high" }, today).length, 1);
  assert.equal(filterTasks(list, { category: "Writing" }, today).length, 1);
  assert.equal(filterTasks(list, { milestone: "m1" }, today).length, 1);
  assert.equal(filterTasks(list, { milestone: "none" }, today).length, 2);
  assert.equal(filterTasks(list, { from: "2026-09-15" }, today).length, 2);
  assert.equal(filterTasks(list, { deadline: "next7" }, today)[0].title, "Write copy");
  assert.equal(filterTasks(list, { deadline: "none" }, today)[0].title, "Ship");
  assert.equal(sortTasks(list, today)[0].title, "Design logo");
});

test("tasks: normalize keeps status and percentage consistent", () => {
  const t = normalizeTask({ title: "  x  ", status: "completed", completion_percentage: 20, estimated_minutes: "45", actual_minutes: "" }, "2026-09-26");
  assert.equal(t.title, "x");
  assert.equal(t.completion_percentage, 100);
  assert.equal(t.estimated_minutes, 45);
  assert.equal(t.actual_minutes, null);
  assert.equal(t.date, "2026-09-26");
  assert.throws(() => normalizeTask({ title: " " }, "2026-09-26"));
});

test("scoring: all tasks done on time with priority = 100", () => {
  const tasks = [done({ priority: "high", due_date: "2026-09-21" }), done({})];
  const s = scoreDay(tasks, "2026-09-21", cfg, { today: "2026-09-26", timeZone: TZ });
  assert.equal(s.score, 100);
  assert.equal(s.counts.completed, 2);
  // milestones and time are skipped: no linked tasks, no time logged
  assert.equal(s.components.find((c) => c.key === "time").value, null);
  assert.equal(s.components.find((c) => c.key === "milestones").value, null);
});

test("scoring: worked example from docs/SCORING.md", () => {
  // 4 tasks: urgent done, high done, medium 50% partial, low not started.
  // One due today (the urgent) met. 180 min logged. One older task overdue.
  const day = "2026-09-22";
  const tasks = [
    done({ date: day, priority: "urgent", due_date: day, completed_at: day + "T10:00:00Z", actual_minutes: 90, milestone_id: "m" }),
    done({ date: day, priority: "high", completed_at: day + "T12:00:00Z", actual_minutes: 60 }),
    task({ date: day, priority: "medium", status: "in_progress", completion_percentage: 50, actual_minutes: 30 }),
    task({ date: day, priority: "low" }),
    task({ date: "2026-09-20", due_date: "2026-09-21" }), // overdue on the 22nd
  ];
  const s = scoreDay(tasks, day, cfg, { today: "2026-09-26", timeZone: TZ });
  const v = Object.fromEntries(s.components.map((c) => [c.key, c.value]));
  assert.equal(v.completion, 62.5);   // (1 + 1 + 0.5 + 0) / 4
  assert.equal(v.priority, 80);       // (4 + 3 + 1 + 0) / (4 + 3 + 2 + 1)
  assert.equal(v.deadlines, 100);     // 1 of 1 due today met
  assert.equal(v.milestones, 100);    // 1 of 1 milestone task
  assert.equal(v.time, 75);           // 180 / 240
  // (40*62.5 + 20*80 + 20*100 + 10*100 + 10*75) / 100 = 78.5, minus 5 overdue
  assert.equal(s.base, 78.5);
  assert.equal(s.penalty, 5);
  assert.equal(s.score, 74);
});

test("scoring: empty and future days have no score", () => {
  assert.equal(scoreDay([], "2026-09-21", cfg, { today: "2026-09-26" }).score, null);
  assert.equal(scoreDay([task({ date: "2026-09-30" })], "2026-09-30", cfg, { today: "2026-09-26" }).score, null);
});

test("scoring: overdue penalty is capped", () => {
  const day = "2026-09-25";
  const tasks = [done({ date: day }), ...Array.from({ length: 10 }, () => task({ date: "2026-09-01", due_date: "2026-09-02" }))];
  const s = scoreDay(tasks, day, cfg, { today: "2026-09-26", timeZone: TZ });
  assert.equal(s.penalty, 25);
  assert.equal(s.score, 75);
});

test("scoring: settings override weights and are sanitised", () => {
  const c = resolveScoring({ weights: { completion: 100, priority: 0, deadlines: 0, milestones: 0, time: "abc" }, overduePenalty: -5 });
  assert.equal(c.weights.completion, 100);
  assert.equal(c.weights.time, 10); // invalid -> default
  assert.equal(c.overduePenalty, 0); // clamped
  const s = scoreDay([done({}), task({})], "2026-09-21", c, { today: "2026-09-26" });
  assert.equal(s.score, 50);
  assert.ok(describeFormula(c).join(" ").includes("×100"));
});

test("scoring: week blends average and consistency", () => {
  // Mon-Fri each one task done => every day 100, 5 active days.
  const tasks = ["21", "22", "23", "24", "25"].map((d) => done({ date: "2026-09-" + d }));
  const w = scoreWeek(tasks, "2026-09-24", cfg, { today: "2026-09-27", timeZone: TZ });
  assert.equal(w.score, 100);
  assert.equal(w.active_days, 5);
  assert.equal(w.totals.completion_rate, 100);
  // Only 2 active days, both perfect: 70% * 100 + 30% * (2/5 = 40) = 82
  const w2 = scoreWeek(tasks.slice(0, 2), "2026-09-24", cfg, { today: "2026-09-27", timeZone: TZ });
  assert.equal(w2.score, 82);
  assert.equal(w2.best_day.date, "2026-09-21");
});

test("scoring: needs-improvement days and totals", () => {
  const tasks = [done({ date: "2026-09-21" }), task({ date: "2026-09-22" }), task({ date: "2026-09-22", actual_minutes: 30 })];
  const p = scorePeriod(tasks, "2026-09-21", "2026-09-27", cfg, { today: "2026-09-27", timeZone: TZ });
  assert.deepEqual(p.needs_improvement.map((d) => d.date), ["2026-09-22"]);
  assert.equal(p.totals.total, 3);
  assert.equal(p.totals.minutes, 30);
});

test("scoring: quarter blends weekly average with goal progress", () => {
  const tasks = [done({ date: "2026-07-06" })];
  const goals = [{ quarter: 3, year: 2026, percentage_complete: 80, status: "in_progress" }];
  const q = scoreQuarter(tasks, goals, 3, 2026, cfg, { today: "2026-09-26", timeZone: TZ });
  // Week of Jul 6: day 100, 1 active day of 5 => 0.7*100 + 0.3*20 = 76
  assert.equal(q.average_weekly_score, 76);
  assert.equal(q.goal_progress, 80);
  assert.equal(q.score, 78);
  const noGoals = scoreQuarter(tasks, [], 3, 2026, cfg, { today: "2026-09-26" });
  assert.equal(noGoals.score, 76);
});

test("milestones: progress from tasks mirrors the database", () => {
  const m = { id: "m", progress_mode: "tasks", status: "not_started", target: 1, current_progress: 0 };
  const ts = [done({ milestone_id: "m" }), task({ milestone_id: "m" }), task({ milestone_id: "m", status: "cancelled" })];
  const c = computeMilestone(m, ts);
  assert.equal(c.percentage_complete, 50);
  assert.equal(c.status, "in_progress");
  const all = computeMilestone(m, [done({ milestone_id: "m" })]);
  assert.equal(all.status, "completed");
  const manual = computeMilestone({ id: "x", progress_mode: "manual", status: "in_progress", target: 8, current_progress: 2 }, []);
  assert.equal(manual.percentage_complete, 25);
  const g = computeGoal({ id: "g", progress_mode: "milestones", status: "not_started" },
    [{ goal_id: "g", percentage_complete: 50, status: "in_progress" }, { goal_id: "g", percentage_complete: 100, status: "completed" }]);
  assert.equal(g.percentage_complete, 75);
});

test("milestones: behind-schedule detection", () => {
  const m = { id: "m", start_date: "2026-09-01", deadline: "2026-10-01", percentage_complete: 20, status: "in_progress" };
  assert.equal(milestoneInfo(m, [], "2026-09-26").pace, "behind");
  assert.equal(milestoneInfo({ ...m, percentage_complete: 80 }, [], "2026-09-26").pace, "on_track");
  assert.equal(milestoneInfo({ ...m, deadline: "2026-09-20" }, [], "2026-09-26").pace, "overdue");
});

test("warnings: one per kind, not one per task", () => {
  const today = "2026-09-26";
  const tasks = [task({ due_date: "2026-09-20" }), task({ due_date: "2026-09-21" }), task({ due_date: "2026-09-27" })];
  const w = buildWarnings({ tasks, milestones: [], goals: [], today, cfg });
  assert.equal(w.filter((x) => x.level === "danger").length, 1);
  assert.match(w[0].text, /2 tasks are overdue/);
  assert.match(w[1].text, /due tomorrow/);
  const q = buildWarnings({ tasks: [], milestones: [], goals: [{ quarter: 3, year: 2026, status: "in_progress" }], today, cfg });
  assert.match(q[0].text, /Q3 ends in 4 days/);
});

test("planning: overdue and urgent work comes first within the time budget", () => {
  const today = "2026-09-26";
  const tasks = [
    task({ title: "low", priority: "low", date: today, estimated_minutes: 60 }),
    task({ title: "late", due_date: "2026-09-24", estimated_minutes: 60 }),
    task({ title: "big", priority: "high", date: today, estimated_minutes: 200 }),
    done({ title: "finished", date: today }),
  ];
  const plan = planForDay(tasks, "2026-09-27", cfg, today);
  assert.deepEqual(plan.tasks.map((t) => t.title), ["late", "big"]);
  assert.deepEqual(plan.deferred.map((t) => t.title), ["low"]);
  assert.equal(plan.planned_minutes, 260);
});
test("people: display names use the chosen title; missing choices are asked for", () => {
  assert.equal(displayName({ name: "Ayenew Shiferaw", greeting: "mr" }), "Mr. Ayenew Shiferaw");
  assert.equal(displayName({ name: "Ana", greeting: "dr" }), "Dr. Ana");
  assert.equal(displayName({ name: "Ben", greeting: "none" }), "Ben");
  assert.equal(displayName({ name: "Cara", greeting: null }), "Cara");
  assert.equal(displayName({ name: " ", email: "x@example.com", greeting: "ms" }), "Ms. x@example.com");
  assert.equal(displayName(null), "");
  assert.equal(needsProfile({ name: "Ana", greeting: null }), true);
  assert.equal(needsProfile({ name: "", greeting: "ms" }), true);
  assert.equal(needsProfile({ name: "Ana", greeting: "none" }), false);
  assert.match(greetingOptions("mrs"), /<option value="mrs" selected>Mrs\.<\/option>/);
});
