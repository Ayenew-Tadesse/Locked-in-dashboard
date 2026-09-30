// portfolio.html: the page a hiring manager opens from a private link
// (portfolio.html#t=<secret>). It asks the database for the prepared summary
// (public.portfolio_view) and draws it. ?demo=1 shows sample data.
import { renderPortfolio } from "./portfolio/render.js";
import { buildPortfolioData } from "./core/portfolio.js";
import { printResume } from "./portfolio/resume.js";

const root = document.getElementById("pf-root");
const config = window.LOCKEDIN_CONFIG || {};
const show = (html) => { root.innerHTML = `<div class="pf pf-message">${html}</div>`; root.removeAttribute("aria-busy"); };

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
      links: { email: "hello@example.com", linkedin: "https://www.linkedin.com/", behance: "https://www.behance.net/" },
      details: { title: "Senior UI/UX Designer", years: 5, location: "Addis Ababa, Ethiopia", open: { remote: true, relocation: true }, roles: "Senior Product Designer, Lead UX Designer",
        highlights: ["Cut flight booking from 7 steps to 4", "Built a design system shared by 3 apps", "Usability-tested every release with real travellers"],
        experience: [{ role: "Senior UI/UX Designer", company: "Guxo", from: "2023", to: "Present", summary: "Leading design for flight, bus and shopping apps." },
          { role: "UI/UX Designer", company: "Agency client work", from: "2021", to: "2023", summary: "Web and mobile products for travel and retail." }],
        industries: ["Travel", "E-commerce"], process: ["Research", "Problem framing", "Flows", "Prototype", "Usability testing", "Handoff and measuring"],
        methods: ["User interviews", "Usability testing", "Analytics"], skills: ["Design systems", "Interaction design", "Prototyping", "Accessibility"],
        tools: ["Figma", "FigJam", "Framer", "Protopie"], collaboration: "Specs in Figma dev mode, weekly design reviews with engineers.",
        different: "Bilingual Amharic/English interfaces and designing for low-bandwidth networks." } } },
    tasks: d.tasks.filter((t) => !String(t.user_id || "").startsWith("sample-")), projects: [
      { name: "Guxo Flights", description: "Flight booking", stage: "Build", status: "good", links: {}, checklist: [{ done: true }, { done: true }, { done: false }] },
      { name: "Guxo", description: "Bus booking · local transit", stage: "Design", status: "idle", links: {}, checklist: [{ done: false }, { done: false }] },
    ], milestones: d.milestones, goals: d.goals, weekly: d.weekly, today, timeZone: undefined,
  });
}

// Opened with the dashboard's "Preview on web": redraw whenever you save there.
const query = new URLSearchParams(location.search);
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("lockedin-portfolio");
let reload = null; // fetches the latest version (set once the page has loaded)
if (channel) channel.onmessage = async (e) => {
  const m = e.data || {};
  if (m.data && query.has("live")) render(m.data, true);
  else if (m.type === "saved" && reload) {
    try { render(await reload(), true); } catch (err) { console.error("portfolio refresh:", err); }
  }
};

async function main() {
  if (query.has("demo")) {
    // Demo "Preview on web": the dashboard tab sends your (unsaved-anywhere) demo portfolio.
    if (query.has("live") && channel) {
      channel.postMessage({ type: "hello" });
      await new Promise((r) => setTimeout(r, 1500));
      if (current) return;
    }
    render(await demo()); return;
  }
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  if (!token) { show(`<h1>Private portfolio</h1><p>This page opens from a private link. If someone shared one with you, open it again from their message.</p>`); return; }
  if (!config.supabaseUrl || !config.supabaseAnonKey) { show(`<h1>Private portfolio</h1><p>This portfolio isn't available right now.</p>`); return; }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm");
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await sb.rpc("portfolio_view", { p_token: token });
  if (!error && query.has("preview")) {
    reload = async () => {
      const r = await sb.rpc("portfolio_view", { p_token: token });
      if (r.error) throw r.error;
      return r.data;
    };
  }
  if (error) {
    const expired = /invalid link/i.test(error.message) || error.code === "28000";
    const notReady = /portfolio_view|function|schema cache|PGRST202/i.test(`${error.message} ${error.code}`);
    console.error("portfolio_view:", error);
    show(`<h1>Private portfolio</h1><p>${expired ? "This link has expired or was switched off. Ask for a new one."
      : notReady ? "This portfolio isn't ready yet. Please try again later." : "This portfolio couldn't be loaded. Please try again in a moment."}</p>`);
    return;
  }
  render(data);
}

// The open case study lives in the address after the link's secret: #t=…&case=hidgo,
// so Back and the phone's back button return to the home page.
let current = null;
const hashParams = () => new URLSearchParams(location.hash.slice(1));
// Views after the link's secret: &case=<id> (a case study) or &page=resume.
function setView(kind, id) {
  const p = hashParams();
  p.delete("case"); p.delete("page");
  if (kind === "case") p.set("case", id);
  if (kind === "resume") p.set("page", "resume");
  location.hash = p.toString();
}
function render(data, keepScroll = false) {
  const y = window.scrollY;
  current = data;
  const view = hashParams().get("page") === "resume" ? "resume" : hashParams().get("case");
  const name = data.site?.hero?.name || data.about?.name || "Portfolio";
  const c = view && (data.site?.cases || []).find((x) => x.id === view);
  document.title = view === "resume" ? `${data.site?.cv?.name || name} · Resume` : c ? `${c.title} · ${name}` : `${name} · Portfolio`;
  root.innerHTML = renderPortfolio(data, { view });
  root.removeAttribute("aria-busy");
  if (keepScroll) window.scrollTo(0, y);
}
window.addEventListener("hashchange", () => { if (current) { render(current); window.scrollTo(0, 0); } });
root.addEventListener("click", (e) => {
  const a = e.target.closest("[data-case],[data-home],[data-scroll],[data-resume],[data-print-resume]");
  if (!a) return;
  e.preventDefault();
  if (a.hasAttribute("data-print-resume")) { printResume(); return; }
  if (a.dataset.scroll) { document.getElementById(a.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (a.hasAttribute("data-resume")) { setView("resume"); return; }
  if (a.hasAttribute("data-home")) {
    const fromCase = hashParams().has("case");
    setView(null);
    if (fromCase) requestAnimationFrame(() => document.getElementById("pf-cases")?.scrollIntoView({ block: "start" }));
  } else setView("case", a.dataset.case);
});

main().catch((e) => { console.error(e); show(`<h1>Private portfolio</h1><p>This portfolio couldn't be loaded. Please try again in a moment.</p>`); });
