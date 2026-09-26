// Data layer. Two stores share one interface:
//   createSupabaseStore: the real database (Supabase Auth + RLS).
//   createMemoryStore:   demo mode (?demo=1), in memory only, nothing is saved.
import { computeMilestone, computeGoal } from "./core/insights.js";

const TASK_FIELDS = ["title", "description", "date", "due_date", "priority", "status", "category", "estimated_minutes",
  "actual_minutes", "completion_percentage", "notes", "milestone_id", "learning_changed", "learning_how", "learning_solved"];
const MILESTONE_FIELDS = ["title", "description", "category", "start_date", "deadline", "target", "current_progress",
  "progress_mode", "status", "priority", "notes", "goal_id", "team_id"];
const GOAL_FIELDS = ["title", "description", "quarter", "year", "deadline", "target", "current_progress", "progress_mode",
  "status", "notes", "team_id"];
// A task's user_id is who does it: the team owner can set it to assign work.
const taskRow = (t) => ({ ...pick(t, TASK_FIELDS), ...(t.user_id ? { user_id: t.user_id } : {}) });

const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f] === "" ? null : obj[f]]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2));

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newTokenString() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "lki_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export async function createSupabaseStore({ supabaseUrl, supabaseAnonKey }) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm");
  const sb = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return supabaseStoreFromClient(sb);
}

/** Exported separately so tests can pass their own client. */
export function supabaseStoreFromClient(sb) {
  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  // PostgREST returns at most 1,000 rows per request: page through.
  async function all(table, order = "created_at") {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await sb.from(table).select("*").order(order).order("id").range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }
  let userId = null;

  return {
    mode: "supabase",
    auth: {
      async session() { const { data } = await sb.auth.getSession(); userId = data.session?.user?.id || null; return data.session; },
      onChange(cb) { sb.auth.onAuthStateChange((event, s) => { userId = s?.user?.id || null; setTimeout(() => cb(s, event), 0); }); },
      async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
      async signUp(email, password, name) {
        const data = check(await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } }));
        return { needsConfirmation: !data.session };
      },
      async magicLink(email) { check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })); },
      async resetPassword(email) { check(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async updatePassword(password) { check(await sb.auth.updateUser({ password })); },
      async signOut() { await sb.auth.signOut(); },
    },

    async load() {
      const [profile, settings, tasks, milestones, goals, daily, weekly] = await Promise.all([
        sb.from("profiles").select("*").eq("id", userId).maybeSingle().then(check),
        sb.from("user_settings").select("*").eq("user_id", userId).maybeSingle().then(check),
        all("tasks"), all("milestones"), all("quarterly_goals"), all("daily_scores", "date"), all("weekly_scores", "week_start"),
      ]);
      const team = await this.loadTeam();
      return { profile, settings, tasks, milestones, goals, daily, weekly, me: userId, ...team };
    },

    /** Your team, its members (names from profiles) and, for the owner, open invitations. */
    async loadTeam() {
      const mine = check(await sb.from("team_members").select("team_id, role, teams(name)").eq("user_id", userId));
      if (!mine.length) return { team: null, members: [], invites: [] };
      const m = mine[0];
      const team = { id: m.team_id, name: m.teams?.name || "My team", role: m.role };
      const members = check(await sb.from("team_members").select("user_id, role, joined_at, profiles(name, email)").eq("team_id", team.id))
        .map((r) => ({ user_id: r.user_id, role: r.role, joined_at: r.joined_at, name: r.profiles?.name || r.profiles?.email || "Member", email: r.profiles?.email || "" }));
      const invites = team.role === "owner"
        ? check(await sb.from("team_invites").select("*").eq("team_id", team.id).is("accepted_at", null).is("revoked_at", null).order("created_at"))
        : [];
      return { team, members, invites };
    },
    async inviteMember(teamId, email) {
      return check(await sb.from("team_invites").insert({ team_id: teamId, email: email.trim().toLowerCase(), invited_by: userId }).select().single());
    },
    async revokeInvite(id) { check(await sb.from("team_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id)); },
    async removeMember(teamId, memberId) { check(await sb.from("team_members").delete().eq("team_id", teamId).eq("user_id", memberId)); },
    async renameTeam(teamId, name) { return check(await sb.from("teams").update({ name }).eq("id", teamId).select().single()); },

    async saveTask(t) {
      const row = taskRow(t);
      return t.id ? check(await sb.from("tasks").update(row).eq("id", t.id).select().single())
        : check(await sb.from("tasks").insert(row).select().single());
    },
    async deleteTask(id) { check(await sb.from("tasks").delete().eq("id", id)); },

    async saveMilestone(m) {
      const row = pick(m, MILESTONE_FIELDS);
      if (row.progress_mode === "tasks") { delete row.target; delete row.current_progress; }
      return m.id ? check(await sb.from("milestones").update(row).eq("id", m.id).select().single())
        : check(await sb.from("milestones").insert(row).select().single());
    },
    async deleteMilestone(id) { check(await sb.from("milestones").delete().eq("id", id)); },

    async saveGoal(g) {
      const row = pick(g, GOAL_FIELDS);
      return g.id ? check(await sb.from("quarterly_goals").update(row).eq("id", g.id).select().single())
        : check(await sb.from("quarterly_goals").insert(row).select().single());
    },
    async deleteGoal(id) { check(await sb.from("quarterly_goals").delete().eq("id", id)); },

    /** Progress is recalculated by database triggers; fetch the results. */
    async refreshProgress() {
      const [milestones, goals] = await Promise.all([all("milestones"), all("quarterly_goals")]);
      return { milestones, goals };
    },

    async upsertDailyScores(rows) {
      if (rows.length) check(await sb.from("daily_scores").upsert(rows, { onConflict: "user_id,date" }));
    },
    async upsertWeeklyScores(rows) {
      if (rows.length) check(await sb.from("weekly_scores").upsert(rows, { onConflict: "user_id,week_start" }));
    },
    async saveDailyNote(date, notes) {
      return check(await sb.from("daily_scores").upsert({ date, notes: notes || null }, { onConflict: "user_id,date" }).select().single());
    },
    async saveWeeklyNote(week_start, week_end, notes) {
      return check(await sb.from("weekly_scores").upsert({ week_start, week_end, notes: notes || null }, { onConflict: "user_id,week_start" }).select().single());
    },

    async saveSettings(scoring) {
      return check(await sb.from("user_settings").upsert({ user_id: userId, scoring }).select().single());
    },
    async saveProfile(p) {
      return check(await sb.from("profiles").update(pick(p, ["name", "timezone"])).eq("id", userId).select().single());
    },
    async markLegacyImported() {
      check(await sb.from("user_settings").upsert({ user_id: userId, legacy_imported_at: new Date().toISOString() }));
    },
    async markPlanLoaded() {
      check(await sb.from("user_settings").upsert({ user_id: userId, plan_loaded_at: new Date().toISOString() }));
    },
    async savePreferences(preferences) {
      return check(await sb.from("user_settings").upsert({ user_id: userId, preferences }).select().single());
    },

    async listTokens() {
      return check(await sb.from("api_tokens").select("id,name,token_prefix,scopes,created_at,last_used_at,expires_at,revoked_at").order("created_at", { ascending: false }));
    },
    /** The token itself is returned once and never stored; only its SHA-256 hash is saved. */
    async createToken({ name, scopes, expires_at }) {
      const token = newTokenString();
      const token_hash = await sha256Hex(token);
      const row = check(await sb.from("api_tokens").insert({ name, scopes, expires_at: expires_at || null, token_hash, token_prefix: token.slice(0, 10) })
        .select("id,name,token_prefix,scopes,created_at,last_used_at,expires_at,revoked_at").single());
      return { token, row };
    },
    async revokeToken(id) { check(await sb.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id)); },

    /** Bulk import (ids generated here so rows can reference each other). */
    async importData({ goals = [], milestones = [], tasks = [], dailyNotes = [] }) {
      for (const [table, rows] of [["quarterly_goals", goals], ["milestones", milestones], ["tasks", tasks]]) {
        for (let i = 0; i < rows.length; i += 500) check(await sb.from(table).insert(rows.slice(i, i + 500)));
      }
      if (dailyNotes.length) check(await sb.from("daily_scores").upsert(dailyNotes, { onConflict: "user_id,date" }));
    },
    newId: uuid,
  };
}

// ---------------------------------------------------------------------------
// Demo (memory only)
// ---------------------------------------------------------------------------

export function createMemoryStore(seed) {
  const db = JSON.parse(JSON.stringify(seed));
  // A preview account owns a team (sample colleagues come from the seed).
  db.me = db.me || db.profile?.id || "demo";
  db.team = db.team || { id: "team-preview", name: "My team", role: "owner" };
  db.members = db.members || [{ user_id: db.me, role: "owner", name: db.profile?.name || "You", email: db.profile?.email || "" }];
  db.invites = db.invites || [];
  db.tasks.forEach((t) => { t.user_id = t.user_id || db.me; });
  const now = () => new Date().toISOString();
  const recalc = () => {
    db.milestones = db.milestones.map((m) => computeMilestone(m, db.tasks));
    db.goals = db.goals.map((g) => computeGoal(g, db.milestones));
  };
  function save(list, fields, obj) {
    let row;
    if (obj.id) {
      row = db[list].find((r) => r.id === obj.id);
      if (!row) throw new Error("Not found");
      Object.assign(row, pick(obj, fields), { updated_at: now() });
    } else {
      row = { id: uuid(), created_at: now(), updated_at: now(), ...pick(obj, fields) };
      db[list].push(row);
    }
    if (list === "tasks") { // same rule as the database trigger
      if (row.status === "completed") { row.completion_percentage = 100; row.completed_at = row.completed_at || now(); }
      else row.completed_at = null;
    }
    recalc();
    return { ...db[list].find((r) => r.id === row.id) };
  }
  const upsertBy = (list, key) => (row) => {
    const i = db[list].findIndex((r) => r[key] === row[key]);
    if (i < 0) db[list].push({ id: uuid(), ...row }); else db[list][i] = { ...db[list][i], ...row };
    return db[list].find((r) => r[key] === row[key]);
  };
  const tokens = [];

  return {
    mode: "demo",
    auth: {
      async session() { return { user: { id: "demo", email: "demo@example.com" } }; },
      onChange() {}, async signIn() {}, async signUp() { return {}; }, async magicLink() {}, async resetPassword() {},
      async updatePassword() {}, async signOut() { location.search = ""; },
    },
    async load() { recalc(); return JSON.parse(JSON.stringify({ ...db })); },
    async saveTask(t) {
      const saved = save("tasks", [...TASK_FIELDS, "user_id"], t);
      const row = db.tasks.find((r) => r.id === saved.id);
      row.user_id = row.user_id || db.me;
      if (!t.id && row.user_id !== db.me) row.assigned_by = db.me; // as the database stamps it
      return { ...row };
    },
    async loadTeam() { return JSON.parse(JSON.stringify({ team: db.team, members: db.members, invites: db.invites })); },
    async inviteMember(teamId, email) {
      const e = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Enter a valid email address.");
      if (db.invites.some((i) => i.email === e) || db.members.some((m) => m.email === e)) throw new Error("That email is already invited or in the team.");
      const inv = { id: uuid(), team_id: teamId, email: e, role: "member", created_at: now() };
      db.invites.push(inv);
      return { ...inv };
    },
    async revokeInvite(id) { db.invites = db.invites.filter((i) => i.id !== id); },
    async removeMember(teamId, memberId) {
      db.members = db.members.filter((m) => m.user_id !== memberId);
      db.tasks = db.tasks.filter((t) => t.user_id !== memberId); // as RLS hides them
    },
    async renameTeam(teamId, name) { db.team = { ...db.team, name }; return { id: teamId, name }; },
    async deleteTask(id) { db.tasks = db.tasks.filter((t) => t.id !== id); recalc(); },
    async saveMilestone(m) { return save("milestones", MILESTONE_FIELDS, m); },
    async deleteMilestone(id) {
      db.milestones = db.milestones.filter((m) => m.id !== id);
      db.tasks.forEach((t) => { if (t.milestone_id === id) t.milestone_id = null; });
      recalc();
    },
    async saveGoal(g) { return save("goals", GOAL_FIELDS, g); },
    async deleteGoal(id) {
      db.goals = db.goals.filter((g) => g.id !== id);
      db.milestones.forEach((m) => { if (m.goal_id === id) m.goal_id = null; });
      recalc();
    },
    async refreshProgress() { recalc(); return JSON.parse(JSON.stringify({ milestones: db.milestones, goals: db.goals })); },
    async upsertDailyScores(rows) { rows.forEach(upsertBy("daily", "date")); },
    async upsertWeeklyScores(rows) { rows.forEach(upsertBy("weekly", "week_start")); },
    async saveDailyNote(date, notes) { return { ...upsertBy("daily", "date")({ date, notes: notes || null }) }; },
    async saveWeeklyNote(week_start, week_end, notes) { return { ...upsertBy("weekly", "week_start")({ week_start, week_end, notes: notes || null }) }; },
    async saveSettings(scoring) { db.settings = { ...db.settings, scoring }; return db.settings; },
    async saveProfile(p) { db.profile = { ...db.profile, ...pick(p, ["name", "timezone"]) }; return db.profile; },
    async markLegacyImported() { db.settings.legacy_imported_at = now(); },
    async markPlanLoaded() { db.settings.plan_loaded_at = now(); },
    async savePreferences(preferences) { db.settings = { ...db.settings, preferences }; return db.settings; },
    async listTokens() { return tokens.slice(); },
    async createToken({ name, scopes, expires_at }) {
      const token = newTokenString();
      const row = { id: uuid(), name, scopes, expires_at: expires_at || null, token_prefix: token.slice(0, 10), created_at: now(), last_used_at: null, revoked_at: null };
      tokens.unshift(row);
      return { token, row };
    },
    async revokeToken(id) { const t = tokens.find((x) => x.id === id); if (t) t.revoked_at = now(); },
    async importData({ goals = [], milestones = [], tasks = [], dailyNotes = [] }) {
      db.goals.push(...goals); db.milestones.push(...milestones);
      db.tasks.push(...tasks.map((t) => ({ created_at: now(), ...t })));
      dailyNotes.forEach(upsertBy("daily", "date"));
      recalc();
    },
    newId: uuid,
  };
}
