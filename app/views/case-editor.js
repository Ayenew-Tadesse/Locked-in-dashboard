// Edit a case study on the page itself: the case study as a hiring manager
// sees it, where you tap text to change it, tap + to add a paragraph, step,
// persona, need, flow step, screenshot or section, tap ✕ to remove one and
// tap a picture to replace it. Save / Cancel / Settings sit in a bar at the
// top. Everything is plain text (pasting drops formatting) and the public page
// escapes it, so nothing typed here can run as code.
//
// The home-page card (tag, title, description) is shown at the top and
// edited the same way. "Edit as a form" (in Settings) is still there.
import { state, toast } from "../state.js";
import { esc, openModal, closeModal } from "../ui/dom.js";
import { openPageEditor, ed, add, del, paraList, getAt, setAt, imgUrl } from "./page-editor.js";
import { deviceOf, phoneShots, screenFrame, cardThumb } from "../portfolio/site.js";

export const META = ["Role", "Type", "Platform", "Tools"];
/** The "Device" choice: what "Try the app" opens in and how screenshots are framed. */
export const deviceField = (d, note = '"Try the app" and screenshots') => `<label class="li-field">Device <small class="li-muted">(${note})</small><select name="device">
  ${[["phone", "Phone"], ["tablet", "Tablet (landscape)"], ["computer", "Computer (website)"], ["both", "Phone and computer"]].map(([k, l]) => `<option value="${k}"${d === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const paras = (t) => String(t || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
const joinParas = (list) => (list || []).map((p) => String(p).trim()).filter(Boolean).join("\n\n");
const clean = (s) => String(s ?? "").trim();

/* ------------------------------------------------------------- card screens */

/**
 * Choose the picture for one of the card's screens (i: 0 front, 1 left, 2 right):
 * one of the case study's screenshots, an upload, or an image address (which can
 * be one that updates itself). "Leave empty" brings back the placeholder screen.
 */
function chooseCardScreen(model, i, ctx) {
  const set = (src) => {
    model.cardShots = model.cardShots || ["", "", ""];
    model.cardShots[i] = src;
    ctx.markDirty();
    ctx.draw();
  };
  const which = { phone: ["front (middle)", "left", "right"], both: ["computer", "phone"] }[deviceOf(model)]?.[i] || "card's";
  const shots = model.shots.map((x) => imgUrl(x.src)).filter(Boolean);
  openModal({
    eyebrow: "Card on your home page", title: `Choose the ${which} screen`, submitLabel: "Use this address", wide: true,
    body: `${shots.length ? `<div class="li-field full"><span>From this case study's screenshots</span><div class="ce-pick">${shots.map((src) => `<button type="button" class="ce-pick__shot${model.cardShots?.[i] === src ? " on" : ""}" data-pick="${esc(src)}"><img src="${esc(src)}" alt=""></button>`).join("")}</div></div>` : ""}
      <div class="li-field full"><span>Or upload a picture</span><label class="li-btn small li-pf-upload">Upload<input type="file" accept="image/*" data-pick-file hidden></label></div>
      <label class="li-field full">Or paste an image address <small class="li-muted">(https://…; one that updates itself keeps the card up to date)</small><input name="url" type="url" maxlength="500" placeholder="https://…" value="${esc(model.cardShots?.[i] && !shots.includes(model.cardShots[i]) ? model.cardShots[i] : "")}"></label>
      ${model.cardShots?.[i] ? `<button type="button" class="li-btn small ghost" data-pick-clear>Leave this screen empty (placeholder)</button>` : ""}`,
    onReady(f) {
      f.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pick], [data-pick-clear]");
        if (!b) return;
        set(b.dataset.pick || "");
        closeModal();
      });
      f.querySelector("[data-pick-file]").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try { set(await state.store.uploadPortfolioImage(file, file.name)); closeModal(); } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
      });
    },
    async onSubmit(v) {
      const url = imgUrl(String(v.url || "").trim());
      if (!url || !/^https:\/\//i.test(url)) throw new Error("Paste an image address starting with https://");
      set(url);
    },
  });
}

/* ------------------------------------------------------------------ model */

// The case study in an easy-to-edit shape: multi-paragraph text as lists.
function toModel(c) {
  const meta = [...META.map((label) => ({ label, value: (c.meta || []).find((m) => m.label.toLowerCase() === label.toLowerCase())?.value || "" })),
    ...(c.meta || []).filter((m) => !META.some((l) => l.toLowerCase() === String(m.label).toLowerCase()))];
  return {
    ...clone(c),
    title: c.title || "", subtitle: c.subtitle || "", pill: c.pill || "", meta,
    shots: (c.shots || []).map((s) => ({ src: s.src || "", alt: s.alt || "" })),
    overview: paras(c.overview), problem: paras(c.problem), solution: paras(c.solution), outcome: paras(c.outcome),
    insight: c.insight || "",
    process: { intro: paras(c.process?.intro), steps: [...(c.process?.steps || [])] },
    personas: { intro: c.personas?.intro || "", items: (c.personas?.items || []).map((p) => ({ ...p, needs: [...(p.needs || [])], frustrations: [...(p.frustrations || [])], goals: [...(p.goals || [])] })) },
    flow: { title: c.flow?.title || "", intro: c.flow?.intro || "", steps: (c.flow?.steps || []).map((s) => ({ label: s.label || "", src: s.src || "" })) },
    extra: (c.extra || []).map((x) => ({ title: x.title || "", text: paras(x.text) })),
    tag: c.tag || "", cardDesc: c.cardDesc || "",
    cardShots: Array.isArray(c.cardShots) ? [0, 1, 2].map((i) => c.cardShots[i] || "") : null,
    competitive: { intro: c.competitive?.intro || "", columns: [...(c.competitive?.columns || [])],
      rows: (c.competitive?.rows || []).map((r) => ({ feature: r.feature || "", values: [...(r.values || [])] })) },
    ia: { intro: c.ia?.intro || "", root: c.ia?.root || "", sections: (c.ia?.sections || []).map((x) => ({ title: x.title || "", items: [...(x.items || [])] })) },
    style: { ...(c.style || {}), intro: c.style?.intro || "", font: c.style?.font || "", button: c.style?.button || "", sampleHead: c.style?.sampleHead || "",
      sampleBody: c.style?.sampleBody || "", colors: (c.style?.colors || []).map((x) => ({ name: x.name || "", hex: x.hex || "" })) },
  };
}

// The comparison table's marks: tap a cell to go yes → partly → no.
export const MARKS = { yes: "&#10003;", partial: "&#8776;", no: "&#8212;" };
const NEXT_MARK = { yes: "partial", partial: "no", no: "yes" };
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const markOf = (v) => (MARKS[v] ? v : "no");

// Back to what the portfolio stores (empty bits dropped).
export function fromModel(m) {
  const list = (a) => (a || []).map(clean).filter(Boolean);
  return {
    ...m,
    title: clean(m.title), subtitle: clean(m.subtitle), pill: clean(m.pill),
    meta: m.meta.map((x) => ({ label: clean(x.label), value: clean(x.value) })).filter((x) => x.label && x.value),
    shots: m.shots.filter((s) => imgUrl(s.src)),
    overview: joinParas(m.overview), problem: joinParas(m.problem), solution: joinParas(m.solution), outcome: joinParas(m.outcome),
    insight: clean(m.insight),
    process: { intro: joinParas(m.process.intro), steps: list(m.process.steps) },
    personas: { intro: clean(m.personas.intro), items: m.personas.items.map((p) => ({ ...p, name: clean(p.name), age: clean(p.age), sex: clean(p.sex),
      location: clean(p.location), occupation: clean(p.occupation), summary: clean(p.summary), needs: list(p.needs), frustrations: list(p.frustrations), goals: list(p.goals) }))
      .filter((p) => p.name) },
    flow: { title: clean(m.flow.title), intro: clean(m.flow.intro), steps: m.flow.steps.map((s) => ({ label: clean(s.label), src: imgUrl(s.src) })).filter((s) => s.label || s.src) },
    extra: m.extra.map((x) => ({ title: clean(x.title), text: joinParas(x.text) })).filter((x) => x.title || x.text),
    tag: clean(m.tag), cardDesc: clean(m.cardDesc),
    cardShots: m.cardShots?.some((x) => imgUrl(x)) ? m.cardShots.map((x) => imgUrl(x) || "") : undefined,
    competitive: (() => {
      const rows = m.competitive.rows.map((r) => ({ feature: clean(r.feature), values: m.competitive.columns.slice(1).map((_, i) => markOf(r.values[i])) })).filter((r) => r.feature);
      return { intro: clean(m.competitive.intro), columns: rows.length ? m.competitive.columns.map(clean) : [], rows };
    })(),
    ia: { intro: clean(m.ia.intro), root: clean(m.ia.root), sections: m.ia.sections.map((x) => ({ title: clean(x.title), items: list(x.items) })).filter((x) => x.title) },
    style: { ...m.style, intro: clean(m.style.intro), font: clean(m.style.font), sampleHead: clean(m.style.sampleHead), sampleBody: clean(m.style.sampleBody),
      button: HEX.test(clean(m.style.button)) ? clean(m.style.button) : "",
      colors: m.style.colors.map((x) => ({ name: clean(x.name), hex: clean(x.hex) })).filter((x) => HEX.test(x.hex)).map((x) => ({ name: x.name || x.hex, hex: x.hex })) },
  };
}

/* ---------------------------------------------------------------- drawing */

const block = (title, body, cls = "") => `<section class="pf-case-block ce-block ${cls}"><h2>${esc(title)}</h2>${body}</section>`;

function personaHtml(p, i) {
  const base = `personas.items.${i}`;
  const photo = imgUrl(p.photo)
    ? `<img class="pf-persona__photo" src="${esc(p.photo)}" alt="">`
    : `<span class="pf-persona__photo pf-persona__initials" aria-hidden="true">&#128100;</span>`;
  const chips = (key, label) => `<div class="pf-persona__row"><span>${label}</span><div class="ce-chips">
      ${(p[key] || []).map((t, j) => `<em class="ce-chip">${ed(`${base}.${key}.${j}`, t, { ph: label.replace(/s$/, "") })}${del(`${base}.${key}.${j}`, "Remove")}</em>`).join("")}
      ${add("item", `${base}.${key}`, label.replace(/s$/, "").toLowerCase())}</div></div>`;
  return `<div class="pf-persona ce-item">
    ${del(base, "Remove persona")}
    <div class="pf-persona__head">
      <button type="button" class="ce-img ce-img--round" data-act="img" data-path="${base}.photo" aria-label="${imgUrl(p.photo) ? "Change photo" : "Add a photo"}">${photo}</button>
      <div>${ed(`${base}.name`, p.name, { tag: "h3", ph: "Persona name, e.g. The Frequent Flyer" })}
        <p class="pf-persona__demo ce-demo">${ed(`${base}.age`, p.age, { ph: "Age" })} · ${ed(`${base}.sex`, p.sex, { ph: "Sex" })} · ${ed(`${base}.location`, p.location, { ph: "Location" })} · ${ed(`${base}.occupation`, p.occupation, { ph: "Occupation" })}</p></div>
    </div>
    ${ed(`${base}.summary`, p.summary, { tag: "p", ph: "One line about them" })}
    ${chips("needs", "Needs")}${chips("frustrations", "Frustrations")}${chips("goals", "Goals")}
  </div>`;
}

// The comparison table: header names and features are text; each mark is a button.
function compareHtml(c) {
  const cols = c.columns;
  const head = cols.length ? `<thead><tr>${cols.map((h, j) => `<th><span class="ce-cell">${ed(`competitive.columns.${j}`, h, { ph: j ? "App" : "Feature" })}${j > 1 ? del(`competitive.columns.${j}`, "Remove column") : ""}</span></th>`).join("")}</tr></thead>` : "";
  const body = c.rows.map((r, i) => `<tr><td><span class="ce-cell">${del(`competitive.rows.${i}`, "Remove row")}${ed(`competitive.rows.${i}.feature`, r.feature, { ph: "Feature" })}</span></td>
    ${cols.slice(1).map((_, j) => { const v = markOf(r.values[j]); return `<td class="${v}"><button type="button" class="ce-mark" data-act="mark" data-path="competitive.rows.${i}.values.${j}" aria-label="${esc(r.feature || "Feature")} in ${esc(cols[j + 1] || "this app")}: ${v}. Tap to change">${MARKS[v]}</button></td>`; }).join("")}</tr>`).join("");
  return `<div class="pf-table-wrap"><table class="pf-compare ce-compare">${head}<tbody>${body}</tbody></table></div>
    ${add("row", "competitive.rows", "Row")}${cols.length ? add("col", "competitive.columns", "Column") : ""}`;
}

function iaHtml(ia) {
  return `<div class="pf-ia">${ed("ia.root", ia.root, { cls: "pf-ia__root", ph: "App name" })}
    <div class="pf-ia__sections">${ia.sections.map((x, i) => `<div class="ce-item">${del(`ia.sections.${i}`, "Remove section")}
        ${ed(`ia.sections.${i}.title`, x.title, { tag: "h3", ph: "Section, e.g. Search" })}
        <ul>${x.items.map((it, j) => `<li class="ce-li">${ed(`ia.sections.${i}.items.${j}`, it, { ph: "Screen or item" })}${del(`ia.sections.${i}.items.${j}`, "Remove")}</li>`).join("")}</ul>
        ${add("item", `ia.sections.${i}.items`, "Item")}</div>`).join("")}</div>
    ${add("iasection", "ia.sections", "Section")}</div>`;
}

function styleHtml(st) {
  const sw = (hex) => (HEX.test(hex) ? hex : "transparent");
  return `<h3 class="pf-h3">Color palette</h3>
    <div class="pf-swatches">${st.colors.map((x, i) => `<div class="ce-item ce-swatch">${del(`style.colors.${i}`, "Remove colour")}
        <label class="ce-swatch__pick" aria-label="Pick ${esc(x.name || "the colour")}"><i style="background:${sw(x.hex)}" data-swatch="${i}"></i><input type="color" data-color="style.colors.${i}.hex" value="${HEX.test(x.hex) && x.hex.length === 7 ? esc(x.hex) : "#3366ff"}"></label>
        ${ed(`style.colors.${i}.name`, x.name, { tag: "b", ph: "Name" })}${ed(`style.colors.${i}.hex`, x.hex, { ph: "#HEX" })}</div>`).join("")}</div>
    ${add("color", "style.colors", "Colour")}
    <h3 class="pf-h3">Typography</h3>
    <div class="pf-type">${ed("style.sampleHead", st.sampleHead, { tag: "b", ph: "Sample heading" })}${ed("style.sampleBody", st.sampleBody, { tag: "p", ph: "Sample text" })}${ed("style.font", st.font, { ph: "Font, e.g. Poppins" })}</div>
    <h3 class="pf-h3">Buttons</h3>
    <div class="pf-s-actions ce-buttons"><span class="pf-btn pf-btn--solid" data-btn-sample style="${HEX.test(st.button) ? `background:${st.button};border-color:${st.button}` : ""}">Primary action</span><span class="pf-btn pf-btn--outline">Secondary action</span>
      <label class="ce-swatch__pick ce-swatch__pick--small" aria-label="Pick the button colour"><i style="background:${sw(st.button)}" data-swatch="button"></i><input type="color" data-color="style.button" value="${HEX.test(st.button) && st.button.length === 7 ? esc(st.button) : "#3366ff"}"></label>
      ${ed("style.button", st.button, { ph: "#HEX" })}</div>`;
}

// How it shows on your home page.
function cardHtml(m) {
  const names = { phone: ["Front (middle)", "Left", "Right"], both: ["Computer", "Phone"] }[deviceOf(m)] || ["Screen"];
  return `<section class="ce-cardwrap"><p class="ce-label">Card on your home page <small class="li-muted">(tap a screen to choose its picture)</small></p>
    <article class="pf-card ce-card">${cardThumb(m, { slots: true })}
      <div class="pf-card__body">${ed("tag", m.tag, { tag: "p", cls: "pf-card__tag", ph: "Tag, e.g. Mobile App UI/UX" })}${ed("title", m.title, { tag: "h3", ph: "Case study title" })}
        ${ed("cardDesc", m.cardDesc, { tag: "p", cls: "pf-card__desc", ph: "One or two lines for the card", multi: true })}</div></article>
    <p class="ce-cardslots"><span>Card screens:</span>${names.map((l, i) => `<button type="button" class="ce-chiptoggle${m.cardShots?.[i] ? " on" : ""}" data-act="cardslot" data-path="${i}">${l}</button>`).join("")}</p></section>`;
}

function render(m) {
  const frame = screenFrame(m), wide = !phoneShots(m); // tablets and computers: screenshots in their device
  return `${cardHtml(m)}
  <article class="pf-case ce-case">
    ${ed("pill", m.pill, { tag: "p", cls: "pf-pill", ph: "Status label, e.g. Live case study" })}
    ${ed("title", m.title, { tag: "h1", cls: "pf-case__title", ph: "Case study title" })}
    ${ed("subtitle", m.subtitle, { tag: "p", cls: "pf-s-desc", ph: "Subtitle: one or two lines about the project", multi: true })}
    <div class="pf-shots ce-shots${wide ? " pf-shots--wide" : ""}">${m.shots.map((s, i) => `<span class="ce-item ce-shot">
        <button type="button" class="ce-img" data-act="img" data-path="shots.${i}.src" aria-label="Replace screenshot ${i + 1}">${frame(`<img src="${esc(imgUrl(s.src))}" alt="">`)}</button>${del(`shots.${i}`, "Remove screenshot")}</span>`).join("")}
      <button type="button" class="ce-add ce-add--shot" data-act="shots" data-path="shots">+ Screenshot</button></div>
    <dl class="pf-meta">${m.meta.map((x, i) => `<div><dt>${esc(x.label)}</dt><dd>${ed(`meta.${i}.value`, x.value, { ph: x.label })}</dd></div>`).join("")}</dl>
    ${block("Overview", paraList("overview", m.overview, "Overview"))}
    ${block("Design process", `${paraList("process.intro", m.process.intro, "Intro to your process")}
      <ol class="pf-steps">${m.process.steps.map((s, i) => `<li class="ce-item"><span>${String(i + 1).padStart(2, "0")}</span>${ed(`process.steps.${i}`, s, { ph: "Step" })}${del(`process.steps.${i}`, "Remove step")}</li>`).join("")}</ol>
      ${add("item", "process.steps", "Step")}`)}
    ${block("Problem statement", paraList("problem", m.problem, "Problem statement"))}
    ${block("Who I designed for", `${ed("personas.intro", m.personas.intro, { tag: "p", cls: "pf-intro", ph: "Intro: who you designed for", multi: true })}
      <div class="pf-personas">${m.personas.items.map(personaHtml).join("")}</div>${add("persona", "personas.items", "Persona")}`)}
    ${block("Competitive analysis", `${ed("competitive.intro", m.competitive.intro, { tag: "p", cls: "pf-intro", ph: "Intro: who you compared against", multi: true })}${compareHtml(m.competitive)}`)}
    ${block("Key insight", `<blockquote class="pf-insight">${ed("insight", m.insight, { ph: "The key insight", multi: true })}</blockquote>`)}
    ${block("Information architecture", `${ed("ia.intro", m.ia.intro, { tag: "p", cls: "pf-intro", ph: "Intro to the structure", multi: true })}${iaHtml(m.ia)}`)}
    <section class="pf-case-block ce-block"><h2>${ed("flow.title", m.flow.title, { ph: "User flow" })}</h2>
      ${ed("flow.intro", m.flow.intro, { tag: "p", cls: "pf-intro", ph: "Intro to the flow", multi: true })}
      <ol class="pf-flow${wide ? " pf-flow--wide" : ""}">${m.flow.steps.map((s, i) => `<li class="ce-item">
          <button type="button" class="ce-img" data-act="img" data-path="flow.steps.${i}.src" aria-label="${imgUrl(s.src) ? "Replace" : "Add"} the image for step ${i + 1}">${imgUrl(s.src) ? frame(`<img src="${esc(s.src)}" alt="">`) : `<span class="ce-noimg">+ Image</span>`}</button>
          ${ed(`flow.steps.${i}.label`, s.label, { ph: "Step name" })}${del(`flow.steps.${i}`, "Remove step")}</li>`).join("")}</ol>
      ${add("flow", "flow.steps", "Flow step")}</section>
    ${block("Solution", paraList("solution", m.solution, "Solution"))}
    ${block("UI style guide", `${ed("style.intro", m.style.intro, { tag: "p", cls: "pf-intro", ph: "Intro to the style guide", multi: true })}${styleHtml(m.style)}`)}
    ${block("Outcome", paraList("outcome", m.outcome, "Outcome"))}
    ${m.extra.map((x, i) => `<section class="pf-case-block ce-block ce-item"><h2>${ed(`extra.${i}.title`, x.title, { ph: "Section title" })}</h2>${del(`extra.${i}`, "Remove section")}
      ${paraList(`extra.${i}.text`, x.text, "Text")}</section>`).join("")}
    <p class="ce-section-add">${add("section", "extra", "Add a section")}</p>
  </article>`;
}

/* ----------------------------------------------------------------- editor */

/**
 * Open the editor. original: the saved case study (null for a new one).
 * opts.save(next, original): store it; opts.onDelete(): delete it (true when deleted);
 * opts.openForm(draft): the form editor with the changes so far; opts.done(): after saving / deleting.
 */
export function openCaseEditor(original, opts) {
  const model = toModel(original || { id: "", status: "live", meta: [] });

  // Colour swatches and the sample button follow the hex codes as you type or pick.
  const paintColours = ({ page }) => {
    model.style.colors.forEach((x, i) => { const sw = page.querySelector(`[data-swatch="${i}"]`); if (sw) sw.style.background = HEX.test(x.hex.trim()) ? x.hex.trim() : "transparent"; });
    const b = model.style.button.trim(), ok = HEX.test(b);
    const sample = page.querySelector("[data-btn-sample]"), sw = page.querySelector('[data-swatch="button"]');
    if (sample) { sample.style.background = ok ? b : ""; sample.style.borderColor = ok ? b : ""; }
    if (sw) sw.style.background = ok ? b : "transparent";
  };

  // Settings: what isn't visible text on the page.
  const settings = (ctx) => openModal({
    eyebrow: "Case study", title: "Settings", submitLabel: "Done",
    extraButtons: `${opts.onDelete ? `<button type="button" class="li-btn danger-ghost" data-case-delete>Delete</button>` : ""}<button type="button" class="li-btn ghost" data-case-form>Edit as a form</button>`,
    body: `
      <label class="li-field">Status<select name="status"><option value="live"${model.status !== "progress" ? " selected" : ""}>Live case study</option><option value="progress"${model.status === "progress" ? " selected" : ""}>In progress (card only)</option></select></label>
      <label class="li-field">Live app link<input name="liveUrl" maxlength="300" value="${esc(model.liveUrl || "")}" placeholder="https://…"></label>
      ${deviceField(deviceOf(model))}
      <label class="li-field full">Dashboard project <small class="li-muted">(shows its live progress)</small><select name="project"><option value="">None</option>${(state.projects || []).map((p) => `<option${model.project === p.name ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`,
    onReady(f) {
      f.querySelector("[data-case-form]").addEventListener("click", () => { closeModal(); ctx.close(true); opts.openForm(fromModel(model)); });
      f.querySelector("[data-case-delete]")?.addEventListener("click", async () => {
        if (await opts.onDelete()) { ctx.close(true); opts.done?.(); }
      });
    },
    async onSubmit(v) {
      Object.assign(model, { status: v.status === "progress" ? "progress" : "live", liveUrl: v.liveUrl.trim(), device: v.device, phone: ["phone", "both"].includes(v.device), project: v.project || "" });
      ctx.markDirty();
    },
  });

  return openPageEditor({
    model, label: original ? "Edit case study" : "New case study", title: original ? "Editing on the page" : "New case study",
    discardText: "Discard your changes to this case study?",
    focus: '.pf-case [data-k="title"]',
    render, settings, done: opts.done, onClose: opts.onClose,
    async save(m, ctx) {
      const next = fromModel(m);
      if (!next.title) { toast("Give the case study a title first.", "error"); ctx.page.querySelector('.pf-case [data-k="title"]')?.focus(); return false; }
      await opts.save(next, original);
      toast("Case study saved");
    },
    onInput: (path, ctx) => paintColours(ctx),
    onDelete(path, ctx) {
      // A removed column takes its mark out of every row.
      const ks = path.split("."), i = Number(ks.pop());
      if (ks.join(".") === "competitive.columns") ctx.model.competitive.rows.forEach((r) => r.values.splice(i - 1, 1));
    },
    wire(ctx) {
      // The card's screens are tappable; Enter or Space opens them too.
      ctx.page.addEventListener("keydown", (e) => {
        const slot = e.target.closest?.("[data-slot]");
        if (slot && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); slot.click(); }
      });
      ctx.page.addEventListener("change", (e) => {
        const pick = e.target.closest("[data-color]");
        if (!pick) return;
        setAt(model, pick.dataset.color, pick.value);
        const field = ctx.page.querySelector(`[data-k="${CSS.escape(pick.dataset.color)}"]`);
        if (field) field.textContent = pick.value;
        ctx.markDirty();
        paintColours(ctx);
      });
    },
    actions: {
      shots(path, ctx) { ctx.pickImages(path, (src) => ({ src, alt: "" })); return false; },
      cardslot(i, ctx) { chooseCardScreen(model, Number(i), ctx); return false; },
      persona(path) { const l = getAt(model, path); l.push({ name: "", needs: [], frustrations: [], goals: [] }); return `${path}.${l.length - 1}.name`; },
      flow(path) { const l = getAt(model, path); l.push({ label: "", src: "" }); return `${path}.${l.length - 1}.label`; },
      section(path) { const l = getAt(model, path); l.push({ title: "", text: [""] }); return `${path}.${l.length - 1}.title`; },
      iasection(path) { const l = getAt(model, path); l.push({ title: "", items: [] }); return `${path}.${l.length - 1}.title`; },
      color(path) { const l = getAt(model, path); l.push({ name: "", hex: "" }); return `${path}.${l.length - 1}.name`; },
      mark(path, ctx) {
        setAt(model, path, NEXT_MARK[markOf(getAt(model, path))]);
        ctx.markDirty();
        ctx.draw();
        ctx.page.querySelector(`[data-path="${CSS.escape(path)}"]`)?.focus();
        return false;
      },
      row() {
        const c = model.competitive;
        if (!c.columns.length) c.columns = ["Feature", "This app", "Competitor"];
        c.rows.push({ feature: "", values: c.columns.slice(1).map(() => "no") });
        return `competitive.rows.${c.rows.length - 1}.feature`;
      },
      col(path) { const l = getAt(model, path); l.push(""); model.competitive.rows.forEach((r) => r.values.push("no")); return `${path}.${l.length - 1}`; },
    },
  });
}
