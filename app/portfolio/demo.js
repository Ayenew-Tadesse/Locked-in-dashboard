// The front phone on each featured project card "is being used": every few
// seconds a tap shows on the screen, then the next screen slides in, and it
// loops. Only cards on screen play; hovering or touching a card pauses it;
// nothing moves for visitors who ask for less motion, or in a hidden tab.
// site.js draws the screens ([data-demo] with [data-demo-screen] pictures).
const STEP_MS = 2600, TAP_MS = 450;
let timer = 0;
const wired = new WeakSet(); // roots that already listen for touches

const onScreen = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
};

function advance(demo) {
  const screens = [...demo.querySelectorAll("[data-demo-screen]")];
  if (screens.length < 2) return;
  const i = Math.max(0, screens.findIndex((s) => s.classList.contains("is-on")));
  const tap = demo.querySelector(".pf-demo__tap");
  tap?.classList.remove("is-tapping");
  void tap?.offsetWidth; // restart the tap animation
  tap?.classList.add("is-tapping");
  setTimeout(() => {
    screens.forEach((s) => s.classList.remove("is-leaving"));
    screens[i].classList.replace("is-on", "is-leaving");
    screens[(i + 1) % screens.length].classList.add("is-on");
  }, TAP_MS);
}

/** Start the demos in a freshly drawn portfolio (one timer for the whole page). */
export function setupDemos(root) {
  clearInterval(timer);
  if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Touching a card pauses it for a moment (hover pauses it on computers).
  if (wired.has(root)) return startTimer(root);
  wired.add(root);
  root.addEventListener("pointerdown", (e) => {
    const card = e.target.closest?.(".pf-card");
    if (card) card.dataset.demoPaused = String(Date.now() + 6000);
  });
  startTimer(root);
}

function startTimer(root) {
  timer = setInterval(() => {
    if (document.hidden) return;
    root.querySelectorAll("[data-demo]").forEach((demo) => {
      const card = demo.closest(".pf-card");
      if (card?.matches(":hover") || Number(card?.dataset.demoPaused || 0) > Date.now()) return;
      if (onScreen(demo)) advance(demo);
    });
  }, STEP_MS);
}
