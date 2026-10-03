import { test } from "node:test";
import assert from "node:assert/strict";
import { casesOfProject, milestonesOfProject, tasksOfProject, planProjectSync, planProjectDelete, describeSync, caseFromProject } from "../../app/core/project-links.js";

const before = { id: "p1", name: "Ethio School Platform", description: "One platform for the school.", links: { web: "https://ethio-school-platform.vercel.app" } };
const cases = [
  { id: "esp", title: "Ethio School Platform", project: "Ethio School Platform", liveUrl: "https://ethio-school-platform.vercel.app/login", cardDesc: "One platform for the school." },
  { id: "own", title: "Something", project: "ethio school platform", liveUrl: "https://elsewhere.example/app", cardDesc: "My own words." },
  { id: "byTitle", title: "Ethio School Platform", liveUrl: "" },
  { id: "other", title: "Hid-Go", project: "Hid-Go", liveUrl: "https://x.example" },
];
const milestones = [{ id: "m1", category: "Ethio School Platform" }, { id: "m2", category: "Portfolio" }];
const tasks = [{ id: "t1", category: "Ethio School Platform" }, { id: "t2", project_id: "p1", category: "Build" }, { id: "t3", category: "Hid-Go" }];

test("what belongs to a project", () => {
  assert.deepEqual(casesOfProject(cases, before).map((c) => c.id), ["esp", "own", "byTitle"]);
  assert.deepEqual(milestonesOfProject(milestones, before).map((m) => m.id), ["m1"]);
  assert.deepEqual(tasksOfProject(tasks, before).map((t) => t.id), ["t1", "t2"]);
});

test("rename: case studies stay linked; milestone and task categories follow", () => {
  const after = { ...before, name: "Ethio School" };
  const plan = planProjectSync(before, after, { cases, milestones, tasks });
  assert.deepEqual(plan.cases.map((x) => [x.id, x.patch.project]), [["esp", "Ethio School"], ["own", "Ethio School"], ["byTitle", "Ethio School"]]);
  assert.deepEqual(plan.milestones, [{ id: "m1", category: "Ethio School" }]);
  assert.deepEqual(plan.tasks, [{ id: "t1", category: "Ethio School" }]);
  assert.equal(describeSync(plan), "3 case studies, 1 milestone and 1 task");
});

test("web link: Try the app follows, keeping its path; other links are left alone", () => {
  const after = { ...before, links: { web: "https://school.example.com/" } };
  const plan = planProjectSync(before, after, { cases });
  const byId = Object.fromEntries(plan.cases.map((x) => [x.id, x.patch]));
  assert.equal(byId.esp.liveUrl, "https://school.example.com/login");
  assert.equal(byId.own, undefined, "a link to somewhere else stays");
  assert.equal(byId.byTitle, undefined, "an empty link stays empty when the project already had one");
  assert.deepEqual(plan.milestones, [], "no rename, nothing else changes");
});

test("first web link fills an empty Try the app", () => {
  const noLink = { ...before, links: {} };
  const plan = planProjectSync(noLink, { ...noLink, links: { web: "https://new.example" } }, { cases: [{ id: "c", project: before.name, liveUrl: "" }] });
  assert.deepEqual(plan.cases, [{ id: "c", patch: { liveUrl: "https://new.example" } }]);
});

test("description: the card follows unless you wrote your own", () => {
  const plan = planProjectSync(before, { ...before, description: "A school platform for Ethiopia." }, { cases });
  const byId = Object.fromEntries(plan.cases.map((x) => [x.id, x.patch]));
  assert.equal(byId.esp.cardDesc, "A school platform for Ethiopia.");
  assert.equal(byId.own, undefined);
  assert.equal(byId.byTitle.cardDesc, "A school platform for Ethiopia.", "an empty card description is filled");
});

test("nothing changed: nothing to do", () => {
  assert.deepEqual(planProjectSync(before, { ...before }, { cases, milestones, tasks }), { cases: [], milestones: [], tasks: [] });
});

test("delete: case studies are unlinked, not removed", () => {
  assert.deepEqual(planProjectDelete(before, { cases }).map((x) => x.id), ["esp", "own", "byTitle"]);
  assert.ok(planProjectDelete(before, { cases }).every((x) => x.patch.project === ""));
});

test("a case study started from a project", () => {
  const c = caseFromProject({ name: "Gexi", category: "Shopping", description: "Shop locally.", links: { web: "https://gexi.example" }, facts: ["A", "B"] });
  assert.equal(c.project, "Gexi");
  assert.equal(c.liveUrl, "https://gexi.example");
  assert.equal(c.cardDesc, "Shop locally.");
  assert.equal(c.id, "");
});
