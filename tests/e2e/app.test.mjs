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
  // Pages from the ☰ menu open full screen (no tab row).
  await page.waitForSelector(/^(profile|projects|settings)\b/.test(hash) ? "#li-back" : "#li-nav .li-nav-link");
  page.errors = errors;
  return page;
}
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
// A ☰ item: from the ☰ drawer on phones and tablets, from the tab row on laptops and desktops.
async function menuItem(page, sel) {
  if (await page.locator("#li-menu-btn").isVisible()) { await page.click("#li-menu-btn"); return page.locator(`#li-menu ${sel}`); }
  return page.locator(`#li-nav-extra ${sel}`);
}
// On weekdays the demo's two sample colleagues each have a task in progress today.
const colleaguesToday = () => ([0, 6].includes(new Date().getDay()) ? 0 : 2);
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
  // The Overview's Tasks card reflects it too: 3 of the team's 5 today
  // (7 on weekdays, when the sample colleagues are working too).
  // (Switch tabs in-page: reloading would reset the demo data.)
  await page.click('#li-nav a[href="#/"]');
  await page.waitForSelector("#li-tasks-card:not([hidden]) .today-progress");
  assert.equal(await page.locator("#li-tasks-card .today-progress").innerText(), `3/${5 + colleaguesToday()}`);
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
  await page.click('#li-nav [data-view=tasks]');
  await page.click('.li-status-tabs a:has-text("Overdue")');
  await page.waitForFunction(() => location.hash === "#/tasks?status=overdue");
  assert.equal(await row(page, "E2E: late thing").count(), 1, "shows under Overdue");
  assert.ok((await page.locator("#li-view .li-task:not(.st-overdue)").count()) === 0, "shows only overdue tasks");
  await page.click('.li-status-tabs a[href="#/tasks"]');
  await page.waitForSelector('.li-status-tabs a[href="#/tasks"].on');
  assert.ok((await page.locator("#li-view .li-task:not(.st-overdue)").count()) > 0, "All lists every task");
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

test("Tasks: a tab on the main page; every task, no filters", async () => {
  const page = await open("");
  const tabs = (await page.locator("#li-nav .li-nav-scroll .li-nav-link").allInnerTexts()).map((t) => t.replace(/\s*\d+\+?$/, "").trim());
  assert.deepEqual(tabs.slice(0, 4).map((t) => t.trim()), ["Overview", "Today", "Tasks", "Calendar"]);
  await page.click('#li-nav [data-view=tasks]');
  await page.waitForFunction(() => location.hash === "#/tasks");
  await page.waitForSelector("#li-task-results .li-task");
  assert.equal(await page.locator("#li-filters, .li-search, #li-view select[name=priority]").count(), 0, "no filters");
  assert.match(await page.textContent("#li-view .li-h2"), /^\d+ tasks?$/);
  // One button per status, each with its count; each shows only that status.
  const statusTabs = page.locator(".li-status-tabs a");
  assert.deepEqual((await statusTabs.allInnerTexts()).map((t) => t.replace(/\s*\d+$/, "").trim()), ["All", "Available", "Ongoing", "Completed", "Overdue", "Assigned by me"]);
  const statusOf = { Available: "st-not_started", Ongoing: "st-in_progress", Completed: "st-completed", Overdue: "st-overdue" };
  for (const [label, cls] of Object.entries(statusOf)) {
    const btn = statusTabs.filter({ hasText: label });
    const count = Number((await btn.innerText()).match(/(\d+)$/)[1]);
    await btn.click();
    await page.waitForFunction((l) => document.querySelector(".li-status-tabs .on")?.textContent.startsWith(l), label);
    const rows = page.locator("#li-task-results .li-task");
    assert.equal(await rows.count(), count, `${label}: count matches`);
    for (const c of await rows.evaluateAll((els) => els.map((e) => e.className))) assert.ok(c.includes(cls), `${label}: only ${cls}`);
  }
  // The Overview's Overdue tile opens the Overdue button.
  await page.goto(BASE + "?demo=1");
  await page.click('.li-tile[data-href="#/tasks?status=overdue"]');
  await page.waitForSelector('.li-status-tabs .on:has-text("Overdue")');
  assert.deepEqual(page.errors, []);
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

test("assign one task to several people; the owner keeps, edits, extends, revokes and deletes it", async () => {
  const page = await open("tasks");
  await page.click(".li-view-head [data-new-task]");
  await page.locator("#li-modal [name=title]").fill("E2E: shared release notes");
  // Tick Ana and Ben, untick yourself.
  const box = (name) => page.locator("#li-modal .li-assignees label", { hasText: name }).locator("input");
  await box("Me").uncheck();
  await box("Ana").check();
  await box("Ben").check();
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForSelector(".li-toast, #li-toast", { state: "attached" }).catch(() => {});
  // Assigned by me keeps it, one line per person.
  await page.click('.li-status-tabs a:has-text("Assigned by me")');
  const card = page.locator(".li-assignment", { hasText: "E2E: shared release notes" });
  await card.waitFor();
  assert.deepEqual(await card.locator(".li-asg-name").allInnerTexts(), ["Ana (sample)", "Ben (sample)"]);
  assert.match(await card.innerText(), /0\/2 done/);
  // Edit once: every copy changes.
  await card.locator("[data-edit-assignment]").click();
  await page.locator("#li-modal [name=due_date]").fill(shift(today(), 3));
  await page.locator("#li-modal [name=title]").fill("E2E: release notes v2");
  await page.locator("#li-modal button[type=submit]").click();
  const card2 = page.locator(".li-assignment", { hasText: "E2E: release notes v2" });
  await card2.waitFor();
  assert.equal(await page.locator(".li-assignment", { hasText: "E2E: shared release notes" }).count(), 0);
  // Add a person (you).
  await card2.locator("[data-add-person]").click();
  await page.locator("#li-modal .li-assignees label", { hasText: "Me" }).locator("input").check();
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForFunction(() => [...document.querySelectorAll(".li-assignment")].some((c) => c.textContent.includes("v2") && c.querySelectorAll(".li-asg-name").length === 3));
  assert.equal(await card2.locator("[data-add-person]").count(), 0, "everyone has it: no one left to add");
  // Revoke it from Ben.
  await card2.locator(".li-asg-people li", { hasText: "Ben" }).locator("[data-revoke]").click();
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForFunction(() => [...document.querySelectorAll(".li-assignment")].some((c) => c.textContent.includes("v2") && c.querySelectorAll(".li-asg-name").length === 2));
  assert.deepEqual(await card2.locator(".li-asg-name").allInnerTexts(), ["Ana (sample)", "You"]);
  // Your copy is on your own list too.
  // Delete it for everyone.
  await card2.locator("[data-delete-assignment]").click();
  await page.locator("#li-modal button[type=submit]").click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".li-assignment")].some((c) => c.textContent.includes("v2")));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("a dot on Tasks counts your unfinished tasks (red when some are overdue); the Team card shows each person's", async () => {
  const page = await open("");
  const dot = page.locator("#li-nav [data-view=tasks] .li-nav-dot");
  const unfinished = Number(await dot.innerText());
  assert.ok(unfinished > 0 && await dot.isVisible());
  assert.match(await dot.getAttribute("class"), /late/, "the demo has overdue tasks: red");
  // Finishing one lowers the count.
  await page.click("#li-nav [data-view=today]");
  await row(page, "Test keyboard handling on iOS").locator("[data-act=toggle]").click();
  await skipLearningLog(page);
  await page.waitForFunction((n) => document.querySelector("#li-nav [data-view=tasks] .li-nav-dot").textContent === String(n - 1), unfinished);
  // Team card: Ben has an unfinished task.
  await page.click('#li-nav a[href="#/"]');
  const ben = page.locator("#li-team-card .li-tm-row", { hasText: "Ben" });
  assert.ok(Number(await ben.locator(".li-nav-dot").innerText()) >= 1);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("laptops and desktops: the ☰ items sit in the tab row; phones keep the ☰", async () => {
  const page = await open("", { width: 1280, height: 800 });
  assert.ok(await page.locator("#li-menu-btn").isHidden(), "no ☰ on a wide screen");
  const extra = page.locator("#li-nav-extra");
  assert.deepEqual((await extra.locator(".li-nav-link").allInnerTexts()).map((t) => t.trim()), ["Profile", "Projects", "Settings", "☀", "Log out"]);
  const tabs = await page.locator("#li-nav .li-nav-scroll").boundingBox(), ext = await extra.boundingBox();
  assert.ok(Math.abs(tabs.y - ext.y) < 12 && ext.x >= tabs.x + tabs.width - 1, "same line, on the right");
  // Light / Dark from the bar.
  await extra.locator(".li-nav-theme").click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await extra.locator(".li-nav-theme").innerText(), "☾");
  await extra.locator(".li-nav-theme").click();
  await extra.locator('a[href="#/settings"]').click();
  await page.waitForSelector(".li-formula");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click("#li-back");
  await page.waitForSelector("#li-menu-btn", { state: "visible" });
  assert.ok(await extra.isHidden(), "phones use the ☰ instead");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("team chat: pull up the tray, group and one-to-one chats, unread counts, send and delete", async () => {
  const page = await open("", { width: 390, height: 844 });
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  const chat = page.locator("#li-chat"), handle = chat.locator(".li-chat-handle");
  assert.ok(await handle.isVisible(), "the chat bar sits at the bottom");
  const bar = await handle.boundingBox();
  assert.ok(bar.y + bar.height >= 844 - 60, "pinned to the bottom of the screen");
  assert.equal(await chat.locator(".li-chat-unread").innerText(), "3", "2 group messages + 1 direct message unread");
  // Drag the bar up to open it.
  await page.mouse.move(bar.x + bar.width / 2, bar.y + 15);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2, bar.y - 80, { steps: 5 });
  await page.mouse.up();
  await chat.locator(".li-chat-panel").waitFor();
  assert.deepEqual((await chat.locator(".li-chat-convo").allInnerTexts()).map((t) => t.replace(/\s*\d+$/, "").trim()), ["Group", "Ana (sample)", "Ben (sample)"]);
  assert.match(await chat.locator(".li-chat-log").innerText(), /Ana \(sample\)[\s\S]*Picking up the trips list[\s\S]*Ben \(sample\)[\s\S]*booking flow on Android/);
  assert.equal(await chat.locator('.li-chat-convo[data-convo="sample-ben"] .li-nav-dot').innerText(), "1", "Ben's direct message is unread");
  // Send to the group (Enter sends).
  await chat.locator("textarea").fill("On it, thanks both");
  await chat.locator("textarea").press("Enter");
  await chat.locator(".li-chat-msg.mine", { hasText: "On it, thanks both" }).waitFor();
  // One-to-one with Ben.
  await chat.locator('.li-chat-convo[data-convo="sample-ben"]').click();
  assert.match(await chat.locator(".li-chat-log").innerText(), /payment screen/);
  assert.equal(await chat.locator(".li-chat-log").innerText().then((t) => t.includes("On it, thanks both")), false, "group messages stay in Group");
  await chat.locator("textarea").fill("Sure, 2pm?");
  await chat.locator("button[type=submit]").click();
  const mine = chat.locator(".li-chat-msg.mine", { hasText: "Sure, 2pm?" });
  await mine.waitFor();
  // Delete your own message.
  await mine.locator(".li-chat-del").click();
  await page.locator("#li-modal button[type=submit]").click();
  await mine.waitFor({ state: "detached" });
  // Clicks inside the tray keep it open; a tap on the page outside closes it
  // (without pressing what's underneath).
  await chat.locator(".li-chat-log").click();
  assert.ok(await chat.locator(".li-chat-panel").isVisible(), "a click inside keeps it open");
  const hash = await page.evaluate(() => location.hash);
  await page.mouse.click(195, 60);
  await chat.locator(".li-chat-panel").waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => location.hash), hash, "the tap only closed the chat");
  // Esc closes too; everything is read now.
  await handle.click();
  await chat.locator(".li-chat-panel").waitFor();
  await page.keyboard.press("Escape");
  await chat.locator(".li-chat-panel").waitFor({ state: "hidden" });
  assert.ok(await chat.locator(".li-chat-unread").isHidden(), "nothing unread");
  // Laptop: no dim, but a click outside still closes it.
  await page.setViewportSize({ width: 1280, height: 800 });
  await handle.click();
  await chat.locator(".li-chat-panel").waitFor();
  assert.equal(await page.locator(".li-chat-scrim").evaluate((e) => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.mouse.click(200, 400);
  await chat.locator(".li-chat-panel").waitFor({ state: "hidden" });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("team chat: hidden until there's a colleague (and before the chat SQL is run)", async () => {
  const page = await dbPage({ signedIn: true });
  await page.waitForSelector("#li-nav .li-nav-link");
  assert.equal(await page.locator("#li-chat").count(), 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("responsive: every page fits phones, tablets, laptops and big monitors", async () => {
  const sizes = [[320, 640], [375, 812], [768, 1024], [1024, 768], [1280, 800], [1920, 1080]];
  const views = ["", "today", "tasks", "calendar", "week", "quarter", "milestones", "analytics", "team", "settings", "profile", "projects"];
  for (const [width, height] of sizes) {
    const page = await open("", { width, height });
    for (const v of views) {
      await page.goto(BASE + "?demo=1#/" + v);
      await page.waitForSelector(/^(profile|projects|settings)$/.test(v) ? "#li-back" : "#li-nav .li-nav-link");
      await page.waitForTimeout(100);
      const where = `${v || "overview"} at ${width}px`;
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        // Cards and tiles stay inside the screen.
        const out = [...document.querySelectorAll(".li-card, .li-tile, .today-card, .heat-card, .roadmap-card, .li-project-tile, .li-task")]
          .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > W + 1); })
          .map((e) => e.className);
        // The top tiles fill every row: none is left alone with empty space beside it.
        const kpis = document.querySelector("#li-overview .li-kpis");
        let gaps = [];
        if (kpis && kpis.getClientRects().length) {
          const box = kpis.getBoundingClientRect(), rows = new Map();
          for (const t of [...kpis.children].filter((c) => c.getClientRects().length)) { const b = t.getBoundingClientRect(); rows.set(Math.round(b.top), Math.max(rows.get(Math.round(b.top)) || 0, b.right)); }
          gaps = [...rows.values()].filter((right) => box.right - right > 2);
        }
        return { overflow: document.documentElement.scrollWidth - W, out, gaps: gaps.length };
      });
      assert.ok(r.overflow <= 0, `${where}: page overflows by ${r.overflow}px`);
      assert.deepEqual(r.out, [], `${where}: cards off screen`);
      assert.equal(r.gaps, 0, `${where}: a row of top tiles doesn't reach the edge`);
    }
    // Overview: from tablets up, Tasks sits beside Activity; the Tasks card
    // hugs its content, and no two cards overlap (also with the report open).
    await page.goto(BASE + "?demo=1");
    await page.waitForSelector("#li-projects .li-project-tile");
    const box = (sel) => page.locator(sel).boundingBox();
    const [tasks, heat] = [await box("#li-tasks-card"), await box("#heat-card")];
    if (width >= 700) assert.ok(Math.abs(tasks.y - heat.y) < 1 && tasks.x + tasks.width <= heat.x, `side by side at ${width}px`);
    else assert.ok(heat.y >= tasks.y + tasks.height, `stacked on a phone (${width}px)`);
    // Tablets and up: Tasks, then the Team card, then the Objective card.
    // Phones, top to bottom: ☰, greeting, quote, tabs, the 4 tracking cards,
    // Tasks, Team, Activity, apps, Objective.
    const obj = await box(".obj-section"), team = await box("#li-team-card");
    const under = (a, b) => Math.abs(a.x - b.x) < 1 && a.y >= b.y + b.height && a.y - (b.y + b.height) < 40;
    if (width >= 700) {
      assert.ok(under(team, tasks), `Team under Tasks at ${width}px`);
      assert.ok(under(obj, team), `Objective under Team at ${width}px`);
    } else {
      const order = ["#li-menu-btn", ".wrap > h1", "#daily-quote", "#li-nav", "#li-overview .li-kpis", "#li-tasks-card", "#li-team-card", "#heat-card", "#li-projects", ".obj-section"];
      const tops = [];
      for (const sel of order) tops.push((await box(sel)).y);
      assert.deepEqual(tops, [...tops].sort((a, b) => a - b), `phone order at ${width}px: ${order.join(" > ")}`);
      const tiles = await page.locator("#li-overview .li-kpis > *:visible .li-tile-label").allInnerTexts();
      assert.deepEqual(tiles.map((t) => t.toLowerCase()), ["today's progress", "daily score", "weekly score", "overdue"], "4 tracking cards on a phone");
      const t = await page.locator("#li-overview .li-kpis > *:visible").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      assert.ok(t[0] === t[1] && t[2] === t[3] && t[2] > t[0], "2 x 2");
    }
    const overlaps = () => page.evaluate(() => {
      const els = [...document.querySelectorAll("#li-overview, #li-tasks-card, #report-card, #heat-card, #li-projects, .roadmap-card")].filter((e) => e.getClientRects().length);
      const out = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${els[i].id || els[i].className} / ${els[j].id || els[j].className}`);
      }
      return out;
    });
    for (const period of ["month", "day"]) {
      await page.click(`#li-tasks-card [data-period=${period}]`);
      const hugs = await page.locator("#li-tasks-card").evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && getComputedStyle(e).overflowY === "visible");
      assert.ok(hugs, `Tasks card hugs its content (${period}, ${width}px)`);
      assert.deepEqual(await overlaps(), [], `no overlapping cards (${period}, ${width}px)`);
    }
    await page.click("#li-tasks-card [data-report]");
    await page.waitForSelector("#report-card:not([hidden])");
    assert.deepEqual(await overlaps(), [], `no overlapping cards with the report open (${width}px)`);
    await page.evaluate(() => localStorage.removeItem("li_tasks_period"));
    assert.equal(await page.locator("#li-tasks-card a", { hasText: "Open Today" }).count(), 0, "no Open Today link");
    assert.deepEqual(page.errors, [], `no errors at ${width}px`);
    await page.close();
  }
});

test("every view fits a phone screen without sideways scrolling", async () => {
  for (const v of ["", "today", "tasks", "calendar", "week", "quarter", "milestones", "analytics", "settings", "profile"]) {
    const page = await open(v, { width: 375, height: 800 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `${v || "overview"} overflows by ${overflow}px`);
    assert.deepEqual(page.errors, [], `${v || "overview"} has no errors`);
    await page.close();
  }
  const page = await open("today", { width: 375, height: 800 });
  await page.click(".li-view-head [data-new-task]");
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
  // The Sep 20-25 history plus the year plan's daily tickets (Tasks page shows 30 days either side by default: all).
  assert.equal(await row(page, "Rename the app from Hid-Go to Guxo Flights").count(), 1);
  assert.equal(await row(page, "Uploaded the first version of the flight-booking app").count(), 1, "Sep 20's activity");
  assert.equal(await page.locator(".li-task.st-completed:visible").count(), 16, "history tasks are done (14 checklist + Sep 20-21)");
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
  // Already set up: Settings offers "Add missing history", which finds nothing to add.
  await page.evaluate(() => { location.hash = "#/settings"; });
  await page.click("#li-import-missing");
  await page.waitForFunction(() => /already here/.test(document.querySelector("#li-toasts")?.textContent || ""));
  assert.equal(await page.locator("#li-import-legacy").count(), 0, "no second full setup");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Overview layout: quote above the tabs, trimmed tabs, Tasks card, Settings in the ☰ menu", async () => {
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
  const nav = (await page.locator("#li-nav .li-nav-scroll .li-nav-link").allInnerTexts()).map((t) => t.replace(/\s*\d+\+?$/, "").trim());
  assert.deepEqual(nav, ["Overview", "Today", "Tasks", "Calendar", "Milestones", "Analytics", "Team"], "the preview account owns a team");
  const quoteBottom = (await page.locator("#daily-quote").boundingBox()).y + (await page.locator("#daily-quote").boundingBox()).height;
  assert.ok(quoteBottom <= (await page.locator("#li-nav").boundingBox()).y, "quote sits above the tabs");
  assert.ok(!(await page.locator("#today-card").isVisible()), "Today's checklist is gone");
  assert.ok(!(await page.locator("#week-card").isVisible()), "the Your score (rings) card is gone");
  assert.equal(await page.locator("#li-overview .card-label", { hasText: "Deadlines" }).count(), 0, "the Deadlines card is gone");
  assert.equal(await page.locator("#li-overview .card-label", { hasText: "Milestones" }).count(), 0, "the Milestones card is gone");
  // New task is the first tile, before Today's progress, and opens the form.
  const tiles = await page.locator("#li-overview .li-kpis .li-tile-label").allInnerTexts();
  assert.deepEqual(tiles.slice(0, 2).map((t) => t.toLowerCase()), ["new task", "today's progress"]);
  assert.equal(await page.locator("#li-nav [data-new-task]").count(), 0, "no New task button in the tab row");
  await page.click(".li-tile-add");
  await page.waitForSelector("#li-modal [name=title]");
  await page.locator("#li-modal [data-close]").first().click();
  const card = page.locator("#li-tasks-card");
  const gridTop = (await page.locator(".dash-grid").boundingBox()).y;
  assert.ok(Math.abs((await card.boundingBox()).y - gridTop) < 2, "Tasks card leads the left column");
  // Day view: the whole team's tasks for today, grouped, with who's in charge.
  const extra = colleaguesToday();
  assert.equal(await card.locator(".today-progress").innerText(), `2/${5 + extra}`);
  assert.deepEqual(await card.locator(".li-tc-group-title").allInnerTexts(), ["AVAILABLE (2)", `ONGOING (${1 + extra})`, "COMPLETED (2)"], "Available / Ongoing / Completed");
  const bens = card.locator(".li-task", { hasText: "Test the booking flow on Android" });
  assert.match(await bens.innerText(), /👤 Ben \(sample\)/, "a colleague's task names who's in charge");
  assert.match(await card.locator(".li-task").first().innerText(), /👤 (You|Ben \(sample\))/);
  assert.equal(await card.locator("[data-person]").count(), 0, "no person filter");
  // Add one from the card (it's yours).
  await card.locator("input[name=title]").fill("E2E card task");
  await card.locator("button[type=submit]").click();
  await page.waitForFunction((n) => document.querySelector("#li-tasks-card .today-progress").textContent === `2/${n}`, 6 + extra);
  assert.match(await card.locator(".li-task", { hasText: "E2E card task" }).innerText(), /👤 You/);
  // Week / Month / Quarter switch the period and the completion level.
  for (const p of ["week", "month", "quarter"]) {
    await card.locator(`[data-period=${p}]`).click();
    await page.waitForFunction((p) => document.querySelector(`#li-tasks-card [data-period=${p}]`).getAttribute("aria-pressed") === "true", p);
    assert.match(await card.locator(".li-tc-progress").innerText(), /% complete/);
  }
  assert.equal(await card.locator('a[href="#/quarter"]').count(), 1, "quarter view link");
  // Week, month and quarter download their report; Day opens the daily report card.
  assert.equal((await card.locator("[data-report-pdf]").innerText()).trim(), "Quarterly report ⤓");
  await card.locator("[data-period=day]").click();
  await card.locator("[data-report]").click();
  assert.ok(await page.locator("#report-card").isVisible());
  // Settings lives in the ☰ menu (no longer in the footer).
  assert.equal(await page.locator('#li-footer-links a[href="#/settings"]').count(), 0);
  await (await menuItem(page, 'a[href="#/settings"]')).click();
  await page.waitForSelector(".li-formula");
  assert.ok(await page.locator("#li-menu").isHidden(), "the menu closes after choosing");
  // It opens as its own page: no greeting, quote or tabs; Back returns to the main page.
  assert.ok(await page.locator("#daily-quote").isHidden() && await page.locator("#li-nav").isHidden(), "full-screen page");
  assert.equal(await page.textContent("#li-page-title"), "Settings");
  await page.click("#li-back");
  await page.waitForSelector("#li-nav .li-nav-link", { state: "visible" });
  assert.ok(await page.locator("#daily-quote").isVisible());
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

test("report PDFs: completed work with learning logs and files, open work, milestones and the team; no GitHub", async () => {
  const page = await unlockedPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  let github = 0;
  await page.route("https://api.github.com/**", (route) => { github++; return route.abort(); });
  await page.goto(BASE + "?demo=1#/today");
  await page.waitForSelector("#li-nav .li-nav-link");
  const r = row(page, "Test keyboard handling on iOS");
  await r.locator("[data-act=toggle]").click();
  await page.fill("#li-modal [name=learning_changed]", "Screens move up with the keyboard");
  await page.fill("#li-modal [name=learning_how]", "KeyboardAvoidingView per screen");
  await page.fill("#li-modal [name=learning_solved]", "Inputs were hidden behind the keyboard on iOS");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  // Daily: open the report from the Overview's Tasks card (Day), then download.
  await page.click('#li-nav a[href="#/"]');
  await page.click("#li-tasks-card [data-period=day]");
  await page.click("#li-tasks-card [data-report]");
  await page.waitForSelector("#li-report-pdf");
  const [daily] = await Promise.all([page.waitForEvent("download"), page.click("#li-report-pdf")]);
  assert.match(daily.suggestedFilename(), /^locked-in-daily-report-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdf = readFileSync(await daily.path()).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-"), "a real PDF");
  for (const s of ["Daily report", "COMPLETED", "Test keyboard handling on iOS", "What was done", "Screens move up with the keyboard",
    "KeyboardAvoidingView per screen", "Problem solved", "Inputs were hidden behind the keyboard on iOS", "STILL OPEN", "MILESTONES", "complete", "TEAM", "Ana \\(sample\\)"]) {
    assert.ok(pdf.includes(s), `daily PDF contains "${s}"`);
  }
  assert.ok(!/commit|GitHub/i.test(pdf), "no GitHub section");
  // Weekly: switch the card to Week and download straight away.
  await page.click("#li-tasks-card [data-period=week]");
  const [weekly] = await Promise.all([page.waitForEvent("download"), page.click("#li-tasks-card [data-report-pdf]")]);
  assert.match(weekly.suggestedFilename(), /^locked-in-weekly-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf$/);
  const wpdf = readFileSync(await weekly.path()).toString("latin1");
  for (const s of ["Weekly report", "Test keyboard handling on iOS", "Screens move up with the keyboard", "MILESTONES"]) assert.ok(wpdf.includes(s), `weekly PDF contains "${s}"`);
  assert.equal(github, 0, "GitHub is never called");
  await page.evaluate(() => localStorage.removeItem("li_tasks_period"));
  await page.close();
});

test("team: the owner sees everyone's progress, assigns tasks and invites colleagues", async () => {
  const page = await open("today");
  // Colleagues' tasks never mix into your own Today.
  assert.equal(await page.locator("#li-view .li-task:visible").filter({ hasText: "(sample)" }).count(), 0);
  const tabs = (await page.locator("#li-nav .li-nav-scroll .li-nav-link").allInnerTexts()).map((t) => t.replace(/\s*\d+\+?$/, "").trim());
  assert.deepEqual(tabs, ["Overview", "Today", "Tasks", "Calendar", "Milestones", "Analytics", "Team"], "owner gets a Team tab");
  await page.click('#li-nav a[href="#/team"]');
  await page.waitForSelector(".li-team-table");
  const rows = await page.locator(".li-team-table tbody tr").allInnerTexts();
  assert.equal(rows.length, 3, "owner + two colleagues");
  assert.ok(rows.some((r) => r.includes("Ana (sample)")) && rows.some((r) => r.includes("Ben (sample)")));
  // Assign a task to Ana from her row.
  await page.locator(".li-team-table tr", { hasText: "Ana (sample)" }).locator("[data-assign]").click();
  assert.deepEqual(await page.locator('#li-modal [name="assignees[]"]:checked').evaluateAll((els) => els.map((e) => e.value)), ["sample-ana"], "Assign to is preselected");
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
  assert.ok(await page.locator("#logout-btn").isHidden(), "no Log out button on the front page");
  await (await menuItem(page, "[data-logout]")).click();
  assert.ok(await page.locator("#gate").isVisible(), "Log out (from the ☰ menu) locks the preview");
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
function fakeSupabase({ signedIn, oldDb = false, role = "owner", slow = 0, assigned = false }) {
  return `
const oldDb = ${oldDb};
const slow = ${slow};
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// A task the owner ("o1") assigned to this user.
const tasks = ${assigned} ? [{ id: "t-assigned", user_id: "u1", assigned_by: "o1", title: "Design the payment screen", date: today,
  status: "not_started", priority: "high", completion_percentage: 0, due_date: today, created_at: today + "T08:00:00Z" }] : [];
const files = [];
window.__uploads = [];
const profile = { id: "u1", name: "aye", email: "aye@example.com", timezone: "UTC" };
if (!oldDb) profile.greeting = null;
window.__fakeSignUps = [];
function builder(table) {
  const q = { table, op: "select", cols: "", values: null, single: false };
  const run = () => {
    if (table === "profiles" && q.op === "update") Object.assign(profile, q.values);
    if (table === "tasks" && q.op === "update") { const t = tasks[0]; Object.assign(t, q.values); return q.single ? { ...t } : [{ ...t }]; }
    if (table === "tasks") return q.single ? null : tasks.map((t) => ({ ...t }));
    if (table === "task_files" && q.op === "insert") { const f = { id: "f" + (files.length + 1), user_id: "u1", created_at: today, ...q.values }; files.push(f); return { ...f }; }
    if (table === "task_files") return files.map((f) => ({ ...f }));
    if (table === "profiles") return q.single ? { ...profile } : [{ ...profile }];
    if (table === "team_members" && q.cols.includes("teams(")) return [{ team_id: "t1", role: "${role}", teams: { name: "My team" } }];
    if (table === "team_members" && q.cols.includes("profiles(")) return [{ user_id: "u1", role: "${role}", joined_at: "2026-09-26T00:00:00Z", profiles: { ...profile } }];
    if (table === "user_settings" && q.single) return { user_id: "u1", scoring: {}, preferences: {}, plan_loaded_at: "2026-09-26T00:00:00Z", legacy_imported_at: "2026-09-26T00:00:00Z" };
    return q.single ? (q.values || null) : [];
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === "then") {
      if (oldDb && (q.cols.includes("greeting") || (q.values && "greeting" in q.values)))
        return (res, rej) => Promise.resolve({ data: null, error: { message: "column profiles_1.greeting does not exist" } }).then(res, rej);
      return (res, rej) => new Promise((ok) => setTimeout(ok, slow)).then(() => ({ data: run(), error: null })).then(res, rej);
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
    storage: { from: () => ({
      upload: async (path, file) => { window.__uploads.push({ path, name: file.name, size: file.size }); return { data: { path }, error: null }; },
      createSignedUrl: async () => ({ data: { signedUrl: "about:blank" }, error: null }),
      remove: async () => ({ data: [], error: null }),
    }) },
    auth: {
      getSession: async () => ({ data: { session: ${signedIn ? '{ user: { id: "u1" } }' : "null"} } }),
      onAuthStateChange() {},
      signUp: async (args) => { window.__fakeSignUps.push(args); return { data: { session: null }, error: null }; },
    },
  };
}`;
}

async function dbPage({ signedIn, oldDb, role, slow, assigned }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route("https://api.github.com/**", (r) => r.fulfill({ json: [] }));
  await page.route(/\/config\.js(\?|$)/, (r) => r.fulfill({ contentType: "application/javascript",
    body: 'window.LOCKEDIN_CONFIG = { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "sb_publishable_test" };' }));
  await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ contentType: "application/javascript", body: fakeSupabase({ signedIn, oldDb, role, slow, assigned }) }));
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
  // Profile: change the greeting.
  await page.evaluate(() => { location.hash = "#/profile"; });
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
  await page.evaluate(() => { location.hash = "#/profile"; });
  await page.waitForSelector("#li-profile-form");
  assert.equal(await page.locator('#li-profile-form select[name="greeting"]').count(), 0, "no greeting choice yet");
  await page.fill('#li-profile-form input[name="name"]', "Ayenew Shiferaw");
  await page.click('#li-profile-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".wrap > h1").textContent === "Ayenew Shiferaw");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("colleagues get a read-only Tasks card (Available / Completed) on their Overview", async () => {
  const page = await dbPage({ signedIn: true, role: "member", assigned: true });
  await page.waitForSelector("#li-nav .li-nav-link");
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  const card = page.locator("#li-tasks-card");
  await card.locator('.li-task[data-task-id="t-assigned"]').waitFor();
  assert.ok(await page.locator(".li-kpis").isVisible(), "score tiles still shown");
  assert.deepEqual((await card.locator(".li-tc-group-title").allInnerTexts()).map((t) => t.replace(/\s*\(\d+\)/, "").toLowerCase()), ["available", "completed"]);
  assert.match(await card.locator('[data-group="open"]').innerText(), /Design the payment screen/);
  // Nothing to tick, change, delete, add or open for editing.
  assert.equal(await card.locator("button.li-check, [data-act], select, form, [data-report]").count(), 0, "read-only");
  assert.ok(await page.locator("#li-team-card").isHidden(), "colleagues don't see the Team card");
  await card.locator(".li-task-title").first().click();
  assert.equal(await page.locator("#li-modal").count(), 0, "tapping a task doesn't open the edit form");
  // The periods still switch.
  await card.locator("[data-period=week]").click();
  await page.waitForFunction(() => document.querySelector("#li-tasks-card [data-period=week]").getAttribute("aria-pressed") === "true");
  await page.evaluate(() => localStorage.removeItem("li_tasks_period"));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("☰ menu: Profile, Settings, Light / Dark mode (remembered) and Log out", async () => {
  const page = await open("", { width: 390, height: 800 });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await bg();
  const btn = page.locator("#li-menu-btn");
  const box = await btn.boundingBox();
  assert.ok(box.x < 60, "the menu button is on the left");
  await btn.click();
  assert.ok(await page.locator("#li-menu").isVisible());
  assert.deepEqual(await page.locator("#li-menu .li-menu-link span").allInnerTexts(), ["Profile", "Projects", "Settings", "Light mode", "Log out"]);
  // Light background: the row switches it and then offers Dark mode.
  await page.click('#li-menu .li-menu-link:has-text("Light mode")');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.notEqual(await bg(), dark, "the background changes");
  assert.ok(await page.locator('#li-menu .li-menu-link:has-text("Dark mode")').isVisible(), "menu stays open, now offering Dark mode");
  // Escape closes it; the choice is remembered on reload.
  await page.keyboard.press("Escape");
  assert.ok(await page.locator("#li-menu").isHidden());
  await page.reload();
  await page.waitForSelector("#li-nav .li-nav-link");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  // Profile page.
  await btn.click();
  await page.click('#li-menu a[href="#/profile"]');
  await page.waitForSelector("#li-profile-form");
  assert.ok(await page.locator(".li-avatar.lg").isVisible());
  await page.fill('#li-profile-form input[name="name"]', "Ayenew Shiferaw");
  await page.click('#li-profile-form button[type="submit"]');
  await page.waitForFunction(() => /Profile saved/.test(document.querySelector("#li-toasts")?.textContent || ""));
  // Back to the main page, then back to dark.
  await page.click("#li-back");
  await btn.click();
  await page.click('#li-menu .li-menu-link:has-text("Dark mode")');
  assert.equal(await bg(), dark);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("refreshing never flashes the original page: a spinner shows until the app is drawn", async () => {
  const page = await dbPage({ signedIn: true, slow: 400 });
  await page.waitForFunction(() => window.__lockedInBoot);
  await page.waitForTimeout(300);
  // Signed in, data still loading.
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("app-booting")), "still loading");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".wrap")).visibility), "hidden", "old page hidden");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body, "::after").content), '"Loading…"');
  // Once loaded, the new design appears (and the old checklist card never does).
  await page.waitForSelector("#li-nav .li-nav-link", { state: "visible" });
  assert.ok(await page.locator(".li-kpis").isVisible());
  assert.ok(await page.locator("#today-card").isHidden());
  assert.ok(await page.locator("#logout-btn").isHidden(), "no Log out on the front page");
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  assert.ok(await (await menuItem(page, "[data-logout]")).isVisible(), "Log out is in the menu");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("phone: tapping a tab near the edge opens it and slides it to the middle", async () => {
  const page = await open("", { width: 375, height: 760 });
  const sc = page.locator("#li-nav .li-nav-scroll");
  assert.equal(await sc.evaluate((e) => e.scrollLeft), 0, "starts at the beginning");
  assert.ok(await sc.evaluate((e) => e.classList.contains("fade-r")), "a fade shows more tabs to the right");
  // Swipe the row a little so Analytics sits half off the edge, then tap it there.
  const tab = page.locator('#li-nav a[href="#/analytics"]');
  await sc.evaluate((e) => { e.scrollLeft += e.querySelector('a[href="#/analytics"]').getBoundingClientRect().left - 335; });
  await page.waitForTimeout(100);
  const box = await tab.boundingBox();
  assert.ok(box.x < 370 && box.x + box.width > 375, "Analytics is half off the edge");
  await page.mouse.click(Math.min(box.x + 10, 370), box.y + box.height / 2);
  await page.waitForFunction(() => location.hash === "#/analytics");
  await page.waitForFunction(() => {
    const s = document.querySelector("#li-nav .li-nav-scroll"), a = s.querySelector(".active").getBoundingClientRect(), r = s.getBoundingClientRect();
    return a.left >= r.left && a.right <= r.right && s.scrollLeft > 0;
  });
  await page.waitForTimeout(700); // let the smooth scroll finish
  const pos = await page.evaluate(() => {
    const s = document.querySelector("#li-nav .li-nav-scroll"), a = s.querySelector(".active").getBoundingClientRect(), r = s.getBoundingClientRect();
    const next = s.querySelector(".active").nextElementSibling?.getBoundingClientRect();
    return { center: Math.abs((a.left + a.right) / 2 - (r.left + r.right) / 2), atEnd: s.scrollLeft >= s.scrollWidth - s.clientWidth - 2, nextVisible: !next || next.left < r.right };
  });
  assert.ok(pos.center < 20 || pos.atEnd, `Analytics is centred (${pos.center}px off) or the row is fully scrolled`);
  assert.ok(pos.nextVisible, "the next tab is visible");
  // Redraws (e.g. changing the range) keep the row where it is.
  const before = await sc.evaluate((e) => e.scrollLeft);
  await page.locator("#li-view .li-seg .li-btn").last().click();
  await page.waitForTimeout(400);
  assert.ok(Math.abs((await sc.evaluate((e) => e.scrollLeft)) - before) < 2, "no snapping back to the start");
  // Opening the page directly on a later tab starts with it in view.
  await page.reload();
  await page.waitForSelector("#li-nav .li-nav-link.active");
  assert.ok(await sc.evaluate((e) => e.scrollLeft > 0));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("projects: small cards (3 a row) under Activity; details on tap; the owner adds, edits, reorders and deletes", async () => {
  const page = await open("", { width: 390, height: 900 });
  // The original apps were copied in and show as small cards, not as buttons in the Activity card.
  await page.waitForSelector("#li-projects .li-project-tile");
  assert.deepEqual(await page.locator("#li-projects .li-pt-name").allInnerTexts(), ["Guxo Flights", "Guxo", "Gexi"]);
  assert.ok(await page.locator("#app-chips").isHidden(), "no project buttons in the Activity card");
  const tiles = page.locator("#li-projects .li-project-tile");
  const heat = await page.locator("#heat-card").boundingBox(), boxes = await Promise.all([0, 1, 2].map((i) => tiles.nth(i).boundingBox()));
  assert.ok(boxes[0].y > heat.y + heat.height - 1, "cards sit under the Activity card");
  assert.ok(boxes.every((b) => Math.abs(b.y - boxes[0].y) < 1), "three in a row, even on a phone");
  assert.ok(boxes[2].x + boxes[2].width <= 390, "all fit on screen");
  // Only the name, a description and progress.
  const flightsTile = page.locator('#li-projects .li-project-tile[aria-label^="Guxo Flights"]');
  assert.deepEqual((await flightsTile.innerText()).split("\n").map((t) => t.trim()).filter(Boolean), ["Guxo Flights", "Flight booking", "33%"]);
  // Tap for the details; tick a checklist item there.
  await flightsTile.click();
  const detail = page.locator("#li-modal .li-project-detail");
  assert.match(await page.locator("#li-modal").innerText(), /FLT[\s\S]*ON TRACK[\s\S]*Web app[\s\S]*2 of 6 done/i);
  const item = await detail.locator("input[type=checkbox]:not(:checked)").first().getAttribute("data-item");
  await detail.locator(`input[data-item="${item}"]`).click();
  await page.waitForFunction(() => /3 of 6 done/.test(document.querySelector("#li-modal .li-project-detail")?.textContent || ""));
  await page.click("#li-modal [data-close]:has-text('Close')");
  await page.waitForFunction(() => /50%/.test(document.querySelector('#li-projects .li-project-tile[aria-label^="Guxo Flights"]').textContent));
  // Projects page from the ☰ menu.
  await (await menuItem(page, 'a[href="#/projects"]')).click();
  await page.waitForSelector(".li-project-list");
  // Add one with a checklist item.
  await page.click("#li-project-add");
  await page.fill("#li-modal [name=name]", "Gexi Pay");
  await page.fill("#li-modal [name=code]", "PAY");
  await page.fill("#li-modal [name=description]", "Payments inside Gexi");
  await page.selectOption("#li-modal [name=status]", "warn");
  await page.fill("#li-modal [name=facts]", "Payments for Gexi\nTelebirr first");
  await page.fill("#li-modal [name=link_web]", "not a link");
  await page.click("#li-modal [data-add-item]");
  await page.fill("#li-modal .li-cl-text", "Pick a payment provider");
  await page.click("#li-modal button[type=submit]");
  assert.match(await page.textContent("#li-modal .li-form-error"), /https/);
  await page.fill("#li-modal [name=link_web]", "https://gexi.example/pay");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  const names = () => page.locator(".li-project-list .li-project-row-name").allInnerTexts();
  assert.deepEqual(await names(), ["Guxo Flights", "Guxo", "Gexi", "Gexi Pay"]);
  // Move it up, edit it, then delete Guxo.
  await page.locator(".li-project-list > li", { hasText: "Gexi Pay" }).locator('[data-move="-1"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll(".li-project-list .li-project-row-name")].map((b) => b.textContent).join() === "Guxo Flights,Guxo,Gexi Pay,Gexi");
  await page.locator(".li-project-list > li", { hasText: "Gexi Pay" }).locator("[data-edit]").click();
  await page.fill("#li-modal [name=stage]", "Designing");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  await page.locator('.li-project-list > li:has(.li-project-row-name:text-is("Guxo"))').locator("[data-delete]").click();
  await page.click("#li-modal button[type=submit]");
  await page.waitForFunction(() => [...document.querySelectorAll(".li-project-list .li-project-row-name")].map((b) => b.textContent).join() === "Guxo Flights,Gexi Pay,Gexi");
  // The Overview cards follow.
  await page.click("#li-back");
  await page.waitForSelector("#li-projects .li-project-tile");
  assert.deepEqual(await page.locator("#li-projects .li-pt-name").allInnerTexts(), ["Guxo Flights", "Gexi Pay", "Gexi"]);
  const payTile = page.locator('#li-projects .li-project-tile[aria-label^="Gexi Pay"]');
  assert.match(await payTile.innerText(), /Gexi Pay[\s\S]*Payments inside Gexi[\s\S]*0%/);
  await payTile.click();
  const pay = page.locator("#li-modal .li-project-detail");
  assert.match(await page.locator("#li-modal").innerText(), /PAY[\s\S]*NEEDS ATTENTION[\s\S]*Designing[\s\S]*Telebirr first[\s\S]*Web app[\s\S]*0 of 1 done/i);
  assert.equal(await pay.locator('a[href="https://gexi.example/pay"]').getAttribute("target"), "_blank");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("projects: members see the cards but can't change them", async () => {
  const page = await dbPage({ signedIn: true, role: "member" });
  await page.waitForSelector("#li-nav .li-nav-link");
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  assert.equal(await (await menuItem(page, 'a[href="#/projects"]')).count(), 0, "no Projects page in a member's menu");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("colleagues can't add tasks; their assigned tasks count down instead of the year", async () => {
  const page = await dbPage({ signedIn: true, role: "member", assigned: true });
  await page.waitForSelector("#li-nav .li-nav-link");
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  assert.equal(await page.locator("[data-new-task]").count(), 0, "no New task tile");
  assert.ok(await page.locator("#today-add").isHidden(), "no add box on the checklist card");
  assert.ok(await page.locator(".cd-pin").isHidden(), "no year countdown on the Activity card");
  for (const hash of ["#/today", "#/tasks", "#/calendar"]) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForSelector('.li-task[data-task-id="t-assigned"]');
    assert.equal(await page.locator("[data-new-task], form[data-quick-add]").count(), 0, `nothing to add tasks on ${hash}`);
  }
  const cd = page.locator('#li-view .li-task[data-task-id="t-assigned"] [data-countdown]');
  assert.match(await cd.innerText(), /⏳ (\d+d )?\d\d:\d\d:\d\d left/);
  const before = await cd.innerText();
  await page.waitForFunction((b) => document.querySelector("[data-countdown]").textContent !== b, before);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("the owner still adds tasks and keeps the year countdown", async () => {
  const page = await dbPage({ signedIn: true });
  await page.waitForSelector("#li-nav .li-nav-link");
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  assert.equal(await page.locator(".li-tile-add[data-new-task]").count(), 1);
  assert.ok(await page.locator(".cd-pin").isVisible());
  assert.equal(await page.locator("#obj-text").count(), 0, "no objective sentence above the Objective card");
  // The Team card lists everyone with their role; a person opens their Team page.
  const team = page.locator("#li-team-card");
  assert.ok(await team.isVisible(), "the owner sees the Team card");
  assert.match(await team.locator(".li-tm-row").first().innerText(), /aye[\s\S]*\(you\)[\s\S]*Owner/i);
  await team.locator(".li-tm-row").first().click();
  await page.waitForFunction(() => location.hash === "#/team/u1");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("☰ menu pages open full screen; Back returns to the same spot on the main page", async () => {
  const page = await open("", { width: 390, height: 760 });
  // Scroll down to the project cards, then open Projects from there.
  await page.waitForSelector(".li-project-tile");
  await page.locator(".li-project-grid").scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  assert.ok(y > 300);
  assert.equal(await page.locator("text=Manage projects").count(), 0, "no Manage projects link on the Overview");
  await page.evaluate(() => { location.hash = "#/projects"; });
  await page.waitForSelector(".li-project-list");
  const back = await page.locator("#li-back").boundingBox();
  assert.ok(back.x < 40 && back.y < 60, "Back sits at the top left");
  assert.equal(await page.evaluate(() => window.scrollY), 0, "the page starts at the top");
  for (const sel of [".wrap > h1", "#daily-quote", "#li-nav", "#li-menu-btn", ".dash-grid"]) assert.ok(await page.locator(sel).first().isHidden(), `${sel} hidden`);
  assert.equal(await page.textContent("#li-page-title"), "Projects");
  await page.click("#li-back");
  await page.waitForSelector("#li-nav .li-nav-link", { state: "visible" });
  assert.equal(await page.evaluate(() => location.hash), "", "back on the main page");
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - y) < 5, "scrolled back to where you were");
  // The phone's back does the same.
  await (await menuItem(page, 'a[href="#/settings"]')).click();
  await page.waitForSelector("#li-back");
  await page.goBack();
  await page.waitForSelector("#li-nav .li-nav-link", { state: "visible" });
  // Opened directly (e.g. a bookmark), Back still goes to the main page.
  await page.goto(BASE + "?demo=1#/projects");
  await page.waitForSelector("#li-back");
  await page.click("#li-back");
  await page.waitForSelector("#li-nav .li-nav-link", { state: "visible" });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("files: a colleague must share a file to finish a task the owner assigned", async () => {
  const page = await dbPage({ signedIn: true, role: "member", assigned: true });
  await page.waitForSelector("#li-nav .li-nav-link");
  await page.evaluate(() => document.querySelector("#li-modal")?.remove());
  await page.click('#li-nav a[href="#/today"]');
  const task = row(page, "Design the payment screen");
  await task.waitFor();
  await task.locator("[data-act=toggle]").click();
  // "Hand in" asks for files; it can't be finished without one.
  await page.waitForSelector("#li-modal .li-file-pick");
  assert.match(await page.textContent("#li-modal"), /Hand in/i);
  await page.click("#li-modal button[type=submit]");
  assert.match(await page.textContent("#li-modal .li-form-error"), /at least one file/);
  await page.setInputFiles("#li-modal .li-file-pick input", [
    { name: "payment-screen.png", mimeType: "image/png", buffer: Buffer.from("png") },
    { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf!") },
  ]);
  assert.deepEqual(await page.locator("#li-modal .li-files-new li span").allInnerTexts(), ["📎 payment-screen.png", "📎 notes.pdf"]);
  await page.fill("#li-modal [name=learning_solved]", "The owner can review the screen");
  await page.click("#li-modal button[type=submit]");
  await page.waitForSelector("#li-modal", { state: "detached" });
  const uploads = await page.evaluate(() => window.__uploads);
  assert.deepEqual(uploads.map((u) => u.name), ["payment-screen.png", "notes.pdf"]);
  assert.ok(uploads.every((u) => u.path.startsWith("u1/t-assigned/")), "into your own folder, under the task");
  await page.waitForFunction(() => document.querySelector('.li-task[data-task-id="t-assigned"]')?.classList.contains("st-completed"));
  assert.match(await row(page, "Design the payment screen").innerText(), /📎 2/);
  // The task's details list the files.
  await row(page, "Design the payment screen").locator(".li-task-title").click();
  assert.deepEqual(await page.locator("#li-modal .li-files [data-open-file]").allInnerTexts(), ["📎 payment-screen.png", "📎 notes.pdf"]);
  assert.deepEqual(page.errors, []);
  await page.close();
});
