import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../server/api.js";
import { addDays, dayOf } from "../../app/core/dates.js";

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key" };
const today = dayOf(new Date(), "UTC");
const auth = { authorization: "Bearer lki_test_token_0123456789abcdef" };

function fakeDb(snapshot, calls = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    if (body.p_token !== "lki_test_token_0123456789abcdef") {
      return { ok: false, status: 401, json: async () => ({ code: "28000", message: "invalid token" }) };
    }
    if (url.endsWith("/api_create_task")) return { ok: true, json: async () => ({ id: "new", ...body.p_task }) };
    return { ok: true, json: async () => snapshot };
  };
}

const snapshot = {
  profile: { name: "Aye", timezone: "UTC" },
  settings: {},
  tasks: [
    { id: "1", title: "Finish report", date: today, due_date: today, priority: "high", status: "completed",
      completion_percentage: 100, completed_at: today + "T09:00:00Z", actual_minutes: 120 },
    { id: "2", title: "Email client", date: today, priority: "medium", status: "in_progress", completion_percentage: 50 },
    { id: "3", title: "Old invoice", date: addDays(today, -5), due_date: addDays(today, -2), priority: "urgent", status: "not_started", completion_percentage: 0 },
  ],
  milestones: [{ id: "m1", title: "Launch", deadline: addDays(today, 10), start_date: addDays(today, -20), percentage_complete: 10,
    status: "in_progress", target: 10, current_progress: 1, progress_mode: "tasks", created_at: addDays(today, -20) + "T00:00:00Z" }],
  goals: [],
  daily_notes: [{ date: today, notes: "Focused morning" }],
  weekly_notes: [],
};

test("api: index needs no token", async () => {
  const r = await handleRequest("index", {}, env, fakeDb(snapshot));
  assert.equal(r.status, 200);
  assert.ok(r.body.endpoints["GET /api/v1/today"]);
});

test("api: requests without a token are rejected", async () => {
  const r = await handleRequest("today", { headers: {} }, env, fakeDb(snapshot));
  assert.equal(r.status, 401);
});

test("api: a wrong token is rejected by the database", async () => {
  const r = await handleRequest("today", { headers: { authorization: "Bearer lki_wrong_000000000000000000" } }, env, fakeDb(snapshot));
  assert.equal(r.status, 401);
});

test("api: uses only the public anon key and passes the token to the database", async () => {
  const calls = [];
  await handleRequest("today", { headers: auth }, env, fakeDb(snapshot, calls));
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/api_snapshot");
  assert.equal(calls[0].headers.apikey, "anon-key");
  assert.equal(calls[0].body.p_token, "lki_test_token_0123456789abcdef");
});

test("api: today", async () => {
  const r = await handleRequest("today", { headers: auth }, env, fakeDb(snapshot));
  assert.equal(r.status, 200);
  assert.equal(r.body.counts.total, 2);
  assert.equal(r.body.counts.completed, 1);
  assert.equal(r.body.counts.overdue, 1);
  assert.equal(r.body.overdue[0].title, "Old invoice");
  assert.equal(r.body.overdue[0].status, "overdue");
  assert.equal(r.body.time_worked, "2h");
  assert.equal(typeof r.body.daily_score.score, "number");
  assert.equal(r.body.notes, "Focused morning");
  assert.ok(r.body.warnings.some((w) => w.includes("overdue")));
});

test("api: filters, overdue, milestones, plan, summary, quarter, scoring", async () => {
  const f = fakeDb(snapshot);
  const t = await handleRequest("tasks", { headers: auth, query: { priority: "urgent" } }, env, f);
  assert.deepEqual(t.body.tasks.map((x) => x.id), ["3"]);
  const o = await handleRequest("overdue", { headers: auth }, env, f);
  assert.equal(o.body.count, 1);
  const m = await handleRequest("milestones", { headers: auth, query: { pace: "behind" } }, env, f);
  assert.equal(m.body.milestones[0].title, "Launch");
  const p = await handleRequest("plan", { headers: auth }, env, f);
  assert.equal(p.body.tasks[0].title, "Old invoice");
  const s = await handleRequest("summary", { headers: auth, query: { period: "week" } }, env, f);
  assert.equal(s.status, 200);
  assert.match(s.body.text, /planned tasks completed/);
  const q = await handleRequest("quarter", { headers: auth }, env, f);
  assert.equal(q.status, 200);
  const sc = await handleRequest("scoring", { headers: auth }, env, f);
  assert.ok(sc.body.formula.length > 3);
});

test("api: bad input is a 400, unknown endpoint a 404", async () => {
  const f = fakeDb(snapshot);
  assert.equal((await handleRequest("summary", { headers: auth, query: { period: "decade" } }, env, f)).status, 400);
  assert.equal((await handleRequest("tasks", { headers: auth, query: { from: "yesterday" } }, env, f)).status, 400);
  assert.equal((await handleRequest("secrets", { headers: auth }, env, f)).status, 404);
  assert.equal((await handleRequest("today", { headers: auth, method: "DELETE" }, env, f)).status, 405);
});

test("api: creating a task only passes allowed fields", async () => {
  const calls = [];
  const r = await handleRequest("tasks", { method: "POST", headers: auth, body: { title: "Plan", user_id: "someone-else", priority: "high" } }, env, fakeDb(snapshot, calls));
  assert.equal(r.status, 201);
  assert.deepEqual(calls[0].body.p_task, { title: "Plan", priority: "high" });
  const bad = await handleRequest("tasks", { method: "POST", headers: auth, body: {} }, env, fakeDb(snapshot));
  assert.equal(bad.status, 400);
});
