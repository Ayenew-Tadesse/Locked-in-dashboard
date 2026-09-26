// End-to-end tests in a real browser, against demo mode (?demo=1, in-memory
// data) so they need no database. Run: npm run test:e2e
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Previews sit behind the original password screen. Tests unlock it the way
// a remembered device does (the stored fingerprint of the password).
const ACCESS_HASH = /var ACCESS_HASH = "([0-9a-f]*)";/.exec(readFileSync(new URL("../../index.html", import.meta.url), "utf8"))[1];
async function unlockedPage(opts) {
  const page = await browser.newPage(opts);
  await page.addInitScript((h) => { try { sessionStorage.setItem("lockedin_unlock", h); } catch { /* ignore */ } }, ACCESS_HASH);
  return page;
}

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
  const page = await unlockedPage({ viewport });
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
// Completing a task asks for a Learning log; tests that don't need it skip it.
async function skipLearningLog(page) {
  await page.waitForSelector("#li-modal .li-learning, #li-modal textarea[name=learning_changed]");
  await page.locator("#li-modal .li-form-actions [data-close]").click();
  await page.waitForSelector("#li-modal", { state: "detached" });
}
// Visible rows only: the Overview's Tasks card stays in the page (hidden) on other tabs.
const row = (page, title) => page.locator(".li-task:visible", { has: page.locator(".li-task-title", { hasText: title }) });

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
  await page.click('#li-modal [data-detail="edit"]');
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
  await skipLearningLog(page);
  await page.waitForFunction(() => document.querySelector('.li-task.st-completed .li-task-title')?.textContent);
  assert.match(await row(page, "Test keyboard handling on iOS").getAttribute("class"), /st-completed/);
  const scoreAfter = await page.locator(".li-tile", { hasText: "Daily score" }).locator(".li-tile-value").innerText();
  assert.ok(parseInt(scoreAfter) > parseInt(scoreBefore), `score rose (${scoreBefore} -> ${scoreAfter})`);
  // The Overview's Tasks card reflects it too (3 of 4 done).
  // (Switch tabs in-page: reloading would reset the demo data.)
  await page.click('#li-nav a[href="#/"]');
  await page.waitForSelector("#li-tasks-card:not([hidden]) .today-progress");
  assert.equal(await page.locator("#li-tasks-card .today-progress").innerText(), "3/4");
  await page.click('#li-nav a[href="#/today"]');
  await row(page, "Test keyboard handling on iOS").waitFor();

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
  await skipLearningLog(page);
  await page.waitForFunction(() => document.querySelector(".li-ms-progress.big > b").textContent === "50%");
  await row(page, "E2E ms task B").locator("[data-act=toggle]").click();
  await skipLearningLog(page);
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
  const page = await open("", { width: 375, height: 800 });
  await page.click(".li-tile-add");
  const modal = await page.locator("#li-modal .modal").boundingBox();
  assert.ok(modal.width <= 375, "task form fits the phone");
  await page.close();
});

test("?demo=history previews the original dashboard's tracking history", async () => {
  const page = await unlockedPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "?demo=history#/tasks");
  await page.waitForSelector("#li-nav .li-nav-link");
  // The Sep 23-25 history plus the year plan's daily tickets (Tasks page shows 30 days either side by default: all).
  assert.equal(await row(page, "Rename the app from Hid-Go to Guxo Flights").count(), 1);
  assert.equal(await page.locator(".li-task.st-completed:visible").count(), 14, "history tasks are done");
  assert.equal(await row(page, "Map the booking flow and choose a state library").count(), 1, "the plan's first ticket");
  await page.goto(BASE + "?demo=history#/milestones?show=all");
  await page.waitForFunction(() => document.querySelector(".li-h2")?.textContent === "23 total");
  await page.goto(BASE + "?demo=history#/quarter?q=4&y=2026");
  await page.waitForSelector(".li-goals");
  assert.match(await page.locator(".li-goals").innerText(), /33%[\s\S]*Build the shared foundation/);
  await page.goto(BASE + "?demo=history#/calendar?month=2026-09&day=2026-09-24");
  await page.waitForSelector("#li-cal-day");
  assert.match(await page.locator("#li-cal-day").innerText(), /Megabus|megabus/);
  assert.match(await page.locator("#footnote").innerText(), /tracking history/);
  assert.deepEqual(errors, []);
  await page.close();
});

test("Overview layout: quote above the tabs, trimmed tabs, Tasks card, Settings in the footer", async () => {
  const requests = [];
  const page = await unlockedPage({ viewport: { width: 1280, height: 900 } });
  page.on("request", (r) => requests.push(r.url()));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "?demo=1");
  await page.waitForSelector("#li-nav .li-nav-link");
  // Every app file loads by its version-stamped address (fresh after each update).
  const appFiles = requests.filter((u) => /\/app\/.+\.(js|css)/.test(u));
  assert.ok(appFiles.length > 20, "app files requested");
  assert.deepEqual(appFiles.filter((u) => !/\?v=[0-9a-f]{10}$/.test(u)), [], "all app files are version-stamped");
  const nav = await page.locator("#li-nav .li-nav-link").allInnerTexts();
  assert.deepEqual(nav, ["Overview", "Today", "Calendar", "Milestones", "Analytics", "Team"], "the preview account owns a team");
  const quoteBottom = (await page.locator("#daily-quote").boundingBox()).y + (await page.locator("#daily-quote").boundingBox()).height;
  assert.ok(quoteBottom <= (await page.locator("#li-nav").boundingBox()).y, "quote sits above the tabs");
  assert.ok(!(await page.locator("#today-card").isVisible()), "Today's checklist is gone");
  assert.ok(!(await page.locator("#week-card").isVisible()), "the Your score (rings) card is gone");
  assert.equal(await page.locator("#li-overview .card-label", { hasText: "Deadlines" }).count(), 0, "the Deadlines card is gone");
  assert.equal(await page.locator("#li-overview .card-label", { hasText: "Milestones" }).count(), 0, "the Milestones card is gone");
  // New task is the first tile, before Today's progress, and opens the form.
  const tiles = await page.locator("#li-overview .li-kpis .li-tile-label").allInnerTexts();
  assert.deepEqual(tiles.slice(0, 2).map((t) => t.toLowerCase()), ["new task", "today's progress"]);
  assert.equal(await page.locator("#li-nav button").count(), 0, "no New task button in the tab row");
  await page.click(".li-tile-add");
  await page.waitForSelector("#li-modal [name=title]");
  await page.locator("#li-modal [data-close]").first().click();
  const card = page.locator("#li-tasks-card");
  const colTop = (await page.locator(".dash-col-a").boundingBox()).y;
  assert.ok(Math.abs((await card.boundingBox()).y - colTop) < 2, "Tasks card leads the left column");
  // Day view: today's tasks; add one from the card.
  assert.match(await card.locator(".today-progress").innerText(), /^2\/4$/);
  await card.locator("input[name=title]").fill("E2E card task");
  await card.locator("button[type=submit]").click();
  await page.waitForFunction(() => document.querySelector("#li-tasks-card .today-progress").textContent === "2/5");
  // Week / Month / Quarter switch the period and the completion level.
  for (const p of ["week", "month", "quarter"]) {
    await card.locator(`[data-period=${p}]`).click();
    await page.waitForFunction((p) => document.querySelector(`#li-tasks-card [data-period=${p}]`).getAttribute("aria-pressed") === "true", p);
    assert.match(await card.locator(".li-tc-progress").innerText(), /% complete/);
  }
  assert.equal(await card.locator('a[href="#/quarter"]').count(), 1, "quarter view link");
  // Daily report opens from the card.
  await card.locator("[data-report]").click();
  assert.ok(await page.locator("#report-card").isVisible());
  // Settings lives in the footer, on other pages too.
  await page.click('#li-footer-links a[href="#/settings"]');
  await page.waitForSelector(".li-formula");
  assert.ok(await page.locator("#daily-quote").isVisible(), "quote stays on other pages");
  assert.ok(await page.locator('#li-footer-links a[href="#/settings"]').isVisible());
  await page.close();
});

test("year plan: tickets explain how it works; completing one asks for a learning log", async () => {
  const page = await unlockedPage({ viewport: { width: 1280, height: 900 } });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "?demo=history#/calendar?month=2026-09&day=2026-09-28");
  await page.waitForSelector("#li-cal-day");
  const r = row(page, "Map the booking flow and choose a state library");
  await r.locator(".li-task-title").click();
  const ticket = page.locator("#li-modal .li-ticket");
  await ticket.waitFor();
  for (const h of ["Goal", "How it works", "Steps", "Done when"]) assert.match(await ticket.innerText(), new RegExp(h, "i"));
  assert.match(await ticket.innerText(), /Zustand/);
  assert.match(await page.locator("#li-modal .eyebrow").innerText(), /state management/i, "ticket names its milestone");
  // Complete from the ticket: the learning log opens.
  await page.click('#li-modal [data-detail="toggle"]');
  await page.waitForSelector("#li-modal textarea[name=learning_changed]");
  await page.fill("#li-modal [name=learning_changed]", "Wrote docs/booking-state.md");
  await page.fill("#li-modal [name=learning_how]", "Listed each screen's data");
  await page.fill("#li-modal [name=learning_solved]", "Know the data shape before coding");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  assert.match(await r.getAttribute("class"), /st-completed/);
  await r.locator(".li-task-title").click();
  assert.match(await page.locator("#li-modal .li-ticket").innerText(), /Know the data shape before coding/, "log shown on the ticket");
  await page.close();
});

test("daily report: Download PDF includes what changed, how, the problem solved and the day's commits", async () => {
  const page = await unlockedPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    if (/\/commits\/[0-9a-f]+/.test(url)) return route.fulfill({ json: { files: [{ filename: "src/store/booking.ts", status: "added", additions: 42, deletions: 0 }] } });
    return route.fulfill({ json: [{ sha: "a1b2c3d4e5f6", commit: { message: "Add the booking store", author: { date: new Date().toISOString() } } }] });
  });
  await page.goto(BASE + "?demo=1#/today");
  await page.waitForSelector("#li-nav .li-nav-link");
  const r = row(page, "Test keyboard handling on iOS");
  await r.locator("[data-act=toggle]").click();
  await page.fill("#li-modal [name=learning_changed]", "Screens move up with the keyboard");
  await page.fill("#li-modal [name=learning_how]", "KeyboardAvoidingView per screen");
  await page.fill("#li-modal [name=learning_solved]", "Inputs were hidden behind the keyboard on iOS");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  // Open the Daily report from the Overview's Tasks card, then download.
  await page.click('#li-nav a[href="#/"]');
  await page.click("#li-tasks-card [data-report]");
  await page.waitForSelector("#li-report-pdf");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#li-report-pdf")]);
  assert.match(download.suggestedFilename(), /^locked-in-daily-report-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdf = readFileSync(await download.path()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-"), "a real PDF");
  for (const s of ["Test keyboard handling on iOS", "What was modified", "Screens move up with the keyboard",
    "How it was modified", "KeyboardAvoidingView per screen", "What problem was solved",
    "Inputs were hidden behind the keyboard on iOS", "Add the booking store", "src/store/booking.ts"]) {
    assert.ok(pdf.includes(s), `PDF contains "${s}"`);
  }
  await page.close();
});

test("team: the owner sees everyone's progress, assigns tasks and invites colleagues", async () => {
  const page = await open("today");
  // Colleagues' tasks never mix into your own Today.
  assert.equal(await page.locator("#li-view .li-task:visible").filter({ hasText: "(sample)" }).count(), 0);
  const tabs = await page.locator("#li-nav .li-nav-link").allInnerTexts();
  assert.deepEqual(tabs, ["Overview", "Today", "Calendar", "Milestones", "Analytics", "Team"], "owner gets a Team tab");
  await page.click('#li-nav a[href="#/team"]');
  await page.waitForSelector(".li-team-table");
  const rows = await page.locator(".li-team-table tbody tr").allInnerTexts();
  assert.equal(rows.length, 3, "owner + two colleagues");
  assert.ok(rows.some((r) => r.includes("Ana (sample)")) && rows.some((r) => r.includes("Ben (sample)")));
  // Assign a task to Ana from her row.
  await page.locator(".li-team-table tr", { hasText: "Ana (sample)" }).locator("[data-assign]").click();
  assert.equal(await page.locator("#li-modal [name=user_id]").inputValue(), "sample-ana", "Assign to is preselected");
  await page.fill("#li-modal [name=title]", "E2E: review the payment screen");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  await page.click('.li-team-table a:has-text("Ana (sample)")');
  await page.waitForSelector(".li-h2:has-text('Ana (sample)')");
  const assigned = row(page, "E2E: review the payment screen");
  await assigned.waitFor();
  assert.match(await assigned.innerText(), /For Ana \(sample\)/);
  assert.match(await page.locator("#li-view").innerText(), /Scrolling was janky/, "their learning logs are visible to the owner");
  // Their daily report as a PDF.
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#li-member-pdf")]);
  assert.match(download.suggestedFilename(), /ana-sample/);
  // Invite a colleague, then cancel it.
  await page.click('a:has-text("‹ Team")');
  await page.fill("#li-invite-form [name=email]", "New.Colleague@Example.com");
  await page.click("#li-invite-form button[type=submit]");
  await page.waitForSelector("#li-invites li:has-text('new.colleague@example.com')");
  await page.click("#li-invites [data-revoke-invite]");
  await page.click("#li-modal button[type=submit]");
  await page.waitForFunction(() => !document.querySelector("#li-invites").textContent.includes("new.colleague@example.com"));
  // The assigned task isn't in the owner's own Today.
  await page.click('#li-nav a[href="#/today"]');
  await page.waitForSelector(".li-view-head");
  assert.equal(await row(page, "E2E: review the payment screen").count(), 0);
  // Remove Ben completely: his name must be typed first.
  await page.click('#li-nav a[href="#/team"]');
  await page.click('.li-team-table a:has-text("Ben (sample)")');
  await page.click("#li-remove-member");
  assert.match(await page.textContent("#li-modal"), /can't be undone/);
  await page.fill("#li-modal [name=confirm]", "Ana (sample)");
  await page.click("#li-modal button[type=submit]");
  assert.match(await page.textContent("#li-modal .li-form-error"), /doesn't match/);
  await page.fill("#li-modal [name=confirm]", "ben (sample)");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  await page.waitForSelector(".li-team-table");
  const after = await page.locator(".li-team-table tbody tr").allInnerTexts();
  assert.equal(after.length, 2, "Ben is gone");
  assert.ok(!after.some((r) => r.includes("Ben (sample)")));
  await page.close();
});

test("previews stay behind the password screen until unlocked", async () => {
  const page = await browser.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(BASE + "?demo=history");
  await page.waitForTimeout(500);
  assert.ok(await page.locator("#gate").isVisible(), "password screen shown");
  assert.ok(!(await page.locator("#li-nav").isVisible()), "app hidden behind it");
  await page.fill("#gate-pw", "wrong password");
  await page.click("#gate-form button[type=submit]");
  await page.waitForSelector("#gate-error:not([hidden])");
  assert.ok(await page.locator("#gate").isVisible(), "a wrong password keeps it locked");
  // Log out in a preview locks the page again (the original behaviour).
  await page.evaluate((h) => sessionStorage.setItem("lockedin_unlock", h), ACCESS_HASH);
  await page.reload();
  await page.waitForSelector("#li-nav .li-nav-link");
  await page.click("#logout-btn");
  assert.ok(await page.locator("#gate").isVisible(), "Log out locks the preview");
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

// A stand-in for supabase-js, served in place of the CDN module. `signedIn`
// decides whether there's a session; the profile starts without a greeting.
// `oldDb` imitates a database without the greeting migration.
function fakeSupabase({ signedIn, oldDb = false }) {
  return `
const oldDb = ${oldDb};
const profile = { id: "u1", name: "aye", email: "aye@example.com", timezone: "UTC" };
if (!oldDb) profile.greeting = null;
window.__fakeSignUps = [];
function builder(table) {
  const q = { table, op: "select", cols: "", values: null, single: false };
  const run = () => {
    if (table === "profiles" && q.op === "update") Object.assign(profile, q.values);
    if (table === "profiles") return q.single ? { ...profile } : [{ ...profile }];
    if (table === "team_members" && q.cols.includes("teams(")) return [{ team_id: "t1", role: "owner", teams: { name: "My team" } }];
    if (table === "team_members" && q.cols.includes("profiles(")) return [{ user_id: "u1", role: "owner", joined_at: "2026-09-26T00:00:00Z", profiles: { ...profile } }];
    if (table === "user_settings" && q.single) return { user_id: "u1", scoring: {}, preferences: {}, plan_loaded_at: "2026-09-26T00:00:00Z", legacy_imported_at: "2026-09-26T00:00:00Z" };
    return q.single ? (q.values || null) : [];
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === "then") {
      if (oldDb && (q.cols.includes("greeting") || (q.values && "greeting" in q.values)))
        return (res, rej) => Promise.resolve({ data: null, error: { message: "column profiles_1.greeting does not exist" } }).then(res, rej);
      return (res, rej) => Promise.resolve({ data: run(), error: null }).then(res, rej);
    }
    return (...a) => {
      if (k === "select") q.cols = a[0] || "";
      if (k === "update" || k === "insert" || k === "upsert") { q.op = k; q.values = a[0]; }
      if (k === "single" || k === "maybeSingle") q.single = true;
      return b;
    };
  } });
  return b;
}
export function createClient() {
  return {
    from: builder,
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getSession: async () => ({ data: { session: ${signedIn ? '{ user: { id: "u1" } }' : "null"} } }),
      onAuthStateChange() {},
      signUp: async (args) => { window.__fakeSignUps.push(args); return { data: { session: null }, error: null }; },
    },
  };
}`;
}

async function dbPage({ signedIn, oldDb }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route("https://api.github.com/**", (r) => r.fulfill({ json: [] }));
  await page.route(/\/config\.js(\?|$)/, (r) => r.fulfill({ contentType: "application/javascript",
    body: 'window.LOCKEDIN_CONFIG = { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "sb_publishable_test" };' }));
  await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ contentType: "application/javascript", body: fakeSupabase({ signedIn, oldDb }) }));
  await page.goto(BASE);
  return page;
}

test("with a database configured, the Supabase sign-in screen is shown (not a blank page)", async () => {
  const page = await dbPage({ signedIn: false });
  await page.waitForSelector("#li-auth .gate-card", { state: "visible" });
  assert.ok(await page.getByRole("button", { name: "Create an account" }).isVisible(), "sign-up is offered");
  assert.ok(await page.locator('#li-auth input[type="email"]').isVisible(), "email field visible");
  assert.ok(!(await page.locator("#gate").isVisible()), "the old password screen is not used");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("sign-up asks for a name and how to be greeted, and sends both", async () => {
  const page = await dbPage({ signedIn: false });
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.fill('#li-auth input[type="email"]', "cara@example.com");
  await page.fill('#li-auth input[type="password"]', "long enough password");
  await page.click('#li-auth button[type="submit"]');
  assert.match(await page.textContent("#li-auth .gate-error"), /Enter your name/);
  await page.fill('#li-auth input[name="name"]', "Cara Lee");
  await page.click('#li-auth button[type="submit"]');
  assert.match(await page.textContent("#li-auth .gate-error"), /greeted/);
  await page.selectOption('#li-auth select[name="greeting"]', "ms");
  await page.click('#li-auth button[type="submit"]');
  await page.waitForSelector("#li-auth .li-auth-ok:not([hidden])");
  const sent = await page.evaluate(() => window.__fakeSignUps[0].options.data);
  assert.deepEqual(sent, { name: "Cara Lee", greeting: "ms" });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("signed in without a greeting: asked once, then greeted by title and name", async () => {
  const page = await dbPage({ signedIn: true });
  await page.waitForSelector("#li-modal", { state: "visible" });
  assert.match(await page.textContent("#li-modal-title"), /How should we greet you/);
  assert.equal(await page.textContent(".wrap > h1"), "aye", "the heading shows their own name, not the original's");
  await page.fill('#li-modal input[name="name"]', "Ayenew Shiferaw");
  await page.selectOption('#li-modal select[name="greeting"]', "mr");
  await page.click('#li-modal button[type="submit"]');
  await page.waitForSelector("#li-modal", { state: "detached" });
  assert.equal(await page.textContent(".wrap > h1"), "Mr. Ayenew Shiferaw");
  // The Team page lists them by name and title, not email.
  await page.evaluate(() => { location.hash = "#/team"; });
  await page.waitForSelector(".li-person");
  assert.equal(await page.textContent(".li-person"), "Mr. Ayenew Shiferaw");
  // Settings: change the greeting.
  await page.evaluate(() => { location.hash = "#/settings"; });
  await page.selectOption('#li-profile-form select[name="greeting"]', "none");
  await page.click('#li-profile-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".wrap > h1").textContent === "Ayenew Shiferaw");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("before the greeting migration is run, the site still loads (greetings just stay hidden)", async () => {
  const page = await dbPage({ signedIn: true, oldDb: true });
  await page.waitForSelector("#li-nav .li-nav-link");
  assert.equal(await page.textContent(".wrap > h1"), "aye");
  assert.equal(await page.locator("#li-modal").count(), 0, "no greeting prompt");
  await page.evaluate(() => { location.hash = "#/team"; });
  await page.waitForSelector(".li-person");
  assert.equal(await page.textContent(".li-person"), "aye");
  await page.evaluate(() => { location.hash = "#/settings"; });
  await page.waitForSelector("#li-profile-form");
  assert.equal(await page.locator('#li-profile-form select[name="greeting"]').count(), 0, "no greeting choice yet");
  await page.fill('#li-profile-form input[name="name"]', "Ayenew Shiferaw");
  await page.click('#li-profile-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".wrap > h1").textContent === "Ayenew Shiferaw");
  assert.deepEqual(page.errors, []);
  await page.close();
});
