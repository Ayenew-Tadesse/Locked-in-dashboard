// "Try the app" in a phone or a tablet: on a computer the live app opens
// inside a realistic phone (390 × 844, like an iPhone) or a landscape tablet
// (1180 × 820, like an iPad), scaled to fit the window, so a hiring manager
// can tap through it without leaving the portfolio. On a phone the link just
// opens the app full screen (it's already on a real phone).
// Links opt in with data-try (see site.js); Close, Esc or the backdrop close it.
import { esc } from "../ui/dom.js";

const SIZES = { phone: { W: 390, H: 844, BEZEL: 14 }, tablet: { W: 1180, H: 820, BEZEL: 24 } };
const small = () => matchMedia("(max-width: 699px)").matches;
let open = null;

const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");

// Signal, Wi-Fi and battery, drawn in the status bar's text colour.
const ICONS = `<svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>
  <svg width="15" height="11" viewBox="0 0 15 11" aria-hidden="true"><path d="M7.5 2.2c2.1 0 4 .8 5.4 2.1l1.1-1.1A9.2 9.2 0 0 0 7.5.6 9.2 9.2 0 0 0 1 3.2l1.1 1.1a7.7 7.7 0 0 1 5.4-2.1Zm0 3.2c1.2 0 2.3.5 3.2 1.2l1.1-1.1a6.1 6.1 0 0 0-8.6 0l1.1 1.1c.9-.7 2-1.2 3.2-1.2Zm0 3.1c-.4 0-.8.2-1.1.5L7.5 10l1.1-1c-.3-.3-.7-.5-1.1-.5Z"/></svg>
  <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true"><rect x=".5" y=".5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="2"/><path d="M23 4v4c.8-.3 1.3-1.1 1.3-2S23.8 4.3 23 4Z" opacity=".5"/></svg>`;

/** Handle a click on a "Try the app" link; true when the phone opened. */
export function tryInPhone(e) {
  const a = e.target.closest?.("a[data-try]");
  if (!a || small() || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return false;
  e.preventDefault();
  openPhone(a.href, a.dataset.try || "", a, a.dataset.device === "tablet" ? "tablet" : "phone");
  return true;
}

export function openPhone(url, title, from = document.activeElement, device = "phone") {
  closePhone();
  let size = SIZES[device] || SIZES.phone;
  const box = document.createElement("div");
  box.className = "pf-phone-overlay";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", `${title || "App"}, interactive demo`);
  // Both devices' details are drawn; the frame's class shows the ones that belong to it.
  box.innerHTML = `
    <div class="pf-phone-stage">
      <div class="pf-phone-fit">
        <div class="pf-phone">
          <span class="pf-phone__btn pf-phone__btn--power pf-only-phone" aria-hidden="true"></span>
          <span class="pf-phone__btn pf-phone__btn--vol1 pf-only-phone" aria-hidden="true"></span>
          <span class="pf-phone__btn pf-phone__btn--vol2 pf-only-phone" aria-hidden="true"></span>
          <span class="pf-phone__btn pf-phone__btn--top pf-only-tablet" aria-hidden="true"></span><i class="pf-phone__cam pf-only-tablet" aria-hidden="true"></i>
          <div class="pf-phone__screen">
            <div class="pf-phone__status" aria-hidden="true"><b class="pf-phone__time">${clock()}</b><i class="pf-phone__island pf-only-phone"></i><span class="pf-phone__icons">${ICONS}</span></div>
            <iframe class="pf-phone__app" src="${esc(url)}" title="${esc(title || "App")} (interactive demo)" allow="clipboard-write; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
            <div class="pf-phone__loading" aria-hidden="true"><span></span></div>
            <div class="pf-phone__home" aria-hidden="true"><i></i></div>
          </div>
        </div>
      </div>
      <div class="pf-phone__bar">
        <p class="pf-phone__cap"><b>${esc(title || "Live app")}</b> · interactive demo. Click to tap, scroll to swipe.</p>
        <div class="pf-phone__actions">
          <div class="pf-device-switch" role="group" aria-label="Show the app on">
            <button type="button" data-device="phone" aria-pressed="false">Phone</button><button type="button" data-device="tablet" aria-pressed="false">Tablet</button>
          </div>
          <a class="pf-btn pf-btn--outline" href="${esc(url)}" target="_blank" rel="noopener">Open full screen &#8599;</a>
          <button type="button" class="pf-btn pf-btn--solid" data-phone-close>Close</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(box);
  document.documentElement.classList.add("pf-phone-open");

  const fit = () => {
    const { W, H, BEZEL } = size;
    const bar = box.querySelector(".pf-phone__bar").offsetHeight + 40;
    const s = Math.max(0.3, Math.min(1, (innerHeight - bar - 32) / (H + BEZEL * 2), (innerWidth - 32) / (W + BEZEL * 2)));
    const f = box.querySelector(".pf-phone-fit");
    f.style.setProperty("--s", String(s));
    f.style.width = (W + BEZEL * 2) * s + "px";
    f.style.height = (H + BEZEL * 2) * s + "px";
  };
  // Reshape the frame around the running app (the app isn't reloaded, so it keeps its place).
  const setDevice = (d) => {
    size = SIZES[d] || SIZES.phone;
    const { W, H, BEZEL } = size, frame = box.querySelector(".pf-phone");
    frame.classList.toggle("pf-phone--tablet", d === "tablet");
    Object.assign(frame.style, { width: W + BEZEL * 2 + "px", height: H + BEZEL * 2 + "px" });
    Object.assign(box.querySelector(".pf-phone__screen").style, { width: W + "px", height: H + "px" });
    box.querySelectorAll("[data-device]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === d)));
    box.dataset.device = d;
    fit();
  };
  box.querySelector(".pf-device-switch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-device]");
    if (b) setDevice(b.dataset.device);
  });
  setDevice(device === "tablet" ? "tablet" : "phone");
  const key = (e) => { if (e.key === "Escape") closePhone(); };
  const tick = setInterval(() => { const t = box.querySelector(".pf-phone__time"); if (t) t.textContent = clock(); }, 30000);
  box.querySelector(".pf-phone__app").addEventListener("load", () => box.classList.add("is-loaded"), { once: true });
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target.classList.contains("pf-phone-stage") || e.target.closest("[data-phone-close]")) closePhone();
  });
  addEventListener("resize", fit);
  addEventListener("keydown", key);
  box.querySelector("[data-phone-close]").focus({ preventScroll: true });
  open = () => {
    clearInterval(tick);
    removeEventListener("resize", fit);
    removeEventListener("keydown", key);
    box.remove();
    document.documentElement.classList.remove("pf-phone-open");
    from?.focus?.({ preventScroll: true });
  };
}

export function closePhone() {
  const done = open;
  open = null;
  done?.();
}
