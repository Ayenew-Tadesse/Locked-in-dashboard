// Your GitHub commits on the Activity map: fetched when the dashboard opens
// and every 10 minutes while it's open, remembered for 10 minutes in this
// browser (GitHub allows only a few keyless searches a minute).
import { state } from "./state.js";
import { commitsByDay, defaultGithubUser, fetchCommits } from "./core/github.js";

const EVERY = 10 * 60000;
const key = (user) => `lockedin_github:${user.toLowerCase()}`;
let timer = null, onChange = () => {}, inflight = null;

/** Whose commits: yours in Settings; the site's owner also gets the site's GitHub account by default (admins don't). */
export function githubUsername() {
  const saved = state.settings?.preferences?.github?.username;
  if (typeof saved === "string") return saved.trim();
  return state.isColleague ? "" : defaultGithubUser(state.settings?.preferences, location.hostname, { owner: state.isSiteOwner });
}

/** What the portfolio needs to show your commits: { github, tz }. */
export function portfolioGithub() {
  return { github: githubUsername() || "", tz: state.timeZone || "" };
}

/**
 * Keep your portfolio's copy of the GitHub username (and time zone) in step,
 * so share links show your commits without a trip to the Portfolio page.
 */
export async function syncPortfolioGithub() {
  const prefs = state.settings?.preferences || {}, site = prefs.portfolio?.site;
  if (state.isColleague || !site || typeof site !== "object") return;
  const want = portfolioGithub();
  if ((site.github || "") === want.github && (site.tz || "") === want.tz) return;
  const next = { ...site, ...want };
  if (!next.github) delete next.github;
  const s = await state.store.savePreferences({ ...prefs, portfolio: { ...prefs.portfolio, site: next } });
  state.settings = { ...state.settings, ...s };
}

/** Load (from the 10-minute memory unless force) and redraw. */
export async function refreshGithub({ force = false } = {}) {
  const user = githubUsername();
  if (!user) { state.github = { user: "", days: {}, checkedAt: null, error: null }; onChange(); return state.github; }
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(key(user)) || "null");
      if (c && Date.now() - c.at < EVERY) { state.github = { user, days: c.days || {}, checkedAt: c.at, error: null }; onChange(); return state.github; }
    } catch { /* fetch instead */ }
  }
  if (inflight) return inflight;
  state.github = { ...(state.github || {}), user, loading: true };
  inflight = (async () => {
    try {
      const days = commitsByDay(await fetchCommits(user, { today: state.today }), state.timeZone);
      const at = Date.now();
      try { localStorage.setItem(key(user), JSON.stringify({ at, days })); } catch { /* fine */ }
      state.github = { user, days, checkedAt: at, error: null };
    } catch (e) {
      console.warn("GitHub:", e.message);
      state.github = { ...(state.github || {}), user, days: state.github?.user === user ? state.github.days || {} : {}, loading: false, error: e.message };
    } finally { inflight = null; }
    onChange();
    return state.github;
  })();
  return inflight;
}

/** Start fetching now and every 10 minutes; `changed` redraws the Activity map. */
export function startGithub(changed) {
  onChange = changed || onChange;
  refreshGithub().catch(() => {});
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) refreshGithub().catch(() => {}); }, EVERY);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshGithub().catch(() => {}); });
}
