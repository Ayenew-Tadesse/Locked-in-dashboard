// The "edit on the page" shell shared by the case-study editor and the
// portfolio editor: a full-screen page with a bar (Cancel / Settings / Save),
// text you tap to edit (contenteditable, plain text only), + to add, ✕ to
// remove and pictures you tap to replace. Each editor brings its model, how
// to draw it and its own + actions; the shell keeps the model in step.
import { state, toast } from "../state.js";
import { esc, confirmDialog } from "../ui/dom.js";

export const imgUrl = (u) => (typeof u === "string" && /^(https?:|blob:|data:image\/)/i.test(u) ? u : "");

// "personas.items.0.needs.2" → read / write in the model.
const keys = (path) => path.split(".").map((k) => (/^\d+$/.test(k) ? Number(k) : k));
export function getAt(obj, path) { return keys(path).reduce((o, k) => (o == null ? o : o[k]), obj); }
export function setAt(obj, path, value) {
  const ks = keys(path), last = ks.pop();
  ks.reduce((o, k) => o[k], obj)[last] = value;
}

const ICON_X = "&#10005;";
/** An editable piece of text. multi: Enter makes a new line; para: Enter starts the next paragraph. */
export const ed = (path, value, { tag = "span", cls = "", ph = "", multi = false, para = false } = {}) =>
  `<${tag} class="ce-t ${cls}" contenteditable="true" spellcheck="true" role="textbox"${multi ? ' aria-multiline="true" data-multi' : ""}${para ? " data-para" : ""}
    data-k="${path}" data-ph="${esc(ph)}" aria-label="${esc(ph)}">${esc(value || "")}</${tag}>`;
/** "+ label": runs the editor's action act on the list at path. */
export const add = (act, path, label) => `<button type="button" class="ce-add" data-act="${act}" data-path="${path}">+ ${esc(label)}</button>`;
/** ✕: removes the item at path. */
export const del = (path, label = "Remove") => `<button type="button" class="ce-del" data-act="del" data-path="${path}" aria-label="${esc(label)}" title="${esc(label)}">${ICON_X}</button>`;
/** Paragraphs of one field (a list of strings), each removable, plus "+ Paragraph". */
export const paraList = (path, list, ph) => `${list.map((p, i) => `<div class="ce-item ce-para">${ed(`${path}.${i}`, p, { tag: "p", ph, multi: true, para: true })}${list.length > 1 ? del(`${path}.${i}`, "Remove paragraph") : ""}</div>`).join("")}
  ${list.length ? add("para", path, "Paragraph") : add("para", path, ph)}`;

let current = null;

/**
 * Open an editor. o.model (edited in place), o.render(model) → HTML, o.save(model) (async),
 * o.actions { act: (path, ctx) => focusPath | undefined } for its own + buttons,
 * o.settings(ctx), o.onDelete(path, ctx) after a ✕, o.wire(ctx) for extra listeners,
 * o.onInput(path, ctx) after typing, o.focus (a data-k to start in), o.done() after saving.
 */
export function openPageEditor(o) {
  current?.close(true);
  const { model } = o;
  let dirty = false;
  const wrap = document.createElement("div");
  wrap.id = "li-ce";
  wrap.className = o.className || "";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", o.label);
  wrap.innerHTML = `
    <header class="ce-bar">
      <button type="button" class="li-btn ghost" data-act="cancel">Cancel</button>
      <span class="ce-bar__title">${esc(o.title)} <small>Tap text to change it · + to add</small></span>
      <button type="button" class="li-btn ghost" data-act="preview" aria-pressed="false" title="See it as hiring managers do">Preview</button>
      ${o.settings ? `<button type="button" class="li-btn ghost" data-act="settings">Settings</button>` : ""}
      <button type="button" class="li-btn primary" data-act="save">Save</button>
    </header>
    <div class="ce-body"><div class="pf pf--site ce-page"></div></div>
    <input type="file" accept="image/*" hidden data-file>`;
  document.body.appendChild(wrap);
  document.documentElement.classList.add("li-ce-open");
  const page = wrap.querySelector(".ce-page"), body = wrap.querySelector(".ce-body"), file = wrap.querySelector("[data-file]");

  // Preview: the page without outlines, + / ✕ or hints (and nothing editable), as hiring managers see it.
  let preview = false;
  const applyPreview = () => {
    wrap.classList.toggle("ce-preview", preview);
    page.querySelectorAll("[data-k]").forEach((el) => el.setAttribute("contenteditable", preview ? "false" : "true"));
    const b = wrap.querySelector('[data-act="preview"]');
    if (b) { b.textContent = preview ? "Edit" : "Preview"; b.setAttribute("aria-pressed", String(preview)); }
  };
  const ctx = {
    model, page, wrap,
    markDirty() { dirty = true; },
    isDirty: () => dirty,
    draw(focusPath) {
      const y = body.scrollTop;
      page.innerHTML = o.render(model);
      body.scrollTop = y;
      if (focusPath) {
        const el = page.querySelector(`[data-k="${CSS.escape(focusPath)}"]`);
        if (el) { el.focus(); el.scrollIntoView({ block: "nearest" }); }
      }
      applyPreview();
      o.afterDraw?.(ctx);
    },
    close: (force) => close(force),
  };
  ctx.draw();
  if (o.focus) page.querySelector(o.focus)?.focus({ preventScroll: true });

  // Typing: keep the model in step (plain text; single-line fields stay one line).
  page.addEventListener("input", (e) => {
    const el = e.target.closest("[data-k]");
    if (!el) return;
    let v = el.innerText.replace(/ /g, " ");
    v = el.hasAttribute("data-multi") ? v.replace(/\n+$/, "") : v.replace(/\s*\n\s*/g, " ");
    setAt(model, el.dataset.k, v);
    // The same field shown twice (e.g. a title on a card and on the page) stays in step.
    page.querySelectorAll(`[data-k="${CSS.escape(el.dataset.k)}"]`).forEach((x) => { if (x !== el) x.textContent = v; });
    if (!el.textContent) el.innerHTML = ""; // so the placeholder shows again
    dirty = true;
    o.onInput?.(el.dataset.k, ctx);
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
    if (!el || e.key !== "Enter" || (e.shiftKey && el.hasAttribute("data-multi"))) return;
    if (el.hasAttribute("data-para")) {
      // Enter at the end of a paragraph starts the next one.
      e.preventDefault();
      const ks = el.dataset.k.split("."), i = Number(ks.pop()), path = ks.join(".");
      getAt(model, path).splice(i + 1, 0, "");
      dirty = true;
      ctx.draw(`${path}.${i + 1}`);
    } else if (!el.hasAttribute("data-multi")) { e.preventDefault(); el.blur(); }
  });

  // Pictures: tap one to replace it (img), or add some to a list (imgs).
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
      if (target.list) getAt(model, target.path).push(...urls.map((src) => target.wrap(src)));
      else setAt(model, target.path, urls[0]);
      dirty = true;
      ctx.draw();
    } catch (err) { toast("Couldn't upload: " + err.message, "error"); }
  });
  ctx.pickImages = (path, wrapItem) => { pickFor = { path, list: true, wrap: wrapItem }; file.multiple = true; file.click(); };

  function close(force) {
    wrap.remove();
    document.documentElement.classList.remove("li-ce-open");
    document.removeEventListener("keydown", onKey);
    if (current?.close === close) current = null;
    if (!force) o.onClose?.();
  }
  const cancel = async () => {
    if (dirty && !(await confirmDialog(o.discardText || "Discard your changes?", "Discard"))) return;
    close();
  };
  const onKey = (e) => { if (e.key === "Escape" && !document.getElementById("li-modal")) { e.preventDefault(); cancel(); } };
  document.addEventListener("keydown", onKey);

  const save = async (btn) => {
    btn.disabled = true;
    try {
      if ((await o.save(model, ctx)) === false) return; // the editor said why (e.g. a missing title)
      close(true);
      o.done?.();
    } catch (err) { toast("Couldn't save: " + err.message, "error"); } finally { btn.disabled = false; }
  };

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || !wrap.contains(b)) return;
    const { act, path } = b.dataset;
    if (act === "cancel") return cancel();
    if (act === "save") return save(b);
    if (act === "preview") { preview = !preview; applyPreview(); body.scrollTop = 0; return; }
    if (act === "settings") return o.settings(ctx);
    if (preview) return; // nothing changes while previewing
    if (act === "img") { pickFor = { path }; file.multiple = false; return file.click(); }
    if (act === "del") {
      const ks = path.split("."), i = Number(ks.pop());
      getAt(model, ks.join(".")).splice(i, 1);
      o.onDelete?.(path, ctx);
      dirty = true;
      return ctx.draw();
    }
    if (act === "para" || act === "item") {
      const list = getAt(model, path);
      list.push("");
      dirty = true;
      return ctx.draw(`${path}.${list.length - 1}`);
    }
    const fn = o.actions?.[act];
    if (fn) {
      const focus = fn(path, ctx, b);
      if (focus !== false) { dirty = true; ctx.draw(typeof focus === "string" ? focus : undefined); }
    }
  });
  o.wire?.(ctx);

  current = { close };
  return ctx;
}
