import test from "node:test";
import assert from "node:assert/strict";
import { githubUser, defaultGithubUser, commitsByDay, fetchCommits } from "../../app/core/github.js";

test("github: usernames from links and text", () => {
  assert.equal(githubUser("https://github.com/Ayenew-Tadesse"), "Ayenew-Tadesse");
  assert.equal(githubUser("github.com/Ayenew-Tadesse/Portfolio"), "Ayenew-Tadesse");
  assert.equal(githubUser("@Ayenew-Tadesse"), "Ayenew-Tadesse");
  assert.equal(githubUser("not a user!"), "");
  assert.equal(githubUser("https://linkedin.com/in/x"), "");
});

test("github: whose commits by default", () => {
  assert.equal(defaultGithubUser({ github: { username: "Someone" } }, "ayenew-tadesse.github.io"), "Someone", "Settings wins");
  assert.equal(defaultGithubUser({ github: { username: "" } }, "ayenew-tadesse.github.io"), "", "empty in Settings means off");
  assert.equal(defaultGithubUser({}, "ayenew-tadesse.github.io"), "ayenew-tadesse", "this site's GitHub account");
  assert.equal(defaultGithubUser({ portfolio: { site: { cv: { contacts: [{ href: "https://github.com/Ayenew-Tadesse" }] } } } }, "localhost"), "Ayenew-Tadesse", "from your resume links");
  assert.equal(defaultGithubUser({}, "localhost"), "");
  assert.equal(defaultGithubUser({}, "ayenew-tadesse.github.io", { owner: false }), "", "an admin doesn't get the site owner's account");
  assert.equal(defaultGithubUser({ portfolio: { links: { github: "https://github.com/their-own" } } }, "ayenew-tadesse.github.io", { owner: false }), "their-own", "but their own links count");
});

test("github: commits grouped by day in your time zone, no duplicates", () => {
  const c = (sha, date, repo, message) => ({ sha, commit: { author: { date }, message }, repository: { name: repo }, html_url: "https://github.com/x/" + sha });
  const days = commitsByDay([
    c("a", "2026-09-30T02:30:00Z", "guxo-flights-app", "Add guest sign-in\n\nlonger body"), // Sep 29, 10:30pm in New York
    c("b", "2026-09-30T15:00:00Z", "Portfolio", "Update resume link"),
    c("b", "2026-09-30T15:00:00Z", "Portfolio", "Update resume link"),
  ], "America/New_York");
  assert.deepEqual(Object.keys(days).sort(), ["2026-09-29", "2026-09-30"]);
  assert.equal(days["2026-09-29"].items[0].text, "Add guest sign-in", "first line of the message");
  assert.equal(days["2026-09-29"].items[0].repo, "guxo-flights-app");
  assert.equal(days["2026-09-30"].count, 1, "the same commit counts once");
});

test("github: asks GitHub's commit search for the last 90 days, keyless", async () => {
  const asked = [];
  const fetchImpl = async (url, opts) => { asked.push([url, opts]); return { ok: true, status: 200, json: async () => ({ items: [{ sha: "a" }] }) }; };
  const items = await fetchCommits("Ayenew-Tadesse", { today: "2026-09-30", fetchImpl });
  assert.equal(items.length, 1);
  assert.equal(asked.length, 1, "stops when a page isn't full");
  assert.match(decodeURIComponent(asked[0][0]), /^https:\/\/api\.github\.com\/search\/commits\?q=author:Ayenew-Tadesse author-date:>=2026-07-02&sort=author-date/);
  assert.equal(asked[0][1].headers.Authorization, undefined, "no token");
  await assert.rejects(fetchCommits("nobody", { today: "2026-09-30", fetchImpl: async () => ({ ok: false, status: 422 }) }), /doesn't know the user/);
});

test("portfolio activity: commits join the days, the 90-day total and the streak", async () => {
  const { mergeCommits, activityStats } = await import("../../app/core/portfolio.js");
  const act = { today: "2026-09-30", days: [{ date: "2026-09-28", done: 2 }] };
  const merged = mergeCommits(act, { "2026-09-29": { count: 3 }, "2026-09-30": { count: 1 }, "2026-10-01": { count: 5 }, "2026-05-01": { count: 4 } });
  assert.deepEqual(merged.days.map((d) => [d.date, d.done || 0, d.commits || 0]),
    [["2026-05-01", 0, 4], ["2026-09-28", 2, 0], ["2026-09-29", 0, 3], ["2026-09-30", 0, 1]], "future commits are left out");
  assert.equal(merged.commits_90, 4, "only the last 90 days count toward the total");
  assert.equal(merged.github, true);
  assert.equal(activityStats(merged).streak, 3, "commit days keep the streak going");
  assert.equal(activityStats(act).streak, 0, "without commits there's no streak up to today");
  assert.equal(mergeCommits(act, {}), act, "nothing to add: unchanged");
  assert.equal(mergeCommits(null, { "2026-09-29": { count: 1 } }), null, "activity switched off stays off");
});
