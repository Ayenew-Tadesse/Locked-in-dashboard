// The featured projects row (site.js draws it): arrows slide one card at a
// time, the dots show where you are and jump to a card, and both hide when
// every card already fits. Swiping / trackpad scrolling is the browser's own
// (CSS scroll snap), so phones need nothing from here but the dots.
let stopCurrent = null;

/** Wire up the row in a freshly drawn portfolio (and stop the previous one). */
export function setupRails(root) {
  stopCurrent?.();
  stopCurrent = null;
  const wrap = root?.querySelector(".pf-rail-wrap");
  const rail = wrap?.querySelector(".pf-rail");
  if (!rail) return;
  const nav = wrap.querySelector(".pf-rail-nav"), dots = wrap.querySelector(".pf-rail-dots");
  const prev = wrap.querySelector('[data-rail="prev"]'), next = wrap.querySelector('[data-rail="next"]');
  const items = [...rail.children];

  // One step = a card plus the gap; "stops" = where the row can come to rest.
  const step = () => (items[1] ? items[1].offsetLeft - items[0].offsetLeft : rail.clientWidth) || 1;
  const stops = () => Math.max(1, items.length - Math.round(rail.clientWidth / step()) + 1);
  let drawnStops = 0;
  const update = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    const overflow = max > 1;
    nav.hidden = dots.hidden = !overflow;
    const n = overflow ? stops() : 0;
    if (n !== drawnStops) {
      drawnStops = n;
      dots.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" class="pf-rail-dot" data-dot="${i}" aria-label="Show project ${i + 1}"></button>`).join("");
    }
    const at = rail.scrollLeft >= max - 1 ? n - 1 : Math.min(n - 1, Math.round(rail.scrollLeft / step()));
    dots.querySelectorAll(".pf-rail-dot").forEach((d, i) => d.setAttribute("aria-current", String(i === at)));
    prev.disabled = rail.scrollLeft <= 1;
    next.disabled = rail.scrollLeft >= max - 1;
  };
  let frame = 0;
  const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  const onClick = (e) => {
    const b = e.target.closest("[data-rail], [data-dot]");
    if (!b) return;
    if (b.dataset.rail) rail.scrollBy({ left: (b.dataset.rail === "next" ? 1 : -1) * step() });
    else rail.scrollTo({ left: Number(b.dataset.dot) * step() });
  };
  rail.addEventListener("scroll", onScroll, { passive: true });
  wrap.addEventListener("click", onClick);
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onScroll);
  ro?.observe(rail);
  update();
  stopCurrent = () => { rail.removeEventListener("scroll", onScroll); wrap.removeEventListener("click", onClick); ro?.disconnect(); cancelAnimationFrame(frame); };
}
