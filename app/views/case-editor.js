// Edit a case study on the page itself: the case study as a hiring manager
// sees it, where you tap text to change it, tap + to add a paragraph, step,
// persona, need, flow step, screenshot or section, tap ✕ to remove one and
// tap a picture to replace it. Save / Cancel / Settings sit in a bar at the
// top. Everything is plain text (pasting drops formatting) and the public page
// escapes it, so nothing typed here can run as code.
//
// The comparison table, information architecture and style guide are still
// edited with the form ("Edit as a form") for now.
import { state, toast } from "../state.js";
import { esc, openModal, confirmDialog } from "../ui/dom.js";

export const META = ["Role", "Type", "Platform", "Tools"];
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const paras = (t) => String(t || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
const joinParas = (list) => (list || []).map((p) => String(p).trim()).filter(Boolean).join("\n\n");
const clean = (s) => String(s ?? "").trim();
const imgUrl = (u) => (typeof u === "string" && /^(https?:|blob:|data:image\/)/i.test(u) ? u : "");

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
  };
}

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
  };
}

// "personas.items.0.needs.2" → read / write / remove in the model.
const keys = (path) => path.split(".").map((k) => (/^\d+$/.test(k) ? Number(k) : k));
function getAt(obj, path) { return keys(path).reduce((o, k) => (o == null ? o : o[k]), obj); }
function setAt(obj, path, value) {
  const ks = keys(path), last = ks.pop();
  const parent = ks.reduce((o, k) => o[k], obj);
  parent[last] = value;
}

/* ---------------------------------------------------------------- drawing */

const ICON_X = "&#10005;";
// An editable piece of text. multi: Enter makes a new line (otherwise it finishes).
const ed = (path, value, { tag = "span", cls = "", ph = "", multi = false, para = false } = {}) =>
  `<${tag} class="ce-t ${cls}" contenteditable="true" spellcheck="true" role="textbox"${multi ? ' aria-multiline="true" data-multi' : ""}${para ? " data-para" : ""}
    data-k="${path}" data-ph="${esc(ph)}" aria-label="${esc(ph)}">${esc(value || "")}</${tag}>`;
const add = (act, path, label) => `<button type="button" class="ce-add" data-act="${act}" data-path="${path}">+ ${esc(label)}</button>`;
const del = (path, label = "Remove") => `<button type="button" class="ce-del" data-act="del" data-path="${path}" aria-label="${esc(label)}" title="${esc(label)}">${ICON_X}</button>`;

// Paragraphs of one field, each removable, plus "add a paragraph".
const paraList = (path, list, ph) => `${list.map((p, i) => `<div class="ce-item ce-para">${ed(`${path}.${i}`, p, { tag: "p", ph, multi: true, para: true })}${list.length > 1 ? del(`${path}.${i}`, "Remove paragraph") : ""}</div>`).join("")}
  ${list.length ? add("para", path, "Paragraph") : add("para", path, ph)}`;
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

function render(m) {
  return `<article class="pf-case ce-case">
    ${ed("pill", m.pill, { tag: "p", cls: "pf-pill", ph: "Status label, e.g. Live case study" })}
    ${ed("title", m.title, { tag: "h1", cls: "pf-case__title", ph: "Case study title" })}
    ${ed("subtitle", m.subtitle, { tag: "p", cls: "pf-s-desc", ph: "Subtitle: one or two lines about the project", multi: true })}
    <div class="pf-shots ce-shots">${m.shots.map((s, i) => `<span class="ce-item ce-shot">
        <button type="button" class="ce-img" data-act="img" data-path="shots.${i}.src" aria-label="Replace screenshot ${i + 1}"><img src="${esc(imgUrl(s.src))}" alt=""></button>${del(`shots.${i}`, "Remove screenshot")}</span>`).join("")}
      <button type="button" class="ce-add ce-add--shot" data-act="shots" data-path="shots">+ Screenshot</button></div>
    <dl class="pf-meta">${m.meta.map((x, i) => `<div><dt>${esc(x.label)}</dt><dd>${ed(`meta.${i}.value`, x.value, { ph: x.label })}</dd></div>`).join("")}</dl>
    ${block("Overview", paraList("overview", m.overview, "Overview"))}
    ${block("Design process", `${paraList("process.intro", m.process.intro, "Intro to your process")}
      <ol class="pf-steps">${m.process.steps.map((s, i) => `<li class="ce-item"><span>${String(i + 1).padStart(2, "0")}</span>${ed(`process.steps.${i}`, s, { ph: "Step" })}${del(`process.steps.${i}`, "Remove step")}</li>`).join("")}</ol>
      ${add("item", "process.steps", "Step")}`)}
    ${block("Problem statement", paraList("problem", m.problem, "Problem statement"))}
    ${block("Who I designed for", `${ed("personas.intro", m.personas.intro, { tag: "p", cls: "pf-intro", ph: "Intro: who you designed for", multi: true })}
      <div class="pf-personas">${m.personas.items.map(personaHtml).join("")}</div>${add("persona", "personas.items", "Persona")}`)}
    ${block("Key insight", `<blockquote class="pf-insight">${ed("insight", m.insight, { ph: "The key insight", multi: true })}</blockquote>`)}
    <section class="pf-case-block ce-block"><h2>${ed("flow.title", m.flow.title, { ph: "User flow" })}</h2>
      ${ed("flow.intro", m.flow.intro, { tag: "p", cls: "pf-intro", ph: "Intro to the flow", multi: true })}
      <ol class="pf-flow">${m.flow.steps.map((s, i) => `<li class="ce-item">
          <button type="button" class="ce-img" data-act="img" data-path="flow.steps.${i}.src" aria-label="${imgUrl(s.src) ? "Replace" : "Add"} the image for step ${i + 1}">${imgUrl(s.src) ? `<img src="${esc(s.src)}" alt="">` : `<span class="ce-noimg">+ Image</span>`}</button>
          ${ed(`flow.steps.${i}.label`, s.label, { ph: "Step name" })}${del(`flow.steps.${i}`, "Remove step")}</li>`).join("")}</ol>
      ${add("flow", "flow.steps", "Flow step")}</section>
    ${block("Solution", paraList("solution", m.solution, "Solution"))}
    ${block("Outcome", paraList("outcome", m.outcome, "Outcome"))}
    ${m.extra.map((x, i) => `<section class="pf-case-block ce-block ce-item"><h2>${ed(`extra.${i}.title`, x.title, { ph: "Section title" })}</h2>${del(`extra.${i}`, "Remove section")}
      ${paraList(`extra.${i}.text`, x.text, "Text")}</section>`).join("")}
    <p class="ce-section-add">${add("section", "extra", "Add a section")}</p>
    <aside class="ce-note"><span>The <b>comparison table</b>, <b>information architecture</b> and <b>UI style guide</b> are edited with the form for now.</span>
      <button type="button" class="li-btn small" data-act="form">Edit as a form</button></aside>
  </article>`;
}

/* ----------------------------------------------------------------- editor */

let open = null;

/**
 * Open the editor. original: the saved case study (null for a new one).
 * opts.save(next): store it; opts.onDelete(): delete it (true when deleted);
 * opts.openForm(draft): the form editor with the changes so far; opts.done(): after saving / deleting.
 */
export function openCaseEditor(original, opts) {
  open?.close(true);
  const model = toModel(original || { id: "", status: "live", meta: [] });
  let dirty = false;

  const wrap = document.createElement("div");
  wrap.id = "li-ce";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", original ? "Edit case study" : "New case study");
  wrap.innerHTML = `
    <header class="ce-bar">
      <button type="button" class="li-btn ghost" data-act="cancel">Cancel</button>
      <span class="ce-bar__title">${original ? "Editing on the page" : "New case study"} <small>Tap text to change it · + to add</small></span>
      <button type="button" class="li-btn ghost" data-act="settings">Settings</button>
      <button type="button" class="li-btn primary" data-act="save">Save</button>
    </header>
    <div class="ce-body"><div class="pf pf--site ce-page"></div></div>
    <input type="file" accept="image/*" hidden data-file>`;
  document.body.appendChild(wrap);
  document.documentElement.classList.add("li-ce-open");
  const page = wrap.querySelector(".ce-page"), body = wrap.querySelector(".ce-body"), file = wrap.querySelector("[data-file]");

  const draw = (focusPath) => {
    const y = body.scrollTop;
    page.innerHTML = render(model);
    body.scrollTop = y;
    if (focusPath) {
      const el = page.querySelector(`[data-k="${CSS.escape(focusPath)}"]`);
      if (el) { el.focus({ preventScroll: false }); el.scrollIntoView({ block: "nearest" }); }
    }
  };
  draw();
  page.querySelector('[data-k="title"]')?.focus({ preventScroll: true });

  // Typing: keep the model in step (plain text; single-line fields stay one line).
  page.addEventListener("input", (e) => {
    const el = e.target.closest("[data-k]");
    if (!el) return;
    let v = el.innerText.replace(/ /g, " ");
    v = el.hasAttribute("data-multi") ? v.replace(/\n+$/, "") : v.replace(/\s*\n\s*/g, " ");
    setAt(model, el.dataset.k, v);
    if (!el.textContent) el.innerHTML = ""; // so the placeholder shows again
    dirty = true;
  });
  page.addEventListener("paste", (e) => {
    const el = e.target.closest("[data-k]");
    if (!el) return;
    e.preventDefault();
    let text = e.clipboardData?.getData("text/plain") || "";
    if (!el.hasAttribute("data-multi")) text = text.replace(/\s*\n\s*/g, " ");
    document.execCommand("insertText", false, text);
  });
  page.addEventListener("drop", (e) => { if (e.target.closest?.("[data-k]")) e.preventDefault(); });
  page.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-k]");
    if (!el || e.key !== "Enter" || e.shiftKey && el.hasAttribute("data-multi")) return;
    if (el.hasAttribute("data-para")) {
      // Enter at the end of a paragraph starts the next one.
      e.preventDefault();
      const ks = el.dataset.k.split("."), i = Number(ks.pop()), path = ks.join(".");
      getAt(model, path).splice(i + 1, 0, "");
      dirty = true;
      draw(`${path}.${i + 1}`);
    } else if (!el.hasAttribute("data-multi")) { e.preventDefault(); el.blur(); }
  });

  // Images: tap one to replace it; "+ Screenshot" adds some.
  let pickFor = null;
  file.addEventListener("change", async () => {
    const files = [...file.files];
    file.value = "";
    if (!files.length || !pickFor) return;
    const target = pickFor;
    pickFor = null;
    try {
      const urls = [];
      for (const f of files) urls.push(await state.store.uploadPortfolioImage(f, f.name));
      if (target === "shots") model.shots.push(...urls.map((src) => ({ src, alt: "" })));
      else setAt(model, target, urls[0]);
      dirty = true;
      draw();
    } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
  });

  const close = (force) => {
    wrap.remove();
    document.documentElement.classList.remove("li-ce-open");
    document.removeEventListener("keydown", onKey);
    if (open?.close === close) open = null;
    if (!force) opts.onClose?.();
  };
  const cancel = async () => {
    if (dirty && !(await confirmDialog("Discard your changes to this case study?", "Discard"))) return;
    close();
  };
  const onKey = (e) => { if (e.key === "Escape" && !document.getElementById("li-modal")) { e.preventDefault(); cancel(); } };
  document.addEventListener("keydown", onKey);

  const save = async (btn) => {
    const next = fromModel(model);
    if (!next.title) { toast("Give the case study a title first.", "error"); page.querySelector('[data-k="title"]')?.focus(); return; }
    btn.disabled = true;
    try {
      await opts.save(next, original);
      toast("Case study saved");
      close(true);
      opts.done?.();
    } catch (err) { toast("Couldn't save: " + err.message, "error"); } finally { btn.disabled = false; }
  };

  // Settings: what isn't visible text on the page.
  const settings = () => openModal({
    eyebrow: "Case study", title: "Settings", submitLabel: "Done",
    extraButtons: opts.onDelete ? `<button type="button" class="li-btn danger-ghost" data-case-delete>Delete</button>` : "",
    body: `
      <label class="li-field">Tag on the card<input name="tag" maxlength="60" value="${esc(model.tag || "")}" placeholder="Mobile App UI/UX"></label>
      <label class="li-field full">Card description<textarea name="cardDesc" rows="2" maxlength="300">${esc(model.cardDesc || "")}</textarea></label>
      <label class="li-field">Status<select name="status"><option value="live"${model.status !== "progress" ? " selected" : ""}>Live case study</option><option value="progress"${model.status === "progress" ? " selected" : ""}>In progress (card only)</option></select></label>
      <label class="li-field">Live app link<input name="liveUrl" maxlength="300" value="${esc(model.liveUrl || "")}" placeholder="https://…"></label>
      <label class="li-check-row full"><input type="checkbox" name="phone"${model.phone !== false ? " checked" : ""}> Show "Try the app" in a phone frame on computers</label>
      <label class="li-field full">Dashboard project <small class="li-muted">(shows its live progress)</small><select name="project"><option value="">None</option>${(state.projects || []).map((p) => `<option${model.project === p.name ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`,
    onReady(f) {
      f.querySelector("[data-case-delete]")?.addEventListener("click", async () => {
        if (await opts.onDelete()) { close(true); opts.done?.(); }
      });
    },
    async onSubmit(v) {
      Object.assign(model, { tag: v.tag.trim(), cardDesc: v.cardDesc.trim(), status: v.status === "progress" ? "progress" : "live", liveUrl: v.liveUrl.trim(), phone: !!v.phone, project: v.project || "" });
      dirty = true;
    },
  });

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const { act, path } = b.dataset;
    if (act === "cancel") return cancel();
    if (act === "save") return save(b);
    if (act === "settings") return settings();
    if (act === "form") { close(true); return opts.openForm(fromModel(model)); }
    if (act === "img" || act === "shots") { pickFor = act === "shots" ? "shots" : path; file.multiple = act === "shots"; return file.click(); }
    const list = act === "del" ? null : getAt(model, path);
    if (act === "del") {
      const ks = path.split("."), i = Number(ks.pop());
      getAt(model, ks.join(".")).splice(i, 1);
      dirty = true;
      return draw();
    }
    // Add, then put the cursor in the new piece of text.
    if (act === "para" || act === "item") { list.push(""); dirty = true; return draw(`${path}.${list.length - 1}`); }
    if (act === "persona") { list.push({ name: "", needs: [], frustrations: [], goals: [] }); dirty = true; return draw(`${path}.${list.length - 1}.name`); }
    if (act === "flow") { list.push({ label: "", src: "" }); dirty = true; return draw(`${path}.${list.length - 1}.label`); }
    if (act === "section") { list.push({ title: "", text: [""] }); dirty = true; return draw(`${path}.${list.length - 1}.title`); }
  });

  open = { close };
  return { close };
}
