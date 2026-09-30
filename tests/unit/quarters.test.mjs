import test from "node:test";
import assert from "node:assert/strict";
import { yearConfig, quarterAt, quarterBy, shiftQuarter, goalInQuarter, quarterOfGoal, storageQuarter } from "../../app/core/quarters.js";

const plan = yearConfig({ start: "2026-09-22", end: "2027-09-23" });
const r = (q) => [q.quarter, q.start, q.end];

test("plan year: Q1 Sep 22 – Dec 31, then calendar quarters, Q4 ends on launch day", () => {
  assert.deepEqual(r(quarterAt("2026-09-30", plan)), [1, "2026-09-22", "2026-12-31"], "today is Q1");
  assert.deepEqual(r(quarterAt("2027-02-10", plan)), [2, "2027-01-01", "2027-03-31"]);
  assert.deepEqual(r(quarterAt("2027-05-01", plan)), [3, "2027-04-01", "2027-06-30"]);
  assert.deepEqual(r(quarterAt("2027-09-23", plan)), [4, "2027-07-01", "2027-09-23"], "launch day is the last day");
  assert.equal(quarterAt("2026-09-30", plan).title, "Q1");
  assert.equal(quarterAt("2026-09-30", plan).long, "Q1 · Sep 22 – Dec 31, 2026");
  assert.equal(quarterAt("2026-09-30", plan).yearLabel, "2026–27");
});

test("plan year: the next year starts the day after, the one before ends the day before", () => {
  assert.deepEqual(r(quarterAt("2027-09-24", plan)), [1, "2027-09-24", "2027-12-31"]);
  assert.equal(quarterAt("2027-09-24", plan).year, 2027);
  assert.deepEqual(r(quarterAt("2026-09-21", plan)), [4, "2026-07-01", "2026-09-21"]);
});

test("plan year: pick and step through quarters", () => {
  assert.deepEqual(r(quarterBy(4, 2026, plan)), [4, "2027-07-01", "2027-09-23"]);
  const q1 = quarterBy(1, 2026, plan);
  assert.deepEqual(r(shiftQuarter(q1, 1, plan)), [2, "2027-01-01", "2027-03-31"]);
  assert.deepEqual(r(shiftQuarter(q1, -1, plan)), [4, "2026-07-01", "2026-09-21"]);
  assert.deepEqual(r(shiftQuarter(quarterBy(4, 2026, plan), 1, plan)), [1, "2027-09-24", "2027-12-31"]);
});

test("plan year: goals stored by calendar quarter land in the right plan quarter", () => {
  const foundation = { quarter: 4, year: 2026 }, shipGexi = { quarter: 3, year: 2027 };
  assert.ok(goalInQuarter(foundation, quarterAt("2026-09-30", plan)), "Q4 2026 (calendar) is your Q1");
  assert.ok(!goalInQuarter({ quarter: 3, year: 2026 }, quarterAt("2026-09-30", plan)), "calendar Q3 2026 isn't");
  assert.equal(quarterOfGoal(shipGexi, plan).quarter, 4);
  assert.deepEqual(storageQuarter(quarterAt("2026-09-30", plan)), { quarter: 4, year: 2026 }, "a new Q1 goal is stored as calendar Q4 2026");
  assert.deepEqual(storageQuarter(quarterBy(4, 2026, plan)), { quarter: 3, year: 2027 });
});

test("no plan year: calendar quarters", () => {
  assert.equal(yearConfig(null), null);
  assert.equal(yearConfig({ start: "2027-01-01", end: "2026-01-01" }), null, "end before start");
  assert.deepEqual(r(quarterAt("2026-09-30", null)), [3, "2026-07-01", "2026-09-30"]);
  assert.equal(quarterAt("2026-09-30", null).title, "Q3 2026");
  assert.deepEqual(r(shiftQuarter(quarterAt("2026-12-01", null), 1, null)), [1, "2027-01-01", "2027-03-31"]);
  assert.ok(goalInQuarter({ quarter: 3, year: 2026 }, quarterAt("2026-09-30", null)));
});
