import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePack, planImport, packRows, caseImages, PACK_KIND, screenshotsPatch } from "../../app/core/project-pack.js";

const base = () => ({
  kind: PACK_KIND, version: 1,
  project: { name: "Ethio School Platform", code: "ESP", status: "good", facts: ["Next.js", ""], links: { repo: "https://github.com/x/y", web: "javascript:alert(1)" },
    checklist: [{ text: "M1", done: true }, { text: "" }] },
  milestones: [
    { title: "M1: App shell", deadline: "2026-10-03", start_date: "2026-10-03", tasks: [{ title: "Sign-in", date: "2026-10-03", status: "completed" }] },
    { title: "M5: Guided demo", deadline: "2026-10-20", tasks: [{ title: "Tour", status: "not_started" }] },
  ],
  caseStudy: { id: "esp", title: "Ethio School Platform", shots: [{ src: "data:image/png;base64,AAAA" }, { src: "https://x/y.png" }],
    flow: { steps: [{ label: "Post", src: "data:image/jpeg;base64,BBBB" }] }, personas: { items: [{ name: "Teacher" }] } },
});

test("a project file is checked and cleaned", () => {
  const p = parsePack(JSON.stringify(base()));
  assert.equal(p.project.name, "Ethio School Platform");
  assert.deepEqual(p.project.facts, ["Next.js"]);
  assert.deepEqual(p.project.links, { repo: "https://github.com/x/y" }); // unsafe link dropped
  assert.equal(p.project.checklist.length, 1);
  assert.equal(p.milestones[1].tasks[0].date, "2026-10-20"); // no date: the milestone's deadline
  assert.equal(p.caseStudy.status, "live");
});

test("files that aren't project files are refused with a plain reason", () => {
  assert.throws(() => parsePack("{not json"), /valid JSON/);
  assert.throws(() => parsePack({ kind: "other" }), /isn't a Locked-in project file/);
  assert.throws(() => parsePack({ kind: PACK_KIND, version: 2 }), /newer version/);
  assert.throws(() => parsePack({ kind: PACK_KIND, version: 1 }), /empty/);
  assert.throws(() => parsePack({ ...base(), milestones: [{ title: "", tasks: [] }] }), /no title/);
  assert.throws(() => parsePack({ ...base(), milestones: [{ title: "No dates", tasks: [{ title: "x" }] }] }), /needs a date/);
});

test("planning: nothing is added twice", () => {
  const p = parsePack(base());
  const fresh = planImport(p, { projects: [], canAddProject: true, milestones: [], cases: [] });
  assert.equal(fresh.project, "add");
  assert.deepEqual(fresh.milestones, { add: 2, skip: 0 });
  assert.equal(fresh.tasks, 2);
  assert.equal(fresh.case, "add");
  assert.equal(fresh.images, 2); // two data: pictures; the https one stays a link
  const again = planImport(p, { projects: [{ name: "ethio school platform" }], canAddProject: true,
    milestones: [{ title: "M1: App shell" }], cases: [{ id: "esp", title: "Something" }] });
  assert.equal(again.project, "exists");
  assert.deepEqual(again.milestones, { add: 1, skip: 1 });
  assert.equal(again.tasks, 1);
  assert.equal(again.case, "exists");
  assert.equal(planImport(p, { projects: null, milestones: [], cases: [] }).project, "no_team");
  assert.equal(planImport(p, { projects: [], canAddProject: false, milestones: [], cases: [] }).project, "no_permission");
});

test("rows: milestones track their tasks; done work counts as done", () => {
  const p = parsePack(base());
  let n = 0;
  const { milestones, tasks } = packRows(p.milestones, () => `id${++n}`, { projectId: "proj" });
  assert.equal(milestones[0].status, "completed");
  assert.equal(milestones[1].status, "not_started");
  assert.ok(milestones.every((m) => m.progress_mode === "tasks"));
  assert.equal(tasks[0].milestone_id, milestones[0].id);
  assert.equal(tasks[0].project_id, "proj");
  assert.equal(tasks[0].completion_percentage, 100);
  assert.ok(tasks[0].completed_at);
  assert.equal(tasks[1].completed_at, null);
  assert.ok(!("project_id" in packRows(p.milestones, () => "x").tasks[0]));
});

test("case images are found in shots, flow steps and persona photos", () => {
  const c = { shots: [{ src: "a" }], flow: { steps: [{ src: "b" }, { src: "" }] }, personas: { items: [{ photo: "c" }, {}] } };
  assert.deepEqual(caseImages(c).map(([o, k]) => o[k]), ["a", "b", "c"]);
});

test("update only the screenshots: pictures and device from the file, your words stay", () => {
  const mine = { title: "Mine", device: "tablet", cardShots: ["a"], flow: { title: "My flow", intro: "Mine", steps: [{ label: "I post", src: "t1" }, { label: "They submit", src: "t2" }] } };
  const file = { title: "Theirs", device: "both", shots: [{ src: "p0" }], cardShots: ["c0", "c1", ""],
    flow: { title: "Their flow", steps: [{ label: "Post", src: "p1" }, { label: "Submit", src: "p2" }, { label: "Grade", src: "p3" }] } };
  const patch = screenshotsPatch(mine, file);
  assert.deepEqual(patch.shots, [{ src: "p0" }]);
  assert.deepEqual(patch.cardShots, ["c0", "c1", ""]);
  assert.deepEqual([patch.device, patch.phone], ["both", true]);
  assert.deepEqual(patch.flow, { title: "My flow", intro: "Mine", steps: [{ label: "I post", src: "p1" }, { label: "They submit", src: "p2" }, { label: "Grade", src: "p3" }] });
  assert.equal(patch.title, undefined, "no text from the file");
  // A file without card screens, device or flow leaves yours alone.
  assert.deepEqual(screenshotsPatch(mine, { shots: [] }), { shots: [] });
  // No flow of your own yet: the file's.
  assert.deepEqual(screenshotsPatch({}, file).flow.steps.map((s) => s.label), ["Post", "Submit", "Grade"]);
});
