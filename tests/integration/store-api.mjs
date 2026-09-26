// Integration test: the app's Supabase store and the Claude API against a
// real PostgreSQL database with the migration applied, served by PostgREST
// (the REST server Supabase uses). See docs/TESTING.md for setup:
//   1. tests/db/run.sh, then create the authenticator role and two users
//   2. start PostgREST on port 3010 with the JWT secret below
//   3. npm i --no-save @supabase/supabase-js && node tests/integration/store-api.mjs
import http from "node:http";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { supabaseStoreFromClient } from "../../app/store.js";
import { handleRequest } from "../../server/api.js";
import { buildLegacyImport } from "../../app/legacy-import.js";

// Proxy /rest/v1/* -> PostgREST, like Supabase's gateway.
const proxy = http.createServer((req, res) => {
  const up = http.request({ host: "localhost", port: 3010, path: req.url.replace(/^\/rest\/v1/, ""), method: req.method, headers: { ...req.headers, host: "localhost:3010" } },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(up);
}).listen(3011);
const URL_ = "http://localhost:3011";
const secret = "a-very-long-test-secret-for-local-postgrest-only-000";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims) {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return h + "." + p + "." + crypto.createHmac("sha256", secret).update(h + "." + p).digest("base64url");
}
const anonKey = jwt({ role: "anon" });
function storeFor(uid) {
  const sb = createClient(URL_, anonKey, { accessToken: async () => jwt({ role: "authenticated", sub: uid }) });
  const client = { from: (...a) => sb.from(...a), rpc: (...a) => sb.rpc(...a),
    auth: { getSession: async () => ({ data: { session: { user: { id: uid } } } }), onAuthStateChange() {} } };
  return supabaseStoreFromClient(client);
}
const ok = (m) => console.log("ok -", m);
const ME = "11111111-1111-1111-1111-111111111111", OTHER = "22222222-2222-2222-2222-222222222222";
const today = new Date().toISOString().slice(0, 10);

try {
  const me = storeFor(ME); await me.auth.session();
  let d = await me.load();
  assert.equal(d.profile.name, "Me"); ok("load(): profile created on sign-up is readable");

  const ms = await me.saveMilestone({ title: "Ship v1", progress_mode: "tasks", deadline: today, priority: "high", status: "not_started" });
  const t1 = await me.saveTask({ title: "Task one", date: today, due_date: today, priority: "high", status: "not_started", completion_percentage: 0, milestone_id: ms.id, actual_minutes: 30 });
  const t2 = await me.saveTask({ title: "Task two", date: today, priority: "low", status: "not_started", completion_percentage: 0, milestone_id: ms.id });
  assert.ok(t1.id && t2.id); ok("saveTask() inserts and returns rows");
  const done = await me.saveTask({ ...t1, status: "completed" });
  assert.ok(done.completed_at); assert.equal(done.completion_percentage, 100); ok("completing stamps completed_at via trigger");
  let p = await me.refreshProgress();
  assert.equal(Number(p.milestones[0].percentage_complete), 50); ok("milestone is 50% after refreshProgress()");
  await me.saveTask({ ...t2, title: "Task two (edited)" });
  await me.deleteTask(t2.id);
  p = await me.refreshProgress();
  assert.equal(Number(p.milestones[0].percentage_complete), 100); assert.equal(p.milestones[0].status, "completed");
  ok("edit + delete work; milestone auto-completes");

  await me.upsertDailyScores([{ date: today, score: 88, completed_tasks: 1, total_tasks: 1, breakdown: { x: 1 } }]);
  await me.saveDailyNote(today, "Great focus");
  await me.upsertDailyScores([{ date: today, score: 90, completed_tasks: 1, total_tasks: 1, breakdown: { x: 2 } }]);
  d = await me.load();
  assert.equal(Number(d.daily[0].score), 90); assert.equal(d.daily[0].notes, "Great focus");
  ok("score snapshots upsert without wiping notes");
  await me.saveWeeklyNote("2026-09-21", "2026-09-27", "Solid week");
  await me.saveSettings({ weights: { completion: 50 } });
  await me.saveProfile({ timezone: "America/New_York" });
  d = await me.load();
  assert.equal(d.settings.scoring.weights.completion, 50); assert.equal(d.profile.timezone, "America/New_York"); assert.equal(d.weekly[0].notes, "Solid week");
  ok("settings, profile and weekly notes persist");

  const g = await me.saveGoal({ title: "Q goal", quarter: 3, year: 2026, progress_mode: "milestones", status: "not_started", target: 100, current_progress: 0 });
  await me.saveMilestone({ ...ms, goal_id: g.id });
  p = await me.refreshProgress();
  assert.equal(Number(p.goals[0].percentage_complete), 100); ok("goal averages its milestones");

  // Import the original dashboard's data.
  const legacy = { daily: { "2026-09-25": { tasks: [{ id: "a", text: "Old task", done: true }] } }, reports: { "2026-09-25": { summary: "Good day", next: ["More"] } },
    objective: { objective: "Ship", phases: [{ id: "q1", tag: "Q1 · Sep–Dec 2026", text: "Foundation" }] },
    checklists: { q1: [{ id: "1", text: "Build nav", deadline: "Oct 2026", done: true }, { id: "2", text: "Build auth", deadline: "Nov 2026", done: false }] } };
  await me.importData(buildLegacyImport(legacy, me.newId)); await me.markLegacyImported();
  d = await me.load();
  const goal = d.goals.find((x) => x.title.startsWith("Q1 roadmap"));
  assert.equal(goal.quarter, 4); assert.equal(Number(goal.percentage_complete), 50);
  assert.ok(d.tasks.find((x) => x.title === "Old task" && x.status === "completed" && x.date === "2026-09-25"));
  assert.match(d.daily.find((x) => x.date === "2026-09-25").notes, /Good day/);
  assert.ok(d.settings.legacy_imported_at);
  ok("legacy import: roadmap -> Q4 2026 goal at 50%, tasks and reports imported");

  // Another user sees none of it and can't change it.
  const other = storeFor(OTHER); await other.auth.session();
  const od = await other.load();
  assert.equal(od.tasks.length, 0); assert.equal(od.milestones.length, 0); assert.equal(od.goals.length, 0);
  await other.saveTask({ id: t1.id, title: "hijack" }).then(() => assert.fail("updated another user's task"), () => {});
  ok("RLS: a second user sees nothing and cannot edit the first user's task");

  // Tokens + the Claude API against the real database.
  const { token } = await me.createToken({ name: "Claude", scopes: ["read"], expires_at: null });
  const env = { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: anonKey };
  const auth = { authorization: "Bearer " + token };
  let r = await handleRequest("today", { headers: auth }, env);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.tasks.some((x) => x.title === "Task one")); assert.equal(r.body.notes, "Great focus");
  ok("API /today with a real token returns this user's data");
  r = await handleRequest("summary", { headers: auth, query: { period: "quarter", date: "2026-10-15" } }, env);
  assert.equal(r.status, 200); ok("API /summary?period=quarter works");
  r = await handleRequest("tasks", { method: "POST", headers: auth, body: { title: "From Claude" } }, env);
  assert.equal(r.status, 401); ok("API: read-only token cannot create tasks");
  const w = await me.createToken({ name: "Claude write", scopes: ["read", "write"], expires_at: null });
  r = await handleRequest("tasks", { method: "POST", headers: { authorization: "Bearer " + w.token }, body: { title: "From Claude", date: today } }, env);
  assert.equal(r.status, 201); ok("API: write token creates a task");
  const list = await me.listTokens();
  assert.ok(list.every((x) => !("token_hash" in x))); ok("listTokens() never returns hashes");
  await me.revokeToken(list.find((x) => x.name === "Claude").id);
  r = await handleRequest("today", { headers: auth }, env);
  assert.equal(r.status, 401); ok("API: revoked token is rejected");
  r = await handleRequest("today", { headers: { authorization: "Bearer " + w.token } }, env);
  assert.ok(!r.body.tasks.some((x) => x.title === "hijack")); ok("API data unaffected by the other user");
  console.log("Integration passed.");
} catch (e) { console.error("FAILED:", e); process.exitCode = 1; }
finally { proxy.close(); }
