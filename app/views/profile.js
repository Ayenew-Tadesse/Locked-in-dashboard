// Profile (from the ☰ menu): who you are on the team, and your name,
// greeting and time zone.
import { state, saveProfile, toast } from "../state.js";
import { esc } from "../ui/dom.js";
import { displayName, greetingOptions, canGreet } from "../core/people.js";

export function initials(name) {
  // Words only: "Ana (sample)" -> "A", "Mr. Ayenew Shiferaw" -> "AS".
  const parts = (name || "").replace(/^(mr|ms|mrs|dr)\.\s+/i, "").trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts.at(-1)[0] : "")).toUpperCase() || "?";
}

export function renderProfile(el) {
  const p = state.profile || {};
  const role = state.team ? (state.isOwner ? "Owner" : "Member") : "";
  el.innerHTML = `
    <header class="li-view-head">
      <div class="li-profile-id">
        <span class="li-avatar lg" aria-hidden="true">${esc(initials(p.name))}</span>
        <div><h2 class="li-h2">${esc(displayName(p) || "Your profile")}</h2>
          <span class="li-sub">${esc([p.email, role && `${role}${state.team?.name ? " of " + state.team.name : ""}`].filter(Boolean).join(" · "))}</span></div>
      </div>
    </header>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Profile</span></div>
      <form class="li-form li-form-grid" id="li-profile-form">
        <label class="li-field">Name<input name="name" maxlength="120" required autocomplete="name" value="${esc(p.name || "")}"></label>
        ${canGreet(p) ? `<label class="li-field">Greet me as<select name="greeting"><option value="">Choose…</option>${greetingOptions(p.greeting || "")}</select></label>` : ""}
        <label class="li-field">Time zone<input name="timezone" maxlength="64" value="${esc(p.timezone || "")}" placeholder="e.g. America/New_York"></label>
        <p class="li-sub full">Your team sees your name, not your email. The time zone decides when "today" starts for scores and the API.</p>
        <div class="li-form-actions full"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save profile</button></div>
      </form>
    </section>`;

  el.querySelector("#li-profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const tz = f.timezone.value.trim();
    try { if (tz) new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { toast("That time zone isn't recognised.", "error"); return; }
    if (!f.name.value.trim()) { toast("Enter your name.", "error"); return; }
    await saveProfile({ name: f.name.value.trim(), timezone: tz || "UTC", ...(f.greeting?.value ? { greeting: f.greeting.value } : {}) }).then(() => toast("Profile saved"), () => {});
  });
}
