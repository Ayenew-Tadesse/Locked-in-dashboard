import test from "node:test";
import assert from "node:assert/strict";
import { projectPlan } from "../../app/core/insights.js";
import { yearConfig, quarterAt } from "../../app/core/quarters.js";

const today = "2026-09-30";
const quarter = quarterAt(today, yearConfig({ start: "2026-09-22", end: "2027-09-23" })); // Sep 22 – Dec 31: 9% gone
const goal = { id: "g1", title: "Build the shared foundation", quarter: 4, year: 2026, status: "in_progress", percentage_complete: 33 };
const ms = (over) => ({ id: "m", title: "Wire state management", goal_id: "g1", category: "Guxo Flights", status: "in_progress", start_date: "2026-09-21", deadline: "2026-12-31", percentage_complete: 20, ...over });
const plan = (milestones, goals = [goal], project = { name: "Guxo Flights", code: "FLT" }) => projectPlan(project, { milestones, goals, tasks: [], today, quarter });

test("project plan: green when its milestones and quarterly goal keep pace", () => {
  const p = plan([ms({ id: "a" }), ms({ id: "b", status: "completed", percentage_complete: 100, deadline: "2026-09-29" })]);
  assert.equal(p.state, "on_plan");
  assert.equal(p.milestones.length, 2);
  assert.equal(p.goals[0].behind, false);
});

test("project plan: red when a started milestone is behind or past its deadline", () => {
  const behind = plan([ms({ id: "a", start_date: "2026-09-01", deadline: "2026-10-10", percentage_complete: 10 })]);
  assert.equal(behind.state, "behind");
  assert.match(behind.reason, /^Behind: ".+" is at 10% of \d+% expected/);
  const overdue = plan([ms({ id: "a", deadline: "2026-09-29", percentage_complete: 60 })]);
  assert.equal(overdue.state, "behind");
  assert.match(overdue.reason, /passed its deadline at 60%/);
});

test("project plan: red when this quarter's goal is behind the time gone", () => {
  const lateQuarter = quarterAt("2026-12-01", yearConfig({ start: "2026-09-22", end: "2027-09-23" }));
  const p = projectPlan({ name: "Guxo Flights" }, { milestones: [ms({ id: "a", start_date: "2026-11-25", deadline: "2026-12-30", percentage_complete: 20 })], goals: [goal], tasks: [], today: "2026-12-01", quarter: lateQuarter });
  assert.equal(p.state, "behind");
  assert.match(p.reason, /goal "Build the shared foundation" is at 33% with \d+% of the quarter gone/);
});

test("project plan: grey when nothing has started yet, and the project's own status without milestones", () => {
  const later = plan([ms({ id: "a", category: "Gexi", start_date: "2027-04-01", deadline: "2027-06-30", percentage_complete: 0 })], [], { name: "Gexi" });
  assert.equal(later.state, "not_started");
  assert.equal(later.reason, "Starts Apr 1, 2027");
  assert.equal(plan([ms({ id: "a" })], [goal], { name: "Dashboard" }).state, "manual", "no milestones in its category");
  assert.equal(plan([ms({ id: "a", category: "flt" })]).state, "on_plan", "matched by the project's code too, any case");
});
