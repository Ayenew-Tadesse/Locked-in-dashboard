// Lightweight charts (no library): single-series bars and a line with a
// hover tooltip. Scores use the same red/orange/green tones as the rings;
// every bar also carries its number, so colour is never the only signal.
import { esc, scoreTone } from "./dom.js";

let tip;
function tooltip() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "heat-tip li-chart-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}
export function showTip(target, html) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const r = target.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.offsetWidth / 2), window.innerWidth - t.offsetWidth - 8);
  let top = r.top - t.offsetHeight - 8;
  if (top < 8) top = r.bottom + 8;
  t.style.left = left + "px";
  t.style.top = top + "px";
}
export function hideTip() { if (tip) tip.hidden = true; }
document.addEventListener("scroll", hideTip, true);

/**
 * Vertical bars. items: [{ label, value (null = no data), tip, key, sub }].
 * opts: { max = 100, tone = scoreTone, unit = "", aria }
 */
export function barChart(items, { max = 100, tone = scoreTone, unit = "", aria = "Bar chart", height = 150 } = {}) {
  const top = Math.max(max, ...items.map((i) => i.value || 0)) || 1;
  const cols = items.map((i) => {
    const h = i.value == null ? 0 : Math.max(2, (i.value / top) * 100);
    return `<button type="button" class="li-bc-col" data-tip="${esc(i.tip || `${i.label}: ${i.value == null ? "no data" : i.value + unit}`)}"` +
      (i.key ? ` data-key="${esc(i.key)}"` : "") + ` aria-label="${esc(i.tip || `${i.label}: ${i.value == null ? "no data" : i.value + unit}`)}">` +
      `<span class="li-bc-val">${i.value == null ? "" : esc(i.value) + esc(unit)}</span>` +
      `<span class="li-bc-track"><span class="li-bc-bar ${i.value == null ? "empty" : tone(i.value)}" style="height:${h}%"></span></span>` +
      `<span class="li-bc-label">${esc(i.label)}</span>${i.sub != null ? `<span class="li-bc-sub">${esc(i.sub)}</span>` : ""}</button>`;
  }).join("");
  return `<div class="li-bc" role="group" aria-label="${esc(aria)}" style="--h:${height}px">` +
    `<span class="li-bc-grid" aria-hidden="true"><i style="bottom:50%"></i><i style="bottom:100%"></i></span>${cols}</div>`;
}

/**
 * Line chart over time. points: [{ label, value (null = no data), tip }].
 * Hover (or tap) anywhere shows the nearest point.
 */
export function lineChart(points, { max = 100, aria = "Line chart", height = 160, unit = "" } = {}) {
  const W = 600, H = height, padT = 10, padB = 22, n = points.length;
  const top = Math.max(max, ...points.map((p) => p.value || 0)) || 1;
  const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * (W - 16) + 8);
  const y = (v) => padT + (1 - v / top) * (H - padT - padB);
  // Days without data are skipped; the line connects the days around them.
  let d = "";
  points.forEach((p, i) => {
    if (p.value == null) return;
    d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1);
  });
  const step = Math.max(1, Math.ceil(n / 6));
  // Axis labels are HTML so they don't stretch with the SVG.
  const labels = points.map((p, i) => i % step === 0 || i === n - 1
    ? `<span style="left:${(x(i) / W * 100).toFixed(2)}%" class="${i === 0 ? "first" : i === n - 1 ? "last" : ""}">${esc(p.label)}</span>` : "").join("");
  const tips = esc(JSON.stringify(points.map((p) => p.tip || `${p.label}: ${p.value == null ? "no data" : p.value + unit}`)));
  return `<div class="li-lc" data-tips="${tips}" data-w="${W}">` +
    `<svg viewBox="0 0 ${W} ${H - padB}" preserveAspectRatio="none" role="img" aria-label="${esc(aria)}" style="height:${H - padB}px">` +
    [0, 50, 100].map((g) => `<line class="li-lc-grid" x1="0" x2="${W}" y1="${y(g * top / 100)}" y2="${y(g * top / 100)}"/>`).join("") +
    `<path class="li-lc-line" d="${d}"/><line class="li-lc-cross" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/></svg>` +
    `<div class="li-lc-axis" aria-hidden="true">${labels}</div></div>`;
}

/** Horizontal progress rows: [{ label, value (0-100), detail }]. */
export function hBars(rows, { aria = "Progress", tone = scoreTone } = {}) {
  return `<ul class="li-hbars" aria-label="${esc(aria)}">` + rows.map((r) =>
    `<li><span class="li-hb-label">${esc(r.label)}</span><span class="li-hb-track"><b class="${tone(r.value)}" style="width:${Math.max(0, Math.min(100, r.value || 0))}%"></b></span>` +
    `<span class="li-hb-val">${r.display ?? Math.round(r.value || 0) + "%"}</span>${r.detail ? `<span class="li-hb-detail">${esc(r.detail)}</span>` : ""}</li>`).join("") + "</ul>";
}

// Hover behaviour for all charts (event delegation).
document.addEventListener("mouseover", (e) => {
  const col = e.target.closest?.(".li-bc-col");
  if (col) showTip(col, esc(col.dataset.tip));
});
document.addEventListener("focusin", (e) => {
  const col = e.target.closest?.(".li-bc-col");
  if (col) showTip(col, esc(col.dataset.tip));
});
document.addEventListener("mouseout", (e) => { if (e.target.closest?.(".li-bc-col")) hideTip(); });
document.addEventListener("focusout", (e) => { if (e.target.closest?.(".li-bc-col")) hideTip(); });
function lineHover(e) {
  const box = e.target.closest?.(".li-lc");
  if (!box) return;
  const pts = JSON.parse(box.dataset.tips);
  const r = box.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const W = Number(box.dataset.w);
  const idx = Math.max(0, Math.min(pts.length - 1, Math.round(((cx / r.width) * W - 8) / (W - 16) * (pts.length - 1))));
  const cross = box.querySelector(".li-lc-cross");
  const px = pts.length <= 1 ? W / 2 : (idx / (pts.length - 1)) * (W - 16) + 8;
  cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("visibility", "visible");
  const anchor = { getBoundingClientRect: () => ({ left: r.left + (px / W) * r.width - 1, width: 2, top: r.top, bottom: r.bottom }) };
  showTip(anchor, esc(pts[idx]));
}
document.addEventListener("mousemove", lineHover);
document.addEventListener("touchstart", lineHover, { passive: true });
document.addEventListener("mouseout", (e) => {
  const box = e.target.closest?.(".li-lc");
  if (box && !box.contains(e.relatedTarget)) { hideTip(); box.querySelector(".li-lc-cross")?.setAttribute("visibility", "hidden"); }
});
