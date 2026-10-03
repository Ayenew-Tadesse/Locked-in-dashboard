// Screenshot sliders on case studies (site.js): a line of screenshots that
// scrolls sideways and snaps to each one. Arrows and dots move it; swipe,
// trackpad and the keyboard work because it's a normal scrolling row. Wired
// once for the whole page, so redrawn previews need nothing extra.
const track = (el) => el.closest("[data-slider]")?.querySelector(".pf-slider__track");
const items = (t) => [...t.querySelectorAll(".pf-slider__item")];
const smooth = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** Which screenshot is showing (the one nearest the start of the row). */
function current(t) {
  const list = items(t), left = t.scrollLeft;
  let best = 0;
  list.forEach((it, i) => { if (Math.abs(it.offsetLeft - list[0].offsetLeft - left) < Math.abs(list[best].offsetLeft - list[0].offsetLeft - left)) best = i; });
  return best;
}
function go(t, i) {
  const list = items(t);
  const n = Math.max(0, Math.min(list.length - 1, i));
  t.scrollTo({ left: list[n].offsetLeft - list[0].offsetLeft, behavior: smooth() });
}
/** Dots and arrows follow the row. */
function sync(t) {
  const slider = t.closest("[data-slider]"), i = current(t), end = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4;
  slider.querySelectorAll("[data-slide-to]").forEach((d, j) => d.toggleAttribute("aria-current", j === (end ? items(t).length - 1 : i)));
  slider.querySelector(".pf-slider__btn--prev").disabled = t.scrollLeft <= 4;
  slider.querySelector(".pf-slider__btn--next").disabled = end;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-slider] [data-slide], [data-slider] [data-slide-to]");
  if (!b) return;
  const t = track(b);
  if (!t) return;
  e.preventDefault();
  if (b.dataset.slideTo != null) go(t, Number(b.dataset.slideTo));
  else go(t, current(t) + Number(b.dataset.slide));
});
// Scroll events don't bubble: listen while capturing.
document.addEventListener("scroll", (e) => {
  const t = e.target;
  if (t instanceof Element && t.matches(".pf-slider__track")) sync(t);
}, true);
// Arrow keys on the focused row move one screenshot at a time.
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (!(t instanceof Element) || !t.matches(".pf-slider__track") || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  e.preventDefault();
  go(t, current(t) + (e.key === "ArrowRight" ? 1 : -1));
});
