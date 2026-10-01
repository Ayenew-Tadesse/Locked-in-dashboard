// A soft two-note "ding" for new messages, made in the browser (no sound
// file). Browsers only allow sound after the page has been clicked or tapped
// once, so the audio starts on the first click or key press. On or off is
// remembered per device (the 🔔 in the chat window).
const KEY = "li_chat_sound";
let ctx = null, last = 0;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* this visit only */ }
}

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}
// The first click or key press unlocks sound for the rest of the visit.
const unlock = () => { audio()?.resume?.().catch(() => {}); };
addEventListener("pointerdown", unlock, { once: true, capture: true });
addEventListener("keydown", unlock, { once: true, capture: true });

function note(c, freq, at, length) {
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** Ding (at most once every 1.5 s, and not when switched off). Fires "li:chime" when it plays. */
export function chime() {
  if (!soundOn()) return false;
  const now = Date.now();
  if (now - last < 1500) return false;
  last = now;
  const c = audio();
  if (c && c.state !== "closed") {
    try {
      const t = c.currentTime + 0.01;
      note(c, 880, t, 0.18);        // A5
      note(c, 1318.5, t + 0.11, 0.3); // E6
    } catch { /* no sound this time */ }
  }
  window.dispatchEvent(new Event("li:chime"));
  return true;
}
