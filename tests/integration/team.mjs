// Integration test: the team portal through the app's real Supabase data
// layer (supabase-js -> PostgREST -> the migrated database). See
// docs/TESTING.md for setup; it needs the owner (me@example.com) signed up
// first and PostgREST on port 3010.
import http from "node:http"; import crypto from "node:crypto"; import assert from "node:assert/strict"; import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { supabaseStoreFromClient } from "../../app/store.js";
const proxy = http.createServer((req, res) => { const up = http.request({ host: "localhost", port: 3010, path: req.url.replace(/^\/rest\/v1/, ""), method: req.method, headers: { ...req.headers, host: "localhost:3010" } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }); req.pipe(up); }).listen(3011);
const secret = "a-very-long-test-secret-for-local-postgrest-only-000";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (c) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...c }); return h + "." + p + "." + crypto.createHmac("sha256", secret).update(h + "." + p).digest("base64url"); };
const storeFor = (uid) => { const sb = createClient("http://localhost:3011", jwt({ role: "anon" }), { accessToken: async () => jwt({ role: "authenticated", sub: uid }) });
  return supabaseStoreFromClient({ from: (...a) => sb.from(...a), rpc: (...a) => sb.rpc(...a), auth: { getSession: async () => ({ data: { session: { user: { id: uid } } } }), onAuthStateChange() {} } }); };
const ok = (m) => console.log("ok -", m);
const OWNER = "11111111-1111-1111-1111-111111111111", ANA = "22222222-2222-2222-2222-222222222222";
// Sign-ups are simulated by inserting into auth.users, as Supabase Auth does.
const psql = (sql) => execSync(`psql -q -d lockedin_test -c "${sql}"`, { stdio: "pipe" }).toString();
try {
  const owner = storeFor(OWNER); await owner.auth.session();
  let d = await owner.load();
  assert.equal(d.team.role, "owner"); assert.equal(d.members.length, 1); ok("first account owns a team");
  // Uninvited sign-up is refused.
  try { psql("insert into auth.users (id,email) values ('99999999-9999-9999-9999-999999999999','x@example.com')"); assert.fail("uninvited accepted"); } catch (e) { assert.match(String(e.stderr || e.message), /invitation only/); }
  ok("uninvited sign-up refused");
  await owner.inviteMember(d.team.id, "Ana@Example.com");
  d = await owner.load(); assert.equal(d.invites.length, 1); assert.equal(d.invites[0].email, "ana@example.com"); ok("owner invites (email lower-cased)");
  psql(`insert into auth.users (id,email,raw_user_meta_data) values ('${ANA}','ana@example.com', jsonb_build_object('name','Ana'))`);
  const ana = storeFor(ANA); await ana.auth.session();
  let a = await ana.load();
  assert.equal(a.team.role, "member"); assert.equal(a.members.length, 2); assert.equal(a.invites.length, 0); ok("invited colleague joins as a member; sees teammates, not invites");
  // Team goal + milestone from the owner; Ana sees them.
  const g = await owner.saveGoal({ title: "Team goal", quarter: 4, year: 2026, progress_mode: "milestones", status: "not_started", target: 100, current_progress: 0, team_id: d.team.id });
  const ms = await owner.saveMilestone({ title: "Team milestone", goal_id: g.id, progress_mode: "tasks", status: "not_started", priority: "high" });
  await owner.saveMilestone({ title: "Owner only", progress_mode: "tasks", status: "not_started", priority: "low" });
  a = await ana.load();
  assert.deepEqual(a.milestones.map((m) => m.title), ["Team milestone"]); ok("member sees team milestones only");
  // Owner assigns Ana a task on the team milestone.
  const t = await owner.saveTask({ title: "Ana: build search", date: "2026-09-28", priority: "high", status: "not_started", completion_percentage: 0, milestone_id: ms.id, user_id: ANA });
  assert.equal(t.user_id, ANA); assert.equal(t.assigned_by, OWNER); ok("owner assigns a task");
  a = await ana.load();
  assert.equal(a.tasks.length, 1); assert.equal(a.tasks[0].assigned_by, OWNER); ok("member sees the assigned task");
  await ana.saveTask({ ...a.tasks[0], status: "completed", learning_solved: "Search works" });
  const p = await owner.refreshProgress();
  assert.equal(Number(p.milestones.find((m) => m.title === "Team milestone").percentage_complete), 100);
  assert.equal(Number(p.goals[0].percentage_complete), 100); ok("member's completion updates the owner's team milestone and goal");
  d = await owner.load();
  assert.equal(d.tasks.find((x) => x.id === t.id).learning_solved, "Search works"); ok("owner sees the member's learning log");
  await owner.saveTask({ title: "Owner private", date: "2026-09-28", priority: "low", status: "not_started", completion_percentage: 0 });
  a = await ana.load(); assert.equal(a.tasks.length, 1); ok("member doesn't see the owner's tasks");
  await ana.inviteMember(a.team.id, "friend@example.com").then(() => assert.fail("member invited"), () => {}); ok("member can't invite");
  await ana.saveTask({ title: "for owner", user_id: OWNER, date: "2026-09-28", priority: "low", status: "not_started", completion_percentage: 0 }).then(() => assert.fail("member assigned"), () => {}); ok("member can't assign");
  await owner.removeMember(d.team.id, ANA);
  d = await owner.load(); assert.equal(d.members.length, 1); assert.ok(!d.tasks.some((x) => x.user_id === ANA)); ok("owner removes a member; their work leaves the owner's view");
  console.log("Team integration passed.");
} catch (e) { console.error("FAILED:", e); process.exitCode = 1; } finally { proxy.close(); }
