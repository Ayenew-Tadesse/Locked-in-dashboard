// Small DOM helpers shared by the views.
import { STATUSES, PRIORITIES } from "../core/tasks.js";

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Same thresholds as the score rings: 40 and under red, under 80 orange, 80+ green. */
export function scoreTone(v) {
  if (v == null) return "idle";
  return v <= 40 ? "red" : v < 80 ? "orange" : "green";
}

export function statusPill(status) {
  return `<span class="li-pill st-${esc(status)}">${esc(STATUSES[status] || status)}</span>`;
}
export function priorityPill(p) {
  return `<span class="li-pill pr-${esc(p)}">${esc(PRIORITIES[p]?.label || p)}</span>`;
}
export function progressBar(pct, label) {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `<span class="li-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"${label ? ` aria-label="${esc(label)}"` : ""}><b class="${scoreTone(v)}" style="width:${v}%"></b></span>`;
}
/** "████████░░" style bar, as in the quarterly example. */
export function textBar(pct, width = 10) {
  const filled = Math.round(Math.max(0, Math.min(100, Number(pct) || 0)) / 100 * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
export function tile(label, value, sub = "", tone = "", attrs = "") {
  return `<div class="li-tile ${tone ? "tone-" + tone : ""}" ${attrs}><span class="li-tile-label">${esc(label)}</span>` +
    `<span class="li-tile-value">${value}</span>${sub ? `<span class="li-tile-sub">${sub}</span>` : ""}</div>`;
}
export function scoreValue(v) { return v == null ? "—" : `${v}<small>/100</small>`; }
export function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function showToast(msg, kind = "info") {
  let box = $("#li-toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "li-toasts";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "li-toast " + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), kind === "error" ? 6000 : 2600);
  setTimeout(() => el.remove(), kind === "error" ? 6400 : 3000);
}

// ---------------------------------------------------------------------------
// Modal dialog with a form. onSubmit(values) may throw to show an error.
// ---------------------------------------------------------------------------
let lastFocus = null;
export function openModal({ eyebrow = "", title, body, submitLabel = "Save", onSubmit, extraButtons = "", wide = false, onReady }) {
  closeModal();
  lastFocus = document.activeElement;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop li-modal-backdrop";
  wrap.id = "li-modal";
  wrap.innerHTML = `
    <div class="modal li-modal${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="li-modal-title">
      <div class="modal-head">
        <div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ""}<h2 class="modal-title" id="li-modal-title">${esc(title)}</h2></div>
        <button class="modal-close" type="button" data-close aria-label="Close">&#10005;</button>
      </div>
      <form class="li-form" novalidate>
        ${body}
        <p class="li-form-error" role="alert" hidden></p>
        <div class="li-form-actions">${extraButtons}<span class="li-spacer"></span>
          <button type="button" class="li-btn ghost" data-close>Cancel</button>
          ${onSubmit ? `<button type="submit" class="li-btn primary">${esc(submitLabel)}</button>` : ""}
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  document.documentElement.classList.add("li-modal-open");
  const form = $("form", wrap);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) closeModal(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const err = $(".li-form-error", form);
    err.hidden = true;
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      await onSubmit(formValues(form), form);
      closeModal();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
      err.hidden = false;
    } finally { btn.disabled = false; }
  });
  onReady && onReady(form, wrap);
  const first = $("input:not([type=hidden]), select, textarea", form);
  setTimeout(() => (first || $("[data-close]", wrap)).focus(), 30);
  return form;
}
export function closeModal() {
  const m = $("#li-modal");
  if (!m) return;
  m.remove();
  document.documentElement.classList.remove("li-modal-open");
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#li-modal")) closeModal(); });

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") {
      if (el.name.endsWith("[]")) { const k = el.name.slice(0, -2); (out[k] = out[k] || []); if (el.checked) out[k].push(el.value); }
      else out[el.name] = el.checked;
    } else out[el.name] = el.value;
  }
  return out;
}

export function confirmDialog(text, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      eyebrow: "Please confirm", title: text, body: "", submitLabel: confirmLabel,
      onSubmit: async () => { answered = true; resolve(true); },
    });
    const m = $("#li-modal");
    new MutationObserver((_, obs) => { if (!document.contains(m)) { obs.disconnect(); if (!answered) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

export function options(map, selected, { empty } = {}) {
  const entries = Array.isArray(map) ? map : Object.entries(map);
  return (empty != null ? `<option value="">${esc(empty)}</option>` : "") +
    entries.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(selected ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("");
}
