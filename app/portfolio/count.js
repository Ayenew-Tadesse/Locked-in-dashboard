// The numbers strip (3+, 50+, 35+): each number counts up from 0 when the
// strip comes into view, then again every 10 seconds while it's on screen
// and the tab is visible. Whatever is around the number ("+", "$", "%")
// stays put; text that isn't a number doesn't move. Screen readers get the
// final value only. Visitors who turned motion off get one short, calm
// count (no repeats). When the page is redrawn (e.g. once your GitHub
// activity loads) a count in progress carries on instead of restarting.
const DURATION = 1500, CALM = 800, EVERY = 10000;
let current = null; // { stop, visible, lastStart }
let calmDone = false; // motion off: count once per visit

// "1,200+" → { before: "", n: 1200, after: "+", decimals: 0, commas: true }
function parse(text) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  return Number.isFinite(n) ? { before: m[1], n, after: m[3], decimals: (m[2].split(".")[1] || "").length, commas: m[2].includes(",") } : null;
}
const show = (p, v) => p.before + (p.commas ? v.toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals }) : v.toFixed(p.decimals)) + p.after;

/** Start the count-up in a freshly drawn portfolio (stops the previous one). */
export function countStats(root) {
  // A redraw while the numbers were on screen picks up where that count was.
  let carry = current?.visible ? current.lastStart : null;
  current?.stop();
  current = null;
  const strip = root?.querySelector(".pf-s-stats");
  if (!strip || !("IntersectionObserver" in window)) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches, duration = calm ? CALM : DURATION;
  const nums = [...strip.querySelectorAll("b")].map((b) => {
    const final = b.textContent, p = parse(final);
    if (!p) return null;
    const width = b.getBoundingClientRect().width;
    // What's read aloud stays the final number; the counting copy is hidden from screen readers.
    b.innerHTML = "";
    const shown = document.createElement("span"), read = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    shown.textContent = final;
    read.className = "pf-sr";
    read.textContent = final;
    b.append(shown, read);
    if (width) b.style.minWidth = Math.ceil(width) + "px"; // nothing shifts while it counts
    return { shown, p };
  }).filter(Boolean);
  if (!nums.length) return;

  const state = { visible: false, lastStart: null, stop: null };
  let frame = 0, timer = 0;
  const run = (start = performance.now()) => {
    cancelAnimationFrame(frame);
    state.lastStart = start;
    if (calm) calmDone = true;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration)), ease = 1 - Math.pow(1 - t, 3);
      for (const { shown, p } of nums) shown.textContent = t < 1 ? show(p, Math.round(p.n * ease * 10 ** p.decimals) / 10 ** p.decimals) : show(p, p.n);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    step(performance.now());
  };
  // Every 10 seconds after the last count, while on screen and the tab is visible.
  const repeat = (wait) => {
    clearTimeout(timer);
    if (calm) return;
    timer = setTimeout(() => { if (state.visible && !document.hidden) run(); repeat(EVERY); }, wait);
  };
  const io = new IntersectionObserver(([e]) => {
    state.visible = e.isIntersecting;
    clearTimeout(timer);
    if (!state.visible) return;
    if (carry !== null && performance.now() - carry < EVERY) {
      run(carry);
      repeat(EVERY - (performance.now() - carry));
    } else if (!(calm && calmDone)) {
      run();
      repeat(EVERY);
    }
    carry = null;
  }, { threshold: 0.4 });
  io.observe(strip);
  state.stop = () => { io.disconnect(); clearTimeout(timer); cancelAnimationFrame(frame); };
  current = state;
}
