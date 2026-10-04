// The featured projects row (site.js draws it). It loops: after the last card
// comes the first again (and before the first, the last). A few cards are
// copied onto each end (hidden from screen readers, out of the tab order) and,
// once a slide ends on a copy, the row jumps to the real card in the same place,
// which looks the same, so the row never seems to end. Arrows slide one card;
// the dots show which project leads and jump to one. Swiping / trackpad
// scrolling is the browser's own (CSS scroll snap). When every card already
// fits, there's nothing to slide: no copies, arrows or dots.
let stopCurrent = null;

/** Wire up the row in a freshly drawn portfolio (and stop the previous one). */
export function setupRails(root) {
  stopCurrent?.();
  stopCurrent = null;
  const wrap = root?.querySelector(".pf-rail-wrap");
  const rail = wrap?.querySelector(".pf-rail");
  if (!rail) return;
  const nav = wrap.querySelector(".pf-rail-nav"), dots = wrap.querySelector(".pf-rail-dots");
  const items = [...rail.children];
  const n = items.length;

  // One step = a card plus the gap.
  const step = () => (rail.children[1] ? rail.children[1].offsetLeft - rail.children[0].offsetLeft : rail.clientWidth) || 1;
  const visible = () => Math.max(1, Math.round((rail.clientWidth + 1) / step()));
  let k = 0; // copies on each end (0: no loop)

  const jump = (left) => {
    const was = rail.style.scrollBehavior;
    rail.style.scrollBehavior = "auto";
    rail.scrollLeft = left;
    rail.style.scrollBehavior = was;
  };
  const leading = () => Math.round(rail.scrollLeft / step()); // the card at the left edge (copies included)
  const realIndex = () => (((leading() - k) % n) + n) % n;

  const copy = (el) => {
    const c = el.cloneNode(true);
    c.dataset.railCopy = "";
    c.setAttribute("aria-hidden", "true");
    c.querySelectorAll("a, button, [tabindex]").forEach((x) => x.setAttribute("tabindex", "-1"));
    return c;
  };
  // (Re)build the copies for how many cards fit now, keeping the same card in front.
  const build = () => {
    const at = k ? realIndex() : 0;
    rail.querySelectorAll("[data-rail-copy]").forEach((c) => c.remove());
    const v = visible();
    k = n > v ? v : 0;
    nav.hidden = dots.hidden = !k;
    if (!k) { dots.innerHTML = ""; return; }
    rail.prepend(...items.slice(-k).map(copy));
    rail.append(...items.slice(0, k).map(copy));
    dots.innerHTML = items.map((_, i) => `<button type="button" class="pf-rail-dot" data-dot="${i}" aria-label="Show project ${i + 1}"></button>`).join("");
    // Put the same real card in front (measured, since browsers may already have kept it in view).
    jump(items[Math.min(at, n - 1)].offsetLeft - rail.children[0].offsetLeft);
    paint();
  };
  const paint = () => {
    const at = realIndex();
    dots.querySelectorAll(".pf-rail-dot").forEach((d, i) => d.setAttribute("aria-current", String(i === at)));
  };
  // When a slide ends on a copy, move to the real card that looks the same.
  const settle = () => {
    if (!k) return;
    const i = leading();
    if (i < k) jump(rail.scrollLeft + n * step());
    else if (i >= k + n) jump(rail.scrollLeft - n * step());
    paint();
  };

  let frame = 0, timer = 0;
  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
    clearTimeout(timer);
    timer = setTimeout(settle, 140); // browsers without "scrollend"
  };
  const onScrollEnd = () => { clearTimeout(timer); settle(); };
  const onClick = (e) => {
    const b = e.target.closest("[data-rail], [data-dot]");
    if (!b || !k) return;
    if (b.dataset.rail) rail.scrollBy({ left: (b.dataset.rail === "next" ? 1 : -1) * step() });
    else rail.scrollTo({ left: (k + Number(b.dataset.dot)) * step() });
  };
  let lastWidth = 0;
  const onResize = () => {
    if (rail.clientWidth === lastWidth) return;
    lastWidth = rail.clientWidth;
    build();
  };
  rail.addEventListener("scroll", onScroll, { passive: true });
  rail.addEventListener("scrollend", onScrollEnd);
  wrap.addEventListener("click", onClick);
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
  ro?.observe(rail);
  onResize();
  stopCurrent = () => {
    rail.removeEventListener("scroll", onScroll);
    rail.removeEventListener("scrollend", onScrollEnd);
    wrap.removeEventListener("click", onClick);
    ro?.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}
