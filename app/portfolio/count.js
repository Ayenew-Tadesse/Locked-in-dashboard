// The numbers strip (3+, 50+, 35+): each number counts up from 0 when the
// strip comes into view, then again every 10 seconds while it's on screen
// and the tab is visible. Whatever is around the number ("+", "$", "%")
// stays put; text that isn't a number doesn't move. Screen readers get the
// final value only, and with reduced motion nothing animates.
const DURATION = 1500, EVERY = 10000;
let stopCurrent = null;

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
  stopCurrent?.();
  stopCurrent = null;
  const strip = root?.querySelector(".pf-s-stats");
  if (!strip || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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

  let frame = 0, timer = 0, visible = false;
  const run = () => {
    cancelAnimationFrame(frame);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION), ease = 1 - Math.pow(1 - t, 3);
      for (const { shown, p } of nums) shown.textContent = t < 1 ? show(p, Math.round(p.n * ease * 10 ** p.decimals) / 10 ** p.decimals) : show(p, p.n);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    clearInterval(timer);
    if (!visible) return;
    run();
    timer = setInterval(() => { if (visible && !document.hidden) run(); }, EVERY);
  }, { threshold: 0.4 });
  io.observe(strip);
  stopCurrent = () => { io.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); };
}
