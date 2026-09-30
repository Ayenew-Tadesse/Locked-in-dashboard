// Portfolio page (owner): your portfolio website's structure — import it from
// GitHub, then edit the introduction, stats, about, key skills, contact and
// case studies. Saved in user_settings.preferences.portfolio.site.
import { state, toast } from "../state.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";
import { fetchGitHubPortfolio, parsePortfolioHtml, uploadSiteImages } from "../portfolio/import.js";

const DEFAULT_REPO = "Ayenew-Tadesse/portfolio";
const SOCIAL_KEYS = [["linkedin", "LinkedIn"], ["behance", "Behance"], ["dribbble", "Dribbble"], ["instagram", "Instagram"], ["github", "GitHub"], ["website", "Website"]];
const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const imgUrl = (u) => (typeof u === "string" && /^(https?:|blob:|data:image\/)/i.test(u) ? u : "");

export function currentSite() {
  const s = state.settings.preferences?.portfolio?.site;
  return s && typeof s === "object" ? clone(s) : {};
}

export async function saveSite(site) {
  const prefs = state.settings.preferences || {};
  const portfolio = { ...(prefs.portfolio || {}), site };
  const s = await state.store.savePreferences({ ...prefs, portfolio });
  state.settings = { ...state.settings, ...s };
}

const upload = (blob, name) => state.store.uploadPortfolioImage(blob, name);

/** The "Your portfolio site" cards. onChange redraws the preview. */
export function siteEditorHtml() {
  const s = currentSite(), h = s.hero || {};
  return `
    <section class="li-card" id="li-pf-site">
      <div class="li-card-head"><span class="card-label">Your portfolio site</span></div>
      <p class="li-sub">Laid out like your portfolio website: an introduction, stats, featured projects with full case studies, about, key skills and contact, plus live sections from this dashboard.
        Import it from GitHub to fill everything in (images included), then adjust anything here.</p>
      <form class="li-quick-add today-add li-pf-import" id="li-pf-import" autocomplete="off">
        <input name="repo" value="${esc(DEFAULT_REPO)}" aria-label="GitHub repository (owner/name)" placeholder="owner/repository">
        <button type="submit" class="li-btn primary">Import from GitHub</button>
      </form>
      <p class="li-sub" id="li-pf-import-status" hidden></p>

      <form class="li-form li-pf-form" id="li-pf-site-form" autocomplete="off">
        <fieldset class="full li-pf-group"><legend>Introduction</legend>
          <label class="li-field">Greeting line<input name="eyebrow" maxlength="80" value="${esc(h.eyebrow || "")}" placeholder="Hello there, I am"></label>
          <label class="li-field">Name<input name="name" maxlength="80" value="${esc(h.name || state.profile?.name || "")}"></label>
          <label class="li-field">Role<input name="role" maxlength="80" value="${esc(h.role || "")}" placeholder="Product Designer"></label>
          <label class="li-field">Based in<input name="location" maxlength="80" value="${esc(h.location || "")}" placeholder="e.g. USA"></label>
          <label class="li-field full">Short description<textarea name="description" rows="2" maxlength="600">${esc(h.description || "")}</textarea></label>
          <label class="li-field full">Resume link <small class="li-muted">(a URL or mailto:)</small><input name="resume" maxlength="500" value="${esc(s.resume || "")}"></label>
          <div class="li-field full"><span>Portrait</span><div class="li-pf-imgs" id="li-pf-portrait">${imgUrl(s.portrait) ? `<figure><img src="${esc(s.portrait)}" alt="Portrait"><button type="button" class="li-icon-btn" data-remove-portrait aria-label="Remove portrait">&#10005;</button></figure>` : ""}
            <label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" data-portrait hidden></label></div></div>
        </fieldset>
        <fieldset class="full li-pf-group"><legend>Social links</legend>
          ${SOCIAL_KEYS.map(([k, l]) => `<label class="li-field">${l}<input name="social_${k}" maxlength="300" value="${esc(s.social?.[k] || "")}" placeholder="https://…"></label>`).join("")}
        </fieldset>
        <fieldset class="full li-pf-group"><legend>Stats</legend>
          ${[0, 1, 2, 3].map((i) => `<label class="li-field">Number<input name="stat_num_${i}" maxlength="12" value="${esc(s.stats?.[i]?.num || "")}" placeholder="${["3+", "50+", "35+", ""][i]}"></label>
            <label class="li-field">Label<input name="stat_label_${i}" maxlength="40" value="${esc(s.stats?.[i]?.label || "")}" placeholder="${["Years of Experience", "Projects", "Happy Clients", ""][i]}"></label>`).join("")}
        </fieldset>
        <fieldset class="full li-pf-group"><legend>About me</legend>
          <label class="li-field full">Paragraphs <small class="li-muted">(leave an empty line between paragraphs)</small><textarea name="about" rows="7" maxlength="6000">${esc((s.about || []).join("\n\n"))}</textarea></label>
        </fieldset>
        <fieldset class="full li-pf-group"><legend>Key skills</legend>
          <div class="li-pf-groups" id="li-pf-skill-groups">${(s.skills || []).map(skillGroupRow).join("")}</div>
          <button type="button" class="li-btn small" id="li-pf-skill-add">+ Add a skill group</button>
        </fieldset>
        <fieldset class="full li-pf-group"><legend>Contact</legend>
          <div class="li-pf-groups" id="li-pf-contacts">${(s.contact?.length ? s.contact : [{ label: "Email Address" }, { label: "Phone Number" }, { label: "LinkedIn" }]).map(contactRow).join("")}</div>
          <button type="button" class="li-btn small" id="li-pf-contact-add">+ Add a contact</button>
        </fieldset>
        <div class="li-form-actions full"><span class="li-spacer"></span><button type="submit" class="li-btn primary">Save site</button></div>
      </form>
    </section>

    <section class="li-card" id="li-pf-cases">
      <div class="li-card-head"><span class="card-label">Case studies</span><button type="button" class="li-btn small" id="li-pf-case-add">+ Add a case study</button></div>
      <ul class="li-tokens li-pf-case-list">${(s.cases || []).map((c, i, a) => `<li data-case-row="${esc(c.id)}">
        <span><b>${esc(c.title || "Untitled")}</b> <small class="li-muted">${c.status === "progress" ? "In progress" : "Live"}${c.personas?.items?.length ? ` · ${c.personas.items.length} personas` : ""}${c.shots?.length ? ` · ${c.shots.length} screenshots` : ""}</small></span>
        <span class="li-btn-row">
          <button type="button" class="li-icon-btn" data-case-move="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>&#8593;</button>
          <button type="button" class="li-icon-btn" data-case-move="1" aria-label="Move down"${i === a.length - 1 ? " disabled" : ""}>&#8595;</button>
          <button type="button" class="li-btn small" data-case-edit>Edit</button>
          <button type="button" class="li-btn small danger-ghost" data-case-delete>Delete</button>
        </span></li>`).join("") || `<li class="li-empty">No case studies yet. Import from GitHub, or add one.</li>`}</ul>
    </section>`;
}

function skillGroupRow(g = {}) {
  return `<div class="li-pf-grouprow"><input data-k="title" maxlength="60" value="${esc(g.title || "")}" placeholder="Group, e.g. UX/UI Design Skills" aria-label="Group title">
    <textarea data-k="items" rows="3" maxlength="1500" placeholder="One skill per line" aria-label="Skills">${esc((g.items || []).join("\n"))}</textarea>
    <button type="button" class="li-icon-btn" data-row-remove aria-label="Remove">&#10005;</button></div>`;
}
function contactRow(c = {}) {
  return `<div class="li-pf-grouprow li-pf-contactrow"><input data-k="label" maxlength="40" value="${esc(c.label || "")}" placeholder="Label" aria-label="Label">
    <input data-k="value" maxlength="120" value="${esc(c.value || "")}" placeholder="Shown text" aria-label="Shown text">
    <input data-k="href" maxlength="300" value="${esc(c.href || "")}" placeholder="Link: mailto:, tel: or https://" aria-label="Link">
    <button type="button" class="li-icon-btn" data-row-remove aria-label="Remove">&#10005;</button></div>`;
}

/** Wires the site cards; onChange() is called after every save so the preview follows. */
export function wireSiteEditor(el, onChange) {
  let portrait = currentSite().portrait || "";
  const redraw = () => onChange(true);

  el.querySelector("#li-pf-import").addEventListener("submit", async (e) => {
    e.preventDefault();
    const repo = e.target.elements.repo.value.trim();
    const had = currentSite();
    if ((had.cases?.length || had.hero?.name) && !(await confirmDialog("Replace your portfolio site with the one on GitHub? Your edits here will be overwritten.", "Import"))) return;
    const status = el.querySelector("#li-pf-import-status"), btn = e.target.querySelector("button");
    const say = (t) => { status.hidden = false; status.textContent = t; };
    btn.disabled = true;
    try {
      say("Reading your portfolio from GitHub…");
      const site = parsePortfolioHtml(await fetchGitHubPortfolio(repo));
      if (!site.hero.name && !site.cases.length) throw new Error("That page doesn't look like a portfolio (no introduction or projects found).");
      say("Uploading images…");
      await uploadSiteImages(site, upload, (n, total) => say(`Uploading images… ${n} of ${total}`));
      // Link case studies to dashboard projects with the same name, for live progress.
      for (const c of site.cases) { const p = (state.projects || []).find((x) => x.name?.toLowerCase() === c.title?.toLowerCase() || c.title?.toLowerCase().startsWith(x.name?.toLowerCase() + " ")); if (p) c.project = p.name; }
      await saveSite(site);
      toast(`Imported: ${site.cases.length} case stud${site.cases.length === 1 ? "y" : "ies"}, ${site.skills.length} skill groups`);
      redraw();
    } catch (err) {
      console.error(err);
      say("");
      status.hidden = true;
      toast("Couldn't import: " + err.message, "error");
    } finally { btn.disabled = false; }
  });

  const form = el.querySelector("#li-pf-site-form");
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-row-remove]")) e.target.closest(".li-pf-grouprow").remove();
    if (e.target.closest("[data-remove-portrait]")) { portrait = ""; el.querySelector("#li-pf-portrait figure")?.remove(); }
  });
  el.querySelector("#li-pf-skill-add").addEventListener("click", () => el.querySelector("#li-pf-skill-groups").insertAdjacentHTML("beforeend", skillGroupRow()));
  el.querySelector("#li-pf-contact-add").addEventListener("click", () => el.querySelector("#li-pf-contacts").insertAdjacentHTML("beforeend", contactRow()));
  form.querySelector("[data-portrait]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      portrait = await upload(file, file.name);
      el.querySelector("#li-pf-portrait figure")?.remove();
      el.querySelector("#li-pf-portrait").insertAdjacentHTML("afterbegin", `<figure><img src="${esc(portrait)}" alt="Portrait"><button type="button" class="li-icon-btn" data-remove-portrait aria-label="Remove portrait">&#10005;</button></figure>`);
    } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements, site = currentSite();
    site.hero = { eyebrow: f.eyebrow.value.trim(), name: f.name.value.trim(), role: f.role.value.trim(), location: f.location.value.trim(), description: f.description.value.trim() };
    site.resume = f.resume.value.trim();
    site.portrait = portrait;
    site.social = Object.fromEntries(SOCIAL_KEYS.map(([k]) => [k, f["social_" + k].value.trim()]).filter(([, v]) => v));
    site.stats = [0, 1, 2, 3].map((i) => ({ num: f["stat_num_" + i].value.trim(), label: f["stat_label_" + i].value.trim() })).filter((x) => x.num || x.label);
    site.about = String(f.about.value).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    site.skills = [...form.querySelectorAll("#li-pf-skill-groups .li-pf-grouprow")].map((r) => ({ title: r.querySelector('[data-k="title"]').value.trim(), items: lines(r.querySelector('[data-k="items"]').value) })).filter((g) => g.title || g.items.length);
    site.contact = [...form.querySelectorAll("#li-pf-contacts .li-pf-grouprow")].map((r) => Object.fromEntries(["label", "value", "href"].map((k) => [k, r.querySelector(`[data-k="${k}"]`).value.trim()]))).filter((c) => c.value);
    site.cases = site.cases || [];
    try { await saveSite(site); toast("Portfolio site saved"); onChange(false); }
    catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });

  const list = el.querySelector("#li-pf-cases");
  list.querySelector("#li-pf-case-add").addEventListener("click", () => editCase(null, redraw));
  list.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-case-row]");
    if (!row) return;
    const site = currentSite(), i = (site.cases || []).findIndex((c) => c.id === row.dataset.caseRow);
    if (i < 0) return;
    if (e.target.closest("[data-case-edit]")) return editCase(site.cases[i], redraw);
    if (e.target.closest("[data-case-delete]")) {
      if (!(await confirmDialog(`Delete the case study "${site.cases[i].title}"?`))) return;
      site.cases.splice(i, 1);
    } else if (e.target.closest("[data-case-move]")) {
      const j = i + Number(e.target.closest("[data-case-move]").dataset.caseMove);
      if (j < 0 || j >= site.cases.length) return;
      [site.cases[i], site.cases[j]] = [site.cases[j], site.cases[i]];
    } else return;
    try { await saveSite(site); redraw(); } catch (err) { toast("Couldn't save: " + err.message, "error"); }
  });
}

// ---------------------------------------------------------------------------
// Case study editor
// ---------------------------------------------------------------------------
const META = ["Role", "Type", "Platform", "Tools"];

function editCase(original, done) {
  const c = clone(original || { id: "", title: "", status: "live", shots: [], meta: META.map((label) => ({ label, value: "" })) });
  let shots = (c.shots || []).map((s) => ({ ...s }));
  let flow = (c.flow?.steps || []).map((s) => ({ ...s }));
  let personas = (c.personas?.items || []).map((p) => ({ ...p }));
  const meta = (label) => (c.meta || []).find((m) => m.label.toLowerCase() === label.toLowerCase())?.value || "";
  const compText = c.competitive?.rows?.length ? [(c.competitive.columns || []).join(" | "), ...c.competitive.rows.map((r) => [r.feature, ...(r.values || [])].join(" | "))].join("\n") : "";
  const iaText = (c.ia?.sections || []).map((s) => `${s.title}: ${(s.items || []).join("; ")}`).join("\n");
  const colorsText = (c.style?.colors || []).map((x) => `${x.name} ${x.hex}`).join("\n");

  const shotsHtml = () => shots.map((s, i) => `<figure><img src="${esc(imgUrl(s.src))}" alt=""><button type="button" class="li-icon-btn" data-shot-remove="${i}" aria-label="Remove screenshot">&#10005;</button></figure>`).join("");
  const flowHtml = () => flow.map((s, i) => `<div class="li-pf-grouprow li-pf-flowrow">${imgUrl(s.src) ? `<img src="${esc(s.src)}" alt="">` : `<span class="li-pf-noimg">No image</span>`}
      <input data-flow-label="${i}" maxlength="40" value="${esc(s.label || "")}" placeholder="Step, e.g. Search" aria-label="Step name">
      <label class="li-btn small li-pf-upload">Image<input type="file" accept="image/*" data-flow-img="${i}" hidden></label>
      <button type="button" class="li-icon-btn" data-flow-remove="${i}" aria-label="Remove step">&#10005;</button></div>`).join("");
  const personaHtml = () => personas.map((p, i) => `<div class="li-pf-persona" data-persona="${i}">
      <input data-p="name" maxlength="60" value="${esc(p.name || "")}" placeholder="Persona, e.g. The Frequent Flyer" aria-label="Persona name">
      <input data-p="summary" maxlength="160" value="${esc(p.summary || "")}" placeholder="One line about them" aria-label="Summary">
      <textarea data-p="needs" rows="2" placeholder="Needs, one per line" aria-label="Needs">${esc((p.needs || []).join("\n"))}</textarea>
      <textarea data-p="frustrations" rows="2" placeholder="Frustrations, one per line" aria-label="Frustrations">${esc((p.frustrations || []).join("\n"))}</textarea>
      <textarea data-p="goals" rows="2" placeholder="Goals, one per line" aria-label="Goals">${esc((p.goals || []).join("\n"))}</textarea>
      <button type="button" class="li-icon-btn" data-persona-remove="${i}" aria-label="Remove persona">&#10005;</button></div>`).join("");

  let readPersonas = () => {}, readFlow = () => {};
  openModal({
    eyebrow: original ? "Edit case study" : "New case study", title: c.title || "Case study", submitLabel: "Save case study", wide: true,
    body: `
      <fieldset class="full li-pf-group"><legend>Card on your home page</legend>
        <label class="li-field">Title<input name="title" required maxlength="100" value="${esc(c.title || "")}" placeholder="Hid-Go Flight Booking App"></label>
        <label class="li-field">Tag<input name="tag" maxlength="60" value="${esc(c.tag || "")}" placeholder="Mobile App UI/UX"></label>
        <label class="li-field full">Card description<textarea name="cardDesc" rows="2" maxlength="300">${esc(c.cardDesc || "")}</textarea></label>
        <label class="li-field">Status<select name="status"><option value="live"${c.status !== "progress" ? " selected" : ""}>Live case study</option><option value="progress"${c.status === "progress" ? " selected" : ""}>In progress (card only)</option></select></label>
        <label class="li-field">Live app link<input name="liveUrl" maxlength="300" value="${esc(c.liveUrl || "")}" placeholder="https://…"></label>
        <label class="li-field full">Dashboard project <small class="li-muted">(shows its live progress)</small><select name="project"><option value="">None</option>${(state.projects || []).map((p) => `<option${c.project === p.name ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>Top of the case study</legend>
        <label class="li-field">Status label<input name="pill" maxlength="40" value="${esc(c.pill || "")}" placeholder="Live case study"></label>
        <label class="li-field full">Subtitle<textarea name="subtitle" rows="2" maxlength="400">${esc(c.subtitle || "")}</textarea></label>
        <div class="li-field full"><span>Screenshots</span><div class="li-pf-imgs" id="li-pf-shots">${shotsHtml()}<label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" multiple data-shots hidden></label></div></div>
        ${META.map((l) => `<label class="li-field">${l}<input name="meta_${l}" maxlength="120" value="${esc(meta(l))}"></label>`).join("")}
      </fieldset>
      <fieldset class="full li-pf-group"><legend>The story</legend>
        <label class="li-field full">Overview<textarea name="overview" rows="3" maxlength="3000">${esc(c.overview || "")}</textarea></label>
        <label class="li-field full">Design process: intro<textarea name="processIntro" rows="2" maxlength="1000">${esc(c.process?.intro || "")}</textarea></label>
        <label class="li-field full">Design process: steps <small class="li-muted">(one per line)</small><textarea name="processSteps" rows="3" maxlength="400" placeholder="Research&#10;Define&#10;Ideate&#10;Design&#10;Test">${esc((c.process?.steps || []).join("\n"))}</textarea></label>
        <label class="li-field full">Problem statement<textarea name="problem" rows="3" maxlength="3000">${esc(c.problem || "")}</textarea></label>
        <label class="li-field full">Key insight<textarea name="insight" rows="2" maxlength="2000">${esc(c.insight || "")}</textarea></label>
        <label class="li-field full">Solution<textarea name="solution" rows="3" maxlength="3000">${esc(c.solution || "")}</textarea></label>
        <label class="li-field full">Outcome<textarea name="outcome" rows="2" maxlength="2000">${esc(c.outcome || "")}</textarea></label>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>Who I designed for</legend>
        <label class="li-field full">Intro<textarea name="personasIntro" rows="2" maxlength="1000">${esc(c.personas?.intro || "")}</textarea></label>
        <div class="li-pf-personas full" id="li-pf-personas">${personaHtml()}</div>
        <button type="button" class="li-btn small" id="li-pf-persona-add">+ Add a persona</button>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>Research and structure</legend>
        <label class="li-field full">Competitive analysis: intro<textarea name="compIntro" rows="2" maxlength="1000">${esc(c.competitive?.intro || "")}</textarea></label>
        <label class="li-field full">Comparison table <small class="li-muted">(first line: Feature | You | Competitor…; then Feature | yes | partial | no)</small><textarea name="compTable" rows="5" maxlength="3000">${esc(compText)}</textarea></label>
        <label class="li-field full">Information architecture: intro<textarea name="iaIntro" rows="2" maxlength="1000">${esc(c.ia?.intro || "")}</textarea></label>
        <label class="li-field">App name (top of the map)<input name="iaRoot" maxlength="60" value="${esc(c.ia?.root || "")}"></label>
        <label class="li-field full">Sections <small class="li-muted">(one per line: Section: item; item; item)</small><textarea name="iaSections" rows="5" maxlength="3000">${esc(iaText)}</textarea></label>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>User flow</legend>
        <label class="li-field">Title<input name="flowTitle" maxlength="100" value="${esc(c.flow?.title || "")}" placeholder="User flow — booking a flight"></label>
        <label class="li-field full">Intro<textarea name="flowIntro" rows="2" maxlength="1000">${esc(c.flow?.intro || "")}</textarea></label>
        <div class="li-pf-groups full" id="li-pf-flow">${flowHtml()}</div>
        <button type="button" class="li-btn small" id="li-pf-flow-add">+ Add a step</button>
      </fieldset>
      <fieldset class="full li-pf-group"><legend>UI style guide</legend>
        <label class="li-field full">Intro<textarea name="styleIntro" rows="2" maxlength="1000">${esc(c.style?.intro || "")}</textarea></label>
        <label class="li-field full">Colours <small class="li-muted">(one per line: Name #HEX)</small><textarea name="styleColors" rows="4" maxlength="1000">${esc(colorsText)}</textarea></label>
        <label class="li-field">Font<input name="styleFont" maxlength="60" value="${esc(c.style?.font || "")}" placeholder="Poppins"></label>
        <label class="li-field">Button colour<input name="styleButton" maxlength="9" value="${esc(c.style?.button || "")}" placeholder="#1B2CC1"></label>
        <label class="li-field">Sample heading<input name="styleHead" maxlength="80" value="${esc(c.style?.sampleHead || "")}"></label>
        <label class="li-field">Sample text<input name="styleBody" maxlength="200" value="${esc(c.style?.sampleBody || "")}"></label>
      </fieldset>`,
    onReady(f) {
      const draw = () => { f.querySelector("#li-pf-shots").innerHTML = shotsHtml() + `<label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" multiple data-shots hidden></label>`; };
      readPersonas = () => { personas = [...f.querySelectorAll("[data-persona]")].map((row) => ({
        name: row.querySelector('[data-p="name"]').value.trim(), summary: row.querySelector('[data-p="summary"]').value.trim(),
        needs: lines(row.querySelector('[data-p="needs"]').value), frustrations: lines(row.querySelector('[data-p="frustrations"]').value), goals: lines(row.querySelector('[data-p="goals"]').value) })); };
      readFlow = () => { f.querySelectorAll("[data-flow-label]").forEach((i) => { flow[Number(i.dataset.flowLabel)].label = i.value.trim(); }); };
      f.addEventListener("change", async (e) => {
        const up = async (file) => upload(file, file.name);
        try {
          if (e.target.matches("[data-shots]")) { for (const file of e.target.files) shots.push({ src: await up(file), alt: "" }); draw(); }
          if (e.target.matches("[data-flow-img]")) { readFlow(); flow[Number(e.target.dataset.flowImg)].src = await up(e.target.files[0]); f.querySelector("#li-pf-flow").innerHTML = flowHtml(); }
        } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
      });
      f.addEventListener("click", (e) => {
        const b = e.target.closest("[data-shot-remove],[data-flow-remove],[data-persona-remove],#li-pf-persona-add,#li-pf-flow-add");
        if (!b) return;
        if (b.matches("[data-shot-remove]")) { shots.splice(Number(b.dataset.shotRemove), 1); draw(); }
        if (b.matches("[data-flow-remove]")) { readFlow(); flow.splice(Number(b.dataset.flowRemove), 1); f.querySelector("#li-pf-flow").innerHTML = flowHtml(); }
        if (b.matches("#li-pf-flow-add")) { readFlow(); flow.push({ label: "", src: "" }); f.querySelector("#li-pf-flow").innerHTML = flowHtml(); }
        if (b.matches("[data-persona-remove]")) { readPersonas(); personas.splice(Number(b.dataset.personaRemove), 1); f.querySelector("#li-pf-personas").innerHTML = personaHtml(); }
        if (b.matches("#li-pf-persona-add")) { readPersonas(); personas.push({}); f.querySelector("#li-pf-personas").innerHTML = personaHtml(); }
      });
    },
    async onSubmit(v) {
      if (!v.title.trim()) throw new Error("Give the case study a title.");
      readPersonas(); readFlow();
      const [head, ...rows] = lines(v.compTable).map((l) => l.split("|").map((x) => x.trim()));
      const next = {
        ...c,
        id: c.id || v.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "case-" + Date.now().toString(36),
        title: v.title.trim(), tag: v.tag.trim(), cardDesc: v.cardDesc.trim(), status: v.status === "progress" ? "progress" : "live",
        liveUrl: v.liveUrl.trim(), project: v.project || "", pill: v.pill.trim(), subtitle: v.subtitle.trim(),
        shots, meta: [...META.map((l) => ({ label: l, value: v["meta_" + l].trim() })), ...(c.meta || []).filter((m) => !META.includes(m.label))].filter((m) => m.value),
        overview: v.overview.trim(), problem: v.problem.trim(), insight: v.insight.trim(), solution: v.solution.trim(), outcome: v.outcome.trim(),
        process: { intro: v.processIntro.trim(), steps: lines(v.processSteps) },
        personas: { intro: v.personasIntro.trim(), items: personas.filter((p) => p.name) },
        competitive: { intro: v.compIntro.trim(), columns: head || [], rows: rows.map(([feature, ...values]) => ({ feature, values: values.map((x) => (/^(yes|y|✓)$/i.test(x) ? "yes" : /^(partial|~|≈)$/i.test(x) ? "partial" : "no")) })) },
        ia: { intro: v.iaIntro.trim(), root: v.iaRoot.trim(), sections: lines(v.iaSections).map((l) => { const [t, ...rest] = l.split(":"); return { title: t.trim(), items: rest.join(":").split(";").map((x) => x.trim()).filter(Boolean) }; }) },
        flow: { title: v.flowTitle.trim(), intro: v.flowIntro.trim(), steps: flow.filter((s) => s.label || s.src) },
        style: { ...(c.style || {}), intro: v.styleIntro.trim(), font: v.styleFont.trim(), button: v.styleButton.trim(), sampleHead: v.styleHead.trim(), sampleBody: v.styleBody.trim(),
          colors: lines(v.styleColors).map((l) => { const m = l.match(/^(.*?)\s*(#[0-9a-f]{3,8})$/i); return m ? { name: m[1].trim() || m[2], hex: m[2] } : null; }).filter(Boolean) },
      };
      const site = currentSite();
      site.cases = site.cases || [];
      const i = site.cases.findIndex((x) => x.id === (original?.id ?? "\u0000"));
      if (i >= 0) site.cases[i] = next;
      else {
        if (site.cases.some((x) => x.id === next.id)) next.id += "-" + Date.now().toString(36).slice(-4);
        site.cases.push(next);
      }
      await saveSite(site);
      toast("Case study saved");
      done();
    },
  });
}
