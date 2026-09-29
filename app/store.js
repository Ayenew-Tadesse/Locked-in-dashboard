// Data layer. Two stores share one interface:
//   createSupabaseStore: the real database (Supabase Auth + RLS).
//   createMemoryStore:   demo mode (?demo=1), in memory only, nothing is saved.
import { computeMilestone, computeGoal } from "./core/insights.js";
import { displayName } from "./core/people.js";

const TASK_FIELDS = ["title", "description", "date", "due_date", "priority", "status", "category", "estimated_minutes",
  "actual_minutes", "completion_percentage", "notes", "milestone_id", "learning_changed", "learning_how", "learning_solved", "group_id"];
const MILESTONE_FIELDS = ["title", "description", "category", "start_date", "deadline", "target", "current_progress",
  "progress_mode", "status", "priority", "notes", "goal_id", "team_id"];
const PROJECT_FIELDS = ["name", "code", "description", "category", "stage", "status", "facts", "links", "checklist", "position"];
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
function newTokenString(prefix = "lki_") {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return prefix + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
      async signUp(email, password, name, greeting) {
        const data = check(await sb.auth.signUp({ email, password, options: { data: { name, greeting }, emailRedirectTo: location.origin + location.pathname } }));
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
      team.projects = team.team ? await this.loadProjects(team.team.id) : null;
      team.files = await this.loadFiles();
      team.messages = team.team ? await this.loadMessages(team.team.id) : null;
      return { profile, settings, tasks, milestones, goals, daily, weekly, me: userId, ...team };
    },

    /** Your team, its members (names from profiles) and, for the owner, open invitations. */
    async loadTeam() {
      const mine = check(await sb.from("team_members").select("team_id, role, teams(name)").eq("user_id", userId));
      if (!mine.length) return { team: null, members: [], invites: [] };
      const m = mine[0];
      const team = { id: m.team_id, name: m.teams?.name || "My team", role: m.role };
      // profiles.greeting comes from migration 20260927000000_greeting.sql; until
      // it has been run, load names without it rather than failing.
      let res = await sb.from("team_members").select("user_id, role, joined_at, profiles(name, email, greeting)").eq("team_id", team.id);
      if (res.error && /greeting/.test(res.error.message)) res = await sb.from("team_members").select("user_id, role, joined_at, profiles(name, email)").eq("team_id", team.id);
      const members = check(res)
        .map((r) => ({ user_id: r.user_id, role: r.role, joined_at: r.joined_at, name: displayName(r.profiles) || "Member", greeting: r.profiles?.greeting || null, email: r.profiles?.email || "" }));
      const invites = team.role === "owner" || team.role === "admin"
        ? check(await sb.from("team_invites").select("*").eq("team_id", team.id).is("accepted_at", null).is("revoked_at", null).order("created_at"))
        : [];
      return { team, members, invites };
    },
    /** The team's projects, or null when the projects table isn't there yet (20260929000000_projects.sql). */
    async loadProjects(teamId) {
      const { data, error } = await sb.from("projects").select("*").eq("team_id", teamId).order("position").order("created_at");
      if (error && /projects/.test(error.message)) return null;
      return check({ data, error });
    },
    async saveProject(teamId, p) {
      const write = (row) => p.id ? sb.from("projects").update(row).eq("id", p.id).select().single()
        : sb.from("projects").insert({ ...row, team_id: teamId }).select().single();
      const row = pick(p, PROJECT_FIELDS);
      let res = await write(row);
      // Before 20260930000000_project_description.sql, save without the description.
      if (res.error && "description" in row && /description/.test(res.error.message)) {
        const { description, ...rest } = row;
        res = await write(rest);
      }
      return check(res);
    },
    async deleteProject(id) { check(await sb.from("projects").delete().eq("id", id)); },

    /** The team chat's latest messages (oldest first), or null before 20261004000000_team_chat.sql is run. */
    async loadMessages(teamId) {
      const { data, error } = await sb.from("messages").select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(400);
      if (error && /messages/.test(error.message)) return null;
      return check({ data, error }).reverse();
    },
    async sendMessage(m) {
      return check(await sb.from("messages").insert({ team_id: m.team_id, recipient_id: m.recipient_id || null, body: m.body }).select().single());
    },
    async deleteMessage(id) { check(await sb.from("messages").delete().eq("id", id)); },
    /** New and deleted messages as they happen (Supabase Realtime). Returns a stop function. */
    subscribeMessages(teamId, { onInsert, onDelete }) {
      if (typeof sb.channel !== "function") return () => {};
      const ch = sb.channel(`chat-${teamId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` }, (p) => onInsert(p.new))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => p.old?.id && onDelete(p.old.id))
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    /** Files shared on tasks, or null before 20261001000000_task_files.sql is run. */
    async loadFiles() {
      const { data, error } = await sb.from("task_files").select("*").order("created_at");
      if (error && /task_files/.test(error.message)) return null;
      return check({ data, error });
    },
    /** Uploads into your own folder (<you>/<task>/...) and lists it on the task. */
    async uploadTaskFile(task, file) {
      const safe = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${userId}/${task.id}/${uuid().slice(0, 8)}-${safe}`;
      const up = await sb.storage.from("task-files").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) throw new Error(up.error.message);
      return check(await sb.from("task_files").insert({ task_id: task.id, path, name: (file.name || safe).slice(0, 255), size: file.size, mime: (file.type || "").slice(0, 150) || null }).select().single());
    },
    /** A short-lived link to open or download a file. */
    async fileUrl(f) {
      const { data, error } = await sb.storage.from("task-files").createSignedUrl(f.path, 600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    async deleteTaskFile(f) {
      await sb.storage.from("task-files").remove([f.path]);
      check(await sb.from("task_files").delete().eq("id", f.id));
    },
    async inviteMember(teamId, email, role = "member") {
      const res = await sb.from("team_invites").insert({ team_id: teamId, email: email.trim().toLowerCase(), invited_by: userId, ...(role === "admin" ? { role } : {}) }).select().single();
      if (res.error && role === "admin" && /role_check|violates check/.test(res.error.message)) throw new Error("run the latest SQL update in Supabase first (20261007000000_team_admins.sql)");
      return check(res);
    },
    /** Owner only: make someone an admin, or a colleague again (20261007000000_team_admins.sql). */
    async setMemberRole(memberId, role) {
      const { error } = await sb.rpc("set_member_role", { member: memberId, new_role: role });
      if (error && /set_member_role|schema cache/.test(error.message)) throw new Error("run the latest SQL update in Supabase first (20261007000000_team_admins.sql)");
      if (error) throw new Error(error.message);
    },
    async revokeInvite(id) { check(await sb.from("team_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id)); },
    /** Deletes the member's account and all their data (owner only; see 20260928000000_remove_member.sql). */
    async removeMember(teamId, memberId) {
      // Their shared files go too (the owner may delete members' files).
      const files = await sb.from("task_files").select("path").eq("user_id", memberId);
      if (!files.error && files.data?.length) await sb.storage.from("task-files").remove(files.data.map((f) => f.path));
      const { error } = await sb.rpc("remove_member_completely", { member: memberId });
      if (error && /remove_member_completely|schema cache/.test(error.message)) throw new Error("run the latest SQL update in Supabase first (20260928000000_remove_member.sql)");
      if (error) throw new Error(error.message);
    },
    async renameTeam(teamId, name) { return check(await sb.from("teams").update({ name }).eq("id", teamId).select().single()); },

    async saveTask(t) {
      const write = (row) => t.id ? sb.from("tasks").update(row).eq("id", t.id).select().single()
        : sb.from("tasks").insert(row).select().single();
      const row = taskRow(t);
      let res = await write(row);
      // Before 20261003000000_task_groups.sql, save without linking copies of an assignment.
      if (res.error && "group_id" in row && /group_id/.test(res.error.message)) {
        const { group_id, ...rest } = row;
        res = await write(rest);
      }
      return check(res);
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
      return check(await sb.from("profiles").update(pick(p, ["name", "timezone", "greeting"])).eq("id", userId).select().single());
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

    // Portfolio share links (20261005000000_portfolio.sql). null: not set up yet.
    async listPortfolioLinks() {
      const { data, error } = await sb.from("portfolio_links").select("id,name,token_prefix,created_at,expires_at,revoked_at,last_viewed_at,views").order("created_at", { ascending: false });
      if (error && /portfolio_links/.test(error.message)) return null;
      return check({ data, error });
    },
    /** The link's secret is returned once and never stored; only its SHA-256 hash is saved. */
    async createPortfolioLink({ name, expires_at }) {
      const token = newTokenString("lip_");
      const token_hash = await sha256Hex(token);
      const row = check(await sb.from("portfolio_links").insert({ name, expires_at: expires_at || null, token_hash, token_prefix: token.slice(0, 10) })
        .select("id,name,token_prefix,created_at,expires_at,revoked_at,last_viewed_at,views").single());
      return { token, row };
    },
    async revokePortfolioLink(id) { check(await sb.from("portfolio_links").update({ revoked_at: new Date().toISOString() }).eq("id", id)); },

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
  db.projects = db.projects || [];
  db.files = db.files || [];
  db.messages = db.messages || [];
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
  const portfolioLinks = [];

  return {
    mode: "demo",
    auth: {
      async session() { return { user: { id: "demo", email: "demo@example.com" } }; },
      onChange() {}, async signIn() {}, async signUp() { return {}; }, async magicLink() {}, async resetPassword() {},
      async updatePassword() {}, async signOut() { location.search = ""; },
    },
    async load() { recalc(); return JSON.parse(JSON.stringify({ ...db })); },
    async sendMessage(m) {
      const row = { id: uuid(), team_id: db.team.id, sender_id: db.me, recipient_id: m.recipient_id || null, body: m.body, created_at: now() };
      db.messages.push(row);
      return { ...row };
    },
    async deleteMessage(id) { db.messages = db.messages.filter((x) => x.id !== id); },
    subscribeMessages() { return () => {}; },
    async saveTask(t) {
      const saved = save("tasks", [...TASK_FIELDS, "user_id"], t);
      const row = db.tasks.find((r) => r.id === saved.id);
      row.user_id = row.user_id || db.me;
      if (!t.id && row.user_id !== db.me) row.assigned_by = db.me; // as the database stamps it
      return { ...row };
    },
    async loadTeam() { return JSON.parse(JSON.stringify({ team: db.team, members: db.members, invites: db.invites })); },
    async loadProjects() { return JSON.parse(JSON.stringify([...db.projects].sort((a, b) => a.position - b.position))); },
    async saveProject(teamId, p) {
      const row = { ...pick(p, PROJECT_FIELDS), team_id: teamId };
      if (p.id) { const i = db.projects.findIndex((x) => x.id === p.id); db.projects[i] = { ...db.projects[i], ...row, updated_at: now() }; return { ...db.projects[i] }; }
      const saved = { id: uuid(), facts: [], links: {}, checklist: [], status: "idle", position: db.projects.length, ...row, created_at: now(), updated_at: now() };
      db.projects.push(saved);
      return { ...saved };
    },
    async deleteProject(id) { db.projects = db.projects.filter((x) => x.id !== id); },
    async loadFiles() { return db.files.map((f) => ({ ...f })); },
    async uploadTaskFile(task, file) {
      const f = { id: uuid(), task_id: task.id, user_id: db.me, path: `${db.me}/${task.id}/${file.name}`, name: file.name, size: file.size, mime: file.type || null,
        url: URL.createObjectURL(file), created_at: now() };
      db.files.push(f);
      return { ...f };
    },
    async fileUrl(f) { return f.url || "about:blank"; },
    async deleteTaskFile(f) { db.files = db.files.filter((x) => x.id !== f.id); },
    async setMemberRole(memberId, role) {
      const m = db.members.find((x) => x.user_id === memberId);
      if (!m || m.role === "owner") throw new Error("Only the team owner can change this person's role.");
      m.role = role;
    },
    async inviteMember(teamId, email, role = "member") {
      const e = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Enter a valid email address.");
      if (db.invites.some((i) => i.email === e) || db.members.some((m) => m.email === e)) throw new Error("That email is already invited or in the team.");
      const inv = { id: uuid(), team_id: teamId, email: e, role, created_at: now() };
      db.invites.push(inv);
      return { ...inv };
    },
    async revokeInvite(id) { db.invites = db.invites.filter((i) => i.id !== id); },
    async removeMember(teamId, memberId) {
      db.members = db.members.filter((m) => m.user_id !== memberId);
      db.tasks = db.tasks.filter((t) => t.user_id !== memberId); // their data is deleted
      recalc();
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
    async saveProfile(p) { db.profile = { ...db.profile, ...pick(p, ["name", "timezone", "greeting"]) }; return db.profile; },
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
    async listPortfolioLinks() { return portfolioLinks.slice(); },
    async createPortfolioLink({ name, expires_at }) {
      const token = newTokenString("lip_");
      const row = { id: uuid(), name, token_prefix: token.slice(0, 10), created_at: now(), expires_at: expires_at || null, revoked_at: null, last_viewed_at: null, views: 0 };
      portfolioLinks.unshift(row);
      return { token, row: { ...row } };
    },
    async revokePortfolioLink(id) { const l = portfolioLinks.find((x) => x.id === id); if (l) l.revoked_at = now(); },
    async importData({ goals = [], milestones = [], tasks = [], dailyNotes = [] }) {
      db.goals.push(...goals); db.milestones.push(...milestones);
      db.tasks.push(...tasks.map((t) => ({ created_at: now(), ...t })));
      dailyNotes.forEach(upsertBy("daily", "date"));
      recalc();
    },
    newId: uuid,
  };
}
