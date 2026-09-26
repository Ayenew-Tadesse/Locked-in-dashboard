// Settings: profile, the scoring formula (visible and editable), API access
// for Claude, data import/export.
import { state, saveScoring, saveProfile, reload, toast } from "../state.js";
import { DEFAULT_SCORING, COMPONENT_LABELS, describeFormula, resolveScoring } from "../core/scoring.js";
import { formatDay, dayOf } from "../core/dates.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";
import { buildYearSetup } from "../plan/setup.js";
import { PLAN_STATS } from "../plan/year-plan.js";
import { DEFAULT_REPOS } from "../report/daily-report.js";

export function renderSettings(el) {
  const cfg = state.cfg;
  const num = (name, value, label, min = 0, max = 1000, step = 1) =>
    `<label class="li-field">${esc(label)}<input type="number" name="${name}" value="${esc(value)}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;
  el.innerHTML = `
    <header class="li-view-head"><div><span class="card-label">Settings</span><h2 class="li-h2">Settings</h2></div></header>

    <section class="li-card" id="scoring">
      <div class="li-card-head"><span class="card-label">Scoring formula</span></div>
      <ol class="li-formula">${describeFormula(cfg).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
      <p class="li-sub">Full explanation with a worked example: <a class="li-link" href="https://github.com/Ayenew-Tadesse/Locked-in-dashboard/blob/main/docs/SCORING.md" target="_blank" rel="noopener">docs/SCORING.md</a>. Changing these re-scores past days.</p>
      <form class="li-form li-form-grid" id="li-scoring-form">
        <fieldset><legend>Daily score weights</legend>
          ${Object.keys(DEFAULT_SCORING.weights).map((k) => num(`weights.${k}`, cfg.weights[k], COMPONENT_LABELS[k])).join("")}
        </fieldset>
        <fieldset><legend>Priority weights</legend>
          ${Object.keys(DEFAULT_SCORING.priorityWeights).map((k) => num(`priorityWeights.${k}`, cfg.priorityWeights[k], k[0].toUpperCase() + k.slice(1), 0, 100, 0.5)).join("")}
        </fieldset>
        <fieldset><legend>Targets &amp; penalties</legend>
          ${num("dailyMinutesTarget", cfg.dailyMinutesTarget, "Daily time target (min)", 0, 1440, 5)}
          ${num("overduePenalty", cfg.overduePenalty, "Points off per overdue task", 0, 100)}
          ${num("overduePenaltyCap", cfg.overduePenaltyCap, "Max overdue penalty", 0, 100)}
          ${num("period.activeDaysPerWeek", cfg.period.activeDaysPerWeek, "Active days per week target", 1, 7)}
        </fieldset>
        <fieldset><legend>Weekly &amp; quarterly blend</legend>
          ${num("period.dailyAverageWeight", cfg.period.dailyAverageWeight, "Week: average daily score")}
          ${num("period.consistencyWeight", cfg.period.consistencyWeight, "Week: consistency")}
          ${num("quarter.weeklyAverageWeight", cfg.quarter.weeklyAverageWeight, "Quarter: average weekly score")}
          ${num("quarter.goalProgressWeight", cfg.quarter.goalProgressWeight, "Quarter: goal progress")}
        </fieldset>
        <fieldset><legend>Warnings</legend>
          ${num("warnings.deadlineDays", cfg.warnings.deadlineDays, "Deadline approaching (days)", 0, 60)}
          ${num("warnings.milestoneDays", cfg.warnings.milestoneDays, "Milestone approaching (days)", 0, 365)}
          ${num("warnings.quarterEndDays", cfg.warnings.quarterEndDays, "Quarter ending (days)", 0, 92)}
          ${num("warnings.lowCompletionRate", cfg.warnings.lowCompletionRate, "Low completion below (%)", 0, 100)}
        </fieldset>
        <div class="li-form-actions"><button type="button" class="li-btn ghost" id="li-scoring-reset">Restore defaults</button><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save scoring</button></div>
      </form>
    </section>

    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Profile</span></div>
      <form class="li-form li-form-grid" id="li-profile-form">
        <label class="li-field">Name<input name="name" maxlength="120" value="${esc(state.profile?.name || "")}"></label>
        <label class="li-field">Time zone<input name="timezone" maxlength="64" value="${esc(state.profile?.timezone || "")}" placeholder="e.g. America/New_York"></label>
        <p class="li-sub full">Signed in as ${esc(state.profile?.email || "")}. The time zone decides when "today" starts for scores and the API.</p>
        <div class="li-form-actions full"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save profile</button></div>
      </form>
    </section>

    <section class="li-card" id="api">
      <div class="li-card-head"><span class="card-label">API access for Claude</span><button type="button" class="li-btn small" id="li-new-token">+ New token</button></div>
      <p class="li-sub">Personal access tokens let an assistant read your data through <code>/api/v1</code> (e.g. "What are my tasks today?"). A token only sees your data, can be revoked at any time, and is shown once. Only a fingerprint (SHA-256) is stored.</p>
      <div id="li-tokens"><p class="li-empty">Loading…</p></div>
    </section>

    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Your data</span></div>
      <p class="li-sub">Everything is stored in your database${state.store.mode === "demo" ? " (demo mode: in memory only, nothing is saved)" : ""}. Download a full copy at any time.</p>
      <div class="li-btn-row">
        <button type="button" class="li-btn" id="li-export">Download backup (JSON)</button>
        ${!state.team || state.isOwner ? `<button type="button" class="li-btn" id="li-import-legacy">Set up my year</button>` : ""}
      </div>
      <p class="li-sub">"Set up my year" brings in the original dashboard's history (daily checklists and reports) and the year plan:
        ${PLAN_STATS.goals} quarterly goals, ${PLAN_STATS.milestones} milestones and ${PLAN_STATS.tickets} daily tickets from ${esc(formatDay(PLAN_STATS.first, { month: "short", day: "numeric" }))} to ${esc(formatDay(PLAN_STATS.last, { month: "short", day: "numeric" }))}.</p>
      ${state.settings.plan_loaded_at ? `<p class="li-sub">Year plan loaded on ${esc(formatDay(dayOf(state.settings.plan_loaded_at, state.timeZone)))}.</p>` : ""}
    </section>

    <section class="li-card" id="report-settings">
      <div class="li-card-head"><span class="card-label">Daily report PDF</span></div>
      <p class="li-sub">The PDF lists the code you pushed that day in these GitHub repositories (owner/name, one per line). Public repositories only.</p>
      <form class="li-form" id="li-repos-form">
        <label class="li-field full">Repositories<textarea name="repos" rows="3" maxlength="1000">${esc((state.settings.preferences?.githubRepos || DEFAULT_REPOS).join("\n"))}</textarea></label>
        <div class="li-form-actions full"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save repositories</button></div>
      </form>
    </section>`;

  // Scoring
  const sf = el.querySelector("#li-scoring-form");
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const scoring = {};
    for (const input of sf.querySelectorAll("input[name]")) {
      const [group, key] = input.name.split(".");
      const v = Number(input.value);
      if (!Number.isFinite(v)) continue;
      if (key) (scoring[group] = scoring[group] || {})[key] = v; else scoring[group] = v;
    }
    const w = scoring.weights;
    if (!Object.values(w).some((x) => x > 0)) { toast("At least one daily weight must be above 0.", "error"); return; }
    await saveScoring(resolveScoring(scoring)).then(() => toast("Scoring saved: scores recalculated"), () => {});
  });
  el.querySelector("#li-scoring-reset").addEventListener("click", async () => {
    if (await confirmDialog("Restore the default scoring formula?", "Restore")) await saveScoring({}).then(() => toast("Defaults restored"), () => {});
  });

  // Profile
  el.querySelector("#li-profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const tz = f.timezone.value.trim();
    try { if (tz) new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { toast("That time zone isn't recognised.", "error"); return; }
    await saveProfile({ name: f.name.value.trim(), timezone: tz || "UTC" }).then(() => toast("Profile saved"), () => {});
  });

  // Tokens
  const renderTokens = async () => {
    const box = el.querySelector("#li-tokens");
    try {
      const list = await state.store.listTokens();
      box.innerHTML = list.length ? `<ul class="li-mini li-tokens">${list.map((t) => `<li>
          <span><b>${esc(t.name)}</b> <code>${esc(t.token_prefix)}…</code> <small class="li-muted">${esc(t.scopes.join(" + "))}</small><br>
          <small class="li-muted">Created ${esc(formatDay(dayOf(t.created_at)))} · ${t.last_used_at ? "last used " + esc(formatDay(dayOf(t.last_used_at))) : "never used"}${t.expires_at ? " · expires " + esc(formatDay(dayOf(t.expires_at))) : ""}</small></span>
          ${t.revoked_at ? `<span class="li-pill st-cancelled">Revoked</span>` : `<button type="button" class="li-btn small danger-ghost" data-revoke="${esc(t.id)}">Revoke</button>`}
        </li>`).join("")}</ul>` : `<p class="li-empty">No tokens yet.</p>`;
      box.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
        if (!(await confirmDialog("Revoke this token? Anything using it stops working immediately.", "Revoke"))) return;
        await state.store.revokeToken(b.dataset.revoke);
        toast("Token revoked");
        renderTokens();
      }));
    } catch (e) { box.innerHTML = `<p class="li-empty">Couldn't load tokens: ${esc(e.message)}</p>`; }
  };
  renderTokens();
  el.querySelector("#li-new-token").addEventListener("click", () => openModal({
    eyebrow: "API access", title: "New personal access token", submitLabel: "Create token",
    body: `<label class="li-field full">Name<input name="name" required maxlength="80" value="Claude"></label>
      <fieldset class="full"><legend>Permissions</legend>
        <label class="li-check-label"><input type="checkbox" name="scopes[]" value="read" checked disabled> Read tasks, milestones, goals and scores</label>
        <label class="li-check-label"><input type="checkbox" name="scopes[]" value="write"> Also create tasks (e.g. "plan tomorrow")</label></fieldset>
      <label class="li-field">Expires<select name="expires"><option value="90">In 90 days</option><option value="30">In 30 days</option><option value="365">In 1 year</option><option value="">Never</option></select></label>`,
    async onSubmit(v) {
      const scopes = ["read", ...(v.scopes || []).filter((s) => s === "write")];
      const expires_at = v.expires ? new Date(Date.now() + Number(v.expires) * 86400000).toISOString() : null;
      const { token } = await state.store.createToken({ name: v.name.trim() || "Claude", scopes, expires_at });
      setTimeout(() => showToken(token), 50);
      renderTokens();
    },
  }));

  // Data
  el.querySelector("#li-export").addEventListener("click", () => {
    const data = { exported_at: new Date().toISOString(), profile: state.profile, settings: state.settings, tasks: state.tasks,
      milestones: state.milestones, quarterly_goals: state.goals, daily_scores: Object.values(state.daily), weekly_scores: Object.values(state.weekly) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `locked-in-backup-${state.today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  el.querySelector("#li-import-legacy")?.addEventListener("click", async () => {
    const legacy = window.LockedInLegacy && window.LockedInLegacy.data();
    if (!legacy) { toast("The original dashboard data isn't available on this page.", "error"); return; }
    const bundle = buildYearSetup(legacy, state.store.newId, { teamId: state.team?.id || null });
    const again = state.settings.plan_loaded_at || state.settings.legacy_imported_at
      ? " This was already done once; doing it again creates duplicates." : "";
    if (!(await confirmDialog(`Add ${bundle.tasks.length} tasks (your history and the year's daily tickets), ${bundle.goals.length} quarterly goals, ${bundle.milestones.length} milestones and ${bundle.dailyNotes.length} daily reports?${again}`, "Set up"))) return;
    try {
      await state.store.importData(bundle);
      await state.store.markLegacyImported();
      await state.store.markPlanLoaded();
      await reload();
      toast("Your year is set up");
    } catch (e) { toast("Setup failed: " + e.message, "error"); }
  });
  el.querySelector("#li-repos-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const repos = e.target.elements.repos.value.split(/[\s,]+/).map((r) => r.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "")).filter(Boolean);
    const bad = repos.filter((r) => !/^[\w.-]+\/[\w.-]+$/.test(r));
    if (bad.length) { toast(`Use owner/name, e.g. Ayenew-Tadesse/Guxo-Flights (check: ${bad.join(", ")})`, "error"); return; }
    try {
      const s = await state.store.savePreferences({ ...(state.settings.preferences || {}), githubRepos: repos });
      state.settings = { ...state.settings, ...s };
      toast("Repositories saved");
    } catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });
}

function showToken(token) {
  const base = location.origin + "/api/v1";
  openModal({
    eyebrow: "Copy it now", title: "Your new token",
    body: `<p class="li-sub full">This is the only time the token is shown. Store it somewhere safe (e.g. a password manager).</p>
      <label class="li-field full">Token<input readonly value="${esc(token)}" id="li-token-value" class="li-mono"></label>
      <p class="li-sub full">Try it:</p>
      <pre class="li-code full">curl -H "Authorization: Bearer ${esc(token)}" ${esc(base)}/today</pre>`,
    extraButtons: `<button type="button" class="li-btn" id="li-copy-token">Copy token</button>`,
    onReady(form) {
      form.querySelector("#li-copy-token").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(token); toast("Copied"); } catch { form.querySelector("#li-token-value").select(); }
      });
    },
  });
}

