#!/usr/bin/env node
// Mark tasks complete on the dashboard with a personal token that has the
// "complete" permission (Settings → API access for Claude → New token).
//
//   LOCKEDIN_TASK_TOKEN=lki_... node scripts/complete-task.mjs "Task title" ["Another title" ...]
//   LOCKEDIN_TASK_TOKEN=lki_... node scripts/complete-task.mjs --id <task uuid>
//
// Without LOCKEDIN_TASK_TOKEN the token is expected in the x-lockedin-token
// header, added by the environment (e.g. a Claude Code credential), so the
// script never sees it.
//
// It calls the database function api_complete_task through Supabase's REST
// API with the site's public key (from config.js). The token can only mark
// its owner's tasks complete; it never reads, edits or deletes anything.
import { readFileSync } from "node:fs";

const token = process.env.LOCKEDIN_TASK_TOKEN;
const config = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const url = config.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
const key = config.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
if (!url || !key) {
  console.error("config.js has no Supabase URL or public key.");
  process.exit(2);
}

const args = process.argv.slice(2);
const jobs = args[0] === "--id" ? args.slice(1).map((id) => ({ p_task_id: id })) : args.map((title) => ({ p_title: title }));
if (!jobs.length) {
  console.error('Usage: node scripts/complete-task.mjs "Task title" [...]  |  --id <uuid> [...]');
  process.exit(2);
}

let failed = 0;
for (const job of jobs) {
  const what = job.p_title ?? job.p_task_id;
  const res = await fetch(`${url}/rest/v1/rpc/api_complete_task`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ ...(token ? { p_token: token } : {}), ...job }),
  });
  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 200) }; }
  if (!res.ok) {
    failed++;
    console.error(`✗ ${what}: ${body.message || res.status}${res.status === 403 && body.message === "invalid token" ? " (no token, or it lacks the complete permission)" : ""}`);
  } else console.log(`✓ ${body.title}${body.already_completed ? " (was already complete)" : ""}`);
}
process.exit(failed ? 1 : 0);
