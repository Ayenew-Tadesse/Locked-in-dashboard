// GitHub commits for the Activity map: your public commits, grouped by day.
// Read-only and keyless: the browser asks GitHub's public commit search
// (github.com/search, "author:<you>"), so nothing secret is in the website.
// Private repos need a server with a token (the planned Vercel API).
import { dayOf } from "./dates.js";

export const GITHUB_DAYS = 90; // how far back to look

/** A GitHub username from a link or text ("https://github.com/Ayenew-Tadesse" → "Ayenew-Tadesse"). */
export function githubUser(v) {
  const s = String(v || "").trim();
  const m = s.match(/github\.com\/([A-Za-z0-9-]{1,39})(?:[/?#]|$)/i) || s.match(/^@?([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)$/);
  return m ? m[1] : "";
}

/** The username to use: yours in Settings, else from this site's address (<you>.github.io) or your links. */
export function defaultGithubUser(preferences, hostname = "", { owner = true } = {}) {
  const saved = preferences?.github?.username;
  if (typeof saved === "string") return saved.trim(); // "" means switched off
  // The site's GitHub account (from its address) is the owner's, not an admin's.
  const host = owner && String(hostname).match(/^([a-z0-9-]+)\.github\.io$/i);
  if (host) return host[1];
  const site = preferences?.portfolio?.site || {};
  const links = [site.social?.github, ...(site.cv?.contacts || []).map((c) => c.href), ...(site.contact || []).map((c) => c.href), preferences?.portfolio?.links?.github];
  for (const l of links) { const u = githubUser(l); if (u && /github\.com/i.test(l || "")) return u; }
  return "";
}

/** GitHub's commit search results → { "YYYY-MM-DD": { count, items: [{ repo, text, url }] } }. */
export function commitsByDay(results, timeZone) {
  const days = {};
  const seen = new Set();
  for (const it of results || []) {
    if (!it || seen.has(it.sha)) continue;
    seen.add(it.sha);
    const when = it.commit?.author?.date || it.commit?.committer?.date;
    const day = dayOf(when, timeZone);
    if (!day) continue;
    const d = (days[day] = days[day] || { count: 0, items: [] });
    d.count++;
    d.items.push({ repo: it.repository?.name || "GitHub", text: String(it.commit?.message || "Commit").split("\n")[0].slice(0, 200), url: it.html_url || "" });
  }
  return days;
}

/** Ask GitHub for your commits over the last GITHUB_DAYS days (up to 300). */
export async function fetchCommits(username, { today, fetchImpl = fetch } = {}) {
  const since = new Date(new Date(today + "T12:00:00Z").getTime() - GITHUB_DAYS * 86400000).toISOString().slice(0, 10);
  const all = [];
  for (let page = 1; page <= 3; page++) {
    const q = encodeURIComponent(`author:${username} author-date:>=${since}`);
    const res = await fetchImpl(`https://api.github.com/search/commits?q=${q}&sort=author-date&order=desc&per_page=100&page=${page}`,
      { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 422) throw new Error(`GitHub doesn't know the user "${username}"`);
    if (res.status === 403 || res.status === 429) throw new Error("GitHub asked us to slow down; it will try again shortly");
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const body = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}
