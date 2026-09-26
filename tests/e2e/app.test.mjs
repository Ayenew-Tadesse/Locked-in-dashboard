// End-to-end tests in a real browser, against demo mode (?demo=1, in-memory
// data) so they need no database. Run: npm run test:e2e
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {
    const globalRoot = execSync("npm root -g").toString().trim();
    return createRequire(globalRoot + "/")("playwright");
  }
}

const PORT = 5000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
let server, browser, pw;

before(async () => {
  pw = await loadPlaywright();
  server = spawn(process.execPath, ["scripts/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 600));
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(hash = "", viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "?demo=1" + (hash ? "#/" + hash : ""));
  await page.waitForSelector("#li-nav .li-nav-link");
  page.errors = errors;
  return page;
}
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function shift(key, n) { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const row = (page, title) => page.locator(".li-task", { has: page.locator(".li-task-title", { hasText: title }) });

test("create a task with every field, then edit it", async () => {
  const page = await open("today");
  await page.click(".li-view-head [data-new-task]");
  const f = page.locator("#li-modal form");
  await f.locator("[name=title]").fill("E2E: write launch post");
  await f.locator("[name=description]").fill("For the blog");
  await f.locator("[name=due_date]").fill(shift(today(), 3));
  await f.locator("[name=priority]").selectOption("high");
  await f.locator("[name=category]").fill("Writing");
  await f.locator("[name=milestone_id]").selectOption({ label: "Launch personal portfolio" });
  await f.locator("[name=estimated_minutes]").fill("60");
  await f.locator("[name=actual_minutes]").fill("25");
  await f.locator("[name=completion_percentage]").fill("40");
  await f.locator("[name=notes]").fill("Draft first");
  await f.locator("button[type=submit]").click();
  const r = row(page, "E2E: write launch post");
  await r.waitFor();
  const meta = await r.locator(".li-task-meta").innerText();
  assert.match(meta, /IN PROGRESS/i, "40% moves the status to In Progress");
  assert.match(meta, /HIGH/i);
  assert.match(meta, /Writing/);
  assert.match(meta, /Launch personal portfolio/);
  assert.match(meta, /25m \/ 1h/);
  assert.match(meta, /40%/);
  assert.match(await r.locator(".li-task-notes").innerText(), /Draft first/);

  await r.locator(".li-task-title").click();
  await page.locator("#li-modal [name=title]").fill("E2E: publish launch post");
  await page.locator("#li-modal [name=priority]").selectOption("urgent");
  await page.locator("#li-modal button[type=submit]").click();
  await row(page, "E2E: publish launch post").waitFor();
  assert.match(await row(page, "E2E: publish launch post").innerText(), /URGENT/i);
  assert.equal(await row(page, "E2E: write launch post").count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("complete, reopen and change status; scores and the original checklist update", async () => {
  const page = await open("today");
  const scoreBefore = await page.locator(".li-tile", { hasText: "Daily score" }).locator(".li-tile-value").innerText();
  const r = row(page, "Test keyboard handling on iOS");
  await r.locator("[data-act=toggle]").click();
  await page.waitForFunction(() => document.querySelector('.li-task.st-completed .li-task-title')?.textContent);
  assert.match(await row(page, "Test keyboard handling on iOS").getAttribute("class"), /st-completed/);
  const scoreAfter = await page.locator(".li-tile", { hasText: "Daily score" }).locator(".li-tile-value").innerText();
  assert.ok(parseInt(scoreAfter) > parseInt(scoreBefore), `score rose (${scoreBefore} -> ${scoreAfter})`);
  // The original "Today's checklist" card reflects it too (3 of 4 done).
  assert.equal(await page.locator("#today-progress").innerText(), "3/4");

  await row(page, "Test keyboard handling on iOS").locator("select[data-act=status]").selectOption("in_progress");
  await page.waitForFunction(() => [...document.querySelectorAll(".li-task.st-in_progress .li-task-title")].some((e) => e.textContent.includes("keyboard")));
  await row(page, "Test keyboard handling on iOS").locator("select[data-act=status]").selectOption("not_started");
  await page.waitForFunction(() => [...document.querySelectorAll(".li-task.st-not_started .li-task-title")].some((e) => e.textContent.includes("keyboard")));
  await page.close();
});

test("a task with a past deadline becomes overdue automatically, and can be moved to today", async () => {
  const page = await open("today");
  await page.click(".li-view-head [data-new-task]");
  await page.locator("#li-modal [name=title]").fill("E2E: late thing");
  await page.locator("#li-modal [name=date]").fill(shift(today(), -3));
  await page.locator("#li-modal [name=due_date]").fill(shift(today(), -1));
  await page.locator("#li-modal button[type=submit]").click();
  const r = row(page, "E2E: late thing");
  await r.waitFor();
  assert.match(await r.getAttribute("class"), /st-overdue/);
  assert.match(await r.innerText(), /OVERDUE/i);
  assert.match(await r.innerText(), /yesterday/);
  await page.goto(BASE + "?demo=1#/tasks?status=overdue");
  await page.waitForSelector(".li-filters");
  assert.equal(await row(page, "E2E: late thing").count(), 1, "shows in the overdue filter");
  assert.ok((await page.locator(".li-task:not(.st-overdue)").count()) === 0, "filter shows only overdue tasks");
  await page.close();
});

test("delete a task", async () => {
  const page = await open("today");
  await row(page, "Stand-up notes").locator("[data-act=delete]").click();
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".li-task-title")].some((e) => e.textContent === "Stand-up notes"));
  await page.close();
});

test("milestones: create, link tasks, automatic completion", async () => {
  const page = await open("milestones");
  await page.click("#li-add-ms");
  await page.locator("#li-modal [name=title]").fill("E2E milestone");
  await page.locator("#li-modal [name=deadline]").fill(shift(today(), 30));
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForSelector(".li-ms-progress.big");
  assert.match(await page.locator(".li-dl").innerText(), /0 total/);
  for (const t of ["E2E ms task A", "E2E ms task B"]) {
    await page.click(".li-card-head [data-new-task]");
    await page.locator("#li-modal [name=title]").fill(t);
    await page.locator("#li-modal button[type=submit]").click();
    await row(page, t).waitFor();
  }
  assert.match(await page.locator(".li-dl").innerText(), /2 total · 0 completed · 2 remaining/);
  await row(page, "E2E ms task A").locator("[data-act=toggle]").click();
  await page.waitForFunction(() => document.querySelector(".li-ms-progress.big > b").textContent === "50%");
  await row(page, "E2E ms task B").locator("[data-act=toggle]").click();
  await page.waitForFunction(() => document.querySelector(".li-ms-progress.big > b").textContent === "100%");
  assert.match(await page.locator(".li-dl").innerText(), /Completed/);
  await page.goto(BASE + "?demo=1#/milestones?show=done");
  await page.waitForSelector(".li-ms-card");
  assert.match(await page.locator(".li-ms-grid").innerText(), /E2E milestone/);
  await page.close();
});

test("calendar: click a date, see its tasks, add one", async () => {
  const page = await open("calendar");
  const day = shift(today(), 1);
  await page.click(`.li-cal [data-day="${day}"]`);
  await page.waitForFunction((d) => document.querySelector(`.li-cal [data-day="${d}"]`)?.classList.contains("selected"), day);
  assert.match(await page.locator("#li-cal-day").innerText(), /Portfolio: add contact form/);
  await page.locator("#cal-quick input[name=title]").fill("E2E calendar task");
  await page.locator("#cal-quick button[type=submit]").click();
  await row(page, "E2E calendar task").waitFor();
  assert.match(await page.locator(`.li-cal [data-day="${day}"]`).innerText(), /E2E calendar task/);
  await page.close();
});

test("week navigation and weekly numbers", async () => {
  const page = await open("week");
  const title = await page.locator(".li-h2").innerText();
  await page.click('a[aria-label="Previous week"]');
  await page.waitForFunction((t) => document.querySelector(".li-h2").textContent !== t, title);
  assert.ok((await page.locator(".li-bc-col").count()) === 7);
  assert.match(await page.locator(".li-view").innerText(), /best day/i);
  await page.click('a[aria-label="Next week"]');
  await page.waitForFunction((t) => document.querySelector(".li-h2").textContent === t, title);
  await page.close();
});

test("quarter view: switch quarters, add a goal with progress", async () => {
  const page = await open("quarter");
  await page.click("#li-add-goal");
  await page.locator("#li-modal [name=title]").fill("E2E goal");
  await page.locator("#li-modal [name=target]").fill("10");
  await page.locator("#li-modal [name=current_progress]").fill("8");
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector(".li-goals").textContent.includes("E2E goal"));
  const goal = page.locator(".li-goals li", { hasText: "E2E goal" });
  assert.match(await goal.innerText(), /80%/);
  assert.match(await goal.innerText(), /████████░░/);
  await page.click('.li-nav-btns a:text("Q1")');
  await page.waitForFunction(() => document.querySelector(".li-h2").textContent.startsWith("Q1"));
  await page.close();
});

test("search and filters combine", async () => {
  const page = await open("tasks");
  await page.fill(".li-search", "portfolio");
  await page.waitForFunction(() => location.hash.includes("q=portfolio"));
  const titles = await page.locator(".li-task-title").allInnerTexts();
  assert.ok(titles.length > 0);
  await page.selectOption("#li-filters [name=priority]", "high");
  await page.waitForFunction(() => location.hash.includes("priority=high"));
  const metas = await page.locator(".li-task-meta").allInnerTexts();
  assert.ok(metas.every((m) => /HIGH/i.test(m)), "only high priority");
  await page.click("text=Clear filters");
  await page.waitForFunction(() => location.hash === "#/tasks");
  await page.close();
});

test("settings: the scoring formula is visible and editable; API tokens are shown once", async () => {
  const page = await open("settings");
  assert.match(await page.locator(".li-formula").innerText(), /task completion ×40/);
  await page.fill('[name="weights.completion"]', "55");
  await page.click("#li-scoring-form button[type=submit]");
  await page.waitForFunction(() => document.querySelector(".li-formula").textContent.includes("×55"));
  await page.click("#li-new-token");
  await page.locator("#li-modal button[type=submit]").click();
  const token = await page.locator("#li-token-value").inputValue();
  assert.match(token, /^lki_[A-Za-z0-9_-]{40,}$/);
  await page.locator("#li-modal [data-close]").first().click();
  await page.waitForSelector(".li-tokens");
  const list = await page.locator(".li-tokens").innerText();
  assert.ok(list.includes(token.slice(0, 10)) && !list.includes(token), "only the prefix is listed");
  await page.close();
});

test("every view fits a phone screen without sideways scrolling", async () => {
  for (const v of ["", "today", "tasks", "calendar", "week", "quarter", "milestones", "analytics", "settings"]) {
    const page = await open(v, { width: 375, height: 800 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${v || "overview"} overflows by ${overflow}px`);
    assert.deepEqual(page.errors, [], `${v || "overview"} has no errors`);
    await page.close();
  }
  const page = await open("today", { width: 375, height: 800 });
  await page.click(".li-nav-add");
  const modal = await page.locator("#li-modal .modal").boundingBox();
  assert.ok(modal.width <= 375, "task form fits the phone");
  await page.close();
});

test("?demo=history previews the original dashboard's tracking history", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "?demo=history#/tasks");
  await page.waitForSelector("#li-nav .li-nav-link");
  assert.equal(await page.locator(".li-h2").innerText(), "14 tasks", "the Sep 23-25 checklist items");
  assert.equal(await row(page, "Rename the app from Hid-Go to Guxo Flights").count(), 1);
  assert.equal(await page.locator(".li-task.st-completed").count(), 14);
  await page.goto(BASE + "?demo=history#/milestones?show=all");
  await page.waitForFunction(() => document.querySelector(".li-h2")?.textContent === "23 total");
  await page.goto(BASE + "?demo=history#/quarter?q=4&y=2026");
  await page.waitForSelector(".li-goals");
  assert.match(await page.locator(".li-goals").innerText(), /33%[\s\S]*Q1 roadmap: Build the shared foundation/);
  await page.goto(BASE + "?demo=history#/calendar?month=2026-09&day=2026-09-24");
  await page.waitForSelector("#li-cal-day");
  assert.match(await page.locator("#li-cal-day").innerText(), /Megabus|megabus/);
  assert.match(await page.locator("#footnote").innerText(), /tracking history/);
  assert.deepEqual(errors, []);
  await page.close();
});

test("without a database the original dashboard runs unchanged", async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#li-nav .li-nav-link").count(), 0, "no app navigation");
  assert.ok(await page.locator("#gate").isVisible(), "the original password screen is shown");
  assert.equal(await page.evaluate(() => typeof window.LockedInHooks), "undefined");
  assert.deepEqual(errors, []);
  await page.close();
});
