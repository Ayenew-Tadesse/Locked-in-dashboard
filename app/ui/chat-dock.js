// The chat button: a round button in the bottom-right corner on every page
// (for people on a team) with the unread count. It opens the team chat in a
// window above it (full screen on phones); Esc, ✕ or the button close it and
// what you've typed stays.
import { state } from "../state.js";
import { renderMessages, resumeMessages, unreadTotal } from "../views/messages.js";
import { soundOn, setSoundOn, chime } from "./chime.js";

let fab = null, panel = null, body = null, drawn = false;
const ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14.5h4.5"/></svg>`;

const isOpen = () => !!panel && !panel.hidden;

/** Builds the button and the (closed) window, once, for people on a team. */
export function setupChatDock() {
  if (fab || !state.team) return;
  fab = document.createElement("button");
  fab.type = "button";
  fab.id = "li-chat-fab";
  fab.setAttribute("aria-controls", "li-chat-panel");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = `${ICON}<span class="li-nav-dot" hidden></span>`;
  panel = document.createElement("section");
  panel.id = "li-chat-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Messages");
  panel.innerHTML = `<header class="li-dock-head"><b>Messages</b>
      <span class="li-btn-row"><button type="button" class="li-icon-btn" data-dock-sound></button>
      <button type="button" class="li-icon-btn" data-dock-close aria-label="Close messages">&#10005;</button></span></header>
    <div class="li-dock-body"></div>`;
  body = panel.querySelector(".li-dock-body");
  document.body.append(panel, fab);
  document.documentElement.classList.add("li-has-chat");
  fab.addEventListener("click", () => (isOpen() ? closeChat() : openChat()));
  panel.querySelector("[data-dock-close]").addEventListener("click", () => closeChat());
  const sound = panel.querySelector("[data-dock-sound]");
  const drawSound = () => {
    const on = soundOn();
    sound.textContent = on ? "🔔" : "🔕";
    sound.setAttribute("aria-pressed", String(on));
    sound.setAttribute("aria-label", on ? "Message sound on (turn off)" : "Message sound off (turn on)");
    sound.title = on ? "Message sound: on" : "Message sound: off";
  };
  sound.addEventListener("click", () => { setSoundOn(!soundOn()); drawSound(); if (soundOn()) chime(); });
  drawSound();
  document.addEventListener("keydown", (e) => {
    // Esc closes the chat unless a dialog (e.g. "Delete this message?") is on top.
    if (e.key === "Escape" && isOpen() && !document.getElementById("li-modal")) closeChat();
  });
  updateChatBadge();
}

export function openChat() {
  if (!panel) return;
  panel.hidden = false;
  fab.setAttribute("aria-expanded", "true");
  fab.setAttribute("aria-label", "Close messages");
  document.documentElement.classList.add("li-chat-open");
  if (!drawn) { renderMessages(body, { dock: true }); drawn = true; } else resumeMessages();
  (body.querySelector(".li-msgs-convo.on") || body.querySelector("button, textarea"))?.focus({ preventScroll: true });
  updateChatBadge();
}

export function closeChat() {
  if (!isOpen()) return;
  panel.hidden = true;
  fab.setAttribute("aria-expanded", "false");
  document.documentElement.classList.remove("li-chat-open");
  updateChatBadge();
  fab.focus({ preventScroll: true });
}

/** The unread count on the button (called whenever messages change). */
export function updateChatBadge() {
  if (!fab) return;
  const n = unreadTotal();
  const dot = fab.querySelector(".li-nav-dot");
  dot.hidden = !n;
  dot.textContent = n > 99 ? "99+" : String(n);
  if (!isOpen()) fab.setAttribute("aria-label", n ? `Messages, ${n} unread` : "Messages");
}
