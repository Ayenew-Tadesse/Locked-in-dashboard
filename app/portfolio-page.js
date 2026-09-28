// portfolio.html: the page a hiring manager opens from a private link
// (portfolio.html#t=<secret>). It asks the database for the prepared summary
// (public.portfolio_view) and draws it. ?demo=1 shows sample data.
import { renderPortfolio } from "./portfolio/render.js";
import { buildPortfolioData } from "./core/portfolio.js";

const root = document.getElementById("pf-root");
const config = window.LOCKEDIN_CONFIG || {};
const show = (html) => { root.innerHTML = `<div class="pf pf-message">${html}</div>`; };

async function demo() {
  const { demoSeed } = await import("./demo.js");
  const d = demoSeed();
  const done = d.tasks.filter((t) => t.status === "completed" && !t.user_id?.startsWith?.("sample-"));
  done.slice(0, 3).forEach((t, i) => Object.assign(t, [
    { learning_changed: "Rebuilt the booking summary screen", learning_how: "Split it into small components with one state store per step", learning_solved: "Screens were passing props five levels deep" },
    { learning_changed: "Added keyboard-safe forms on iOS", learning_how: "KeyboardAvoidingView per screen, tested on a real phone", learning_solved: "Inputs were hidden behind the keyboard" },
    { learning_changed: "Wrote the About page", learning_how: "Outlined the story first, then trimmed to 150 words", learning_solved: "Visitors didn't know what the product does" },
  ][i]));
  const today = new Date().toISOString().slice(0, 10);
  return buildPortfolioData({
    name: "Ayenew Shiferaw",
    preferences: { portfolio: { headline: "Mobile & web developer", bio: "I build travel and commerce apps end to end, from the data model to the last pixel. This page is generated live from the dashboard I plan and track my work in.",
      approach: "I plan the year in quarters and milestones, break them into daily tickets, and write down what changed, how, and what problem it solved every time I finish one.",
      links: { email: "hello@example.com", github: "https://github.com/" } } },
    tasks: d.tasks.filter((t) => !String(t.user_id || "").startsWith("sample-")), projects: [
      { name: "Guxo Flights", description: "Flight booking", stage: "Build", status: "good", links: {}, checklist: [{ done: true }, { done: true }, { done: false }] },
      { name: "Guxo", description: "Bus booking · local transit", stage: "Design", status: "idle", links: {}, checklist: [{ done: false }, { done: false }] },
    ], milestones: d.milestones, goals: d.goals, weekly: d.weekly, today, timeZone: undefined,
  });
}

async function main() {
  if (new URLSearchParams(location.search).has("demo")) { render(await demo()); return; }
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  if (!token) { show(`<h1>Private portfolio</h1><p>This page opens from a private link. If someone shared one with you, open it again from their message.</p>`); return; }
  if (!config.supabaseUrl || !config.supabaseAnonKey) { show(`<h1>Private portfolio</h1><p>This portfolio isn't available right now.</p>`); return; }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm");
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await sb.rpc("portfolio_view", { p_token: token });
  if (error) {
    const expired = /invalid link/i.test(error.message) || error.code === "28000";
    show(`<h1>Private portfolio</h1><p>${expired ? "This link has expired or was switched off. Ask for a new one." : "This portfolio couldn't be loaded. Please try again in a moment."}</p>`);
    return;
  }
  render(data);
}

function render(data) {
  document.title = `${data.about?.name || "Portfolio"} · Portfolio`;
  root.innerHTML = renderPortfolio(data);
  root.removeAttribute("aria-busy");
}

main().catch((e) => { console.error(e); show(`<h1>Private portfolio</h1><p>This portfolio couldn't be loaded. Please try again in a moment.</p>`); });
