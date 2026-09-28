// Team chat: a bar pinned to the bottom of the screen that pulls up into a
// tray (tap it, or drag it up; drag down or Esc to close). "Group" is the
// whole team; each person is a one-to-one chat. New messages arrive live.
// Which messages you've seen is remembered per device.
import { state, sendMessage, deleteMessage, receiveMessage, forgetMessage, memberName } from "../state.js";
import { esc, confirmDialog, showToast } from "./dom.js";
import { formatDay } from "../core/dates.js";

let root, convo = "group", stopLive = null;
const READ_KEY = "li_chat_read";

const available = () => Array.isArray(state.messages) && !!state.team && state.members.length > 1;
const isOpen = () => root?.dataset.open === "true";
const others = () => state.members.filter((m) => m.user_id !== state.me);

function lastRead() { try { return JSON.parse(localStorage.getItem(READ_KEY) || "{}"); } catch { return {}; } }
function markRead(key) {
  const list = messagesIn(key);
  if (!list.length) return;
  const read = lastRead();
  read[key] = list.at(-1).created_at;
  try { localStorage.setItem(READ_KEY, JSON.stringify(read)); } catch { /* per-device convenience only */ }
}

/** Messages of a conversation: "group", or a person's user id (your one-to-one chat). */
function messagesIn(key) {
  const all = state.messages || [];
  if (key === "group") return all.filter((m) => !m.recipient_id);
  return all.filter((m) => (m.sender_id === state.me && m.recipient_id === key) || (m.sender_id === key && m.recipient_id === state.me));
}
function unread(key) {
  const since = lastRead()[key] || "";
  return messagesIn(key).filter((m) => m.sender_id !== state.me && m.created_at > since).length;
}

/** Adds the chat to the page (once) and starts live updates. */
export function setupChat() {
  if (!available() || root) return;
  root = document.createElement("div");
  root.id = "li-chat";
  root.className = "li-chat";
  root.dataset.open = "false";
  root.innerHTML = `
    <button type="button" class="li-chat-handle" aria-expanded="false" aria-controls="li-chat-panel">
      <span class="li-chat-grip" aria-hidden="true"></span>
      <span class="li-chat-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>Team chat</span>
      <span class="li-chat-unread" hidden></span>
    </button>
    <section class="li-chat-panel" id="li-chat-panel" aria-label="Team chat" hidden>
      <div class="li-chat-convos" role="tablist" aria-label="Conversations"></div>
      <ol class="li-chat-log" aria-live="polite"></ol>
      <form class="li-chat-form" autocomplete="off">
        <textarea name="body" rows="1" maxlength="2000" aria-label="Message" required></textarea>
        <button type="submit" class="li-btn primary small">Send</button>
      </form>
    </section>`;
  document.body.appendChild(root);
  document.documentElement.classList.add("li-has-chat");
  wire();
  paint();
  stopLive = state.store.subscribeMessages?.(state.team.id, { onInsert: receiveMessage, onDelete: forgetMessage }) || null;
  window.addEventListener("li:messages", () => { if (isOpen()) markRead(convo); paint(); });
}

export function openChat(key) {
  if (!root) return;
  if (key) convo = key;
  root.dataset.open = "true";
  root.querySelector(".li-chat-handle").setAttribute("aria-expanded", "true");
  root.querySelector(".li-chat-panel").hidden = false;
  markRead(convo);
  paint();
  root.querySelector("textarea").focus({ preventScroll: true });
}
export function closeChat() {
  if (!root || !isOpen()) return;
  root.dataset.open = "false";
  root.querySelector(".li-chat-handle").setAttribute("aria-expanded", "false");
  root.querySelector(".li-chat-panel").hidden = true;
  paint();
}

function wire() {
  const handle = root.querySelector(".li-chat-handle");
  // Drag the bar up to open, down to close; a plain tap toggles.
  let startY = null, dragged = false;
  handle.addEventListener("pointerdown", (e) => { startY = e.clientY; dragged = false; });
  window.addEventListener("pointermove", (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 30 && !dragged) { dragged = true; if (dy < 0) openChat(); else closeChat(); }
  });
  window.addEventListener("pointerup", () => { startY = null; });
  handle.addEventListener("click", () => { if (dragged) { dragged = false; return; } isOpen() ? closeChat() : openChat(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen() && !document.getElementById("li-modal")) closeChat(); });

  root.querySelector(".li-chat-convos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-convo]");
    if (!b) return;
    convo = b.dataset.convo;
    markRead(convo);
    paint();
    root.querySelector("textarea").focus({ preventScroll: true });
  });
  root.querySelector(".li-chat-log").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-delete-msg]");
    if (!b) return;
    if (await confirmDialog("Delete this message?")) await deleteMessage(b.dataset.deleteMsg).catch(() => {});
  });
  const form = root.querySelector(".li-chat-form"), box = form.elements.body;
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  box.addEventListener("input", () => { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 120) + "px"; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = box.value.trim();
    if (!text) return;
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      await sendMessage(text, convo === "group" ? null : convo);
      box.value = "";
      box.style.height = "auto";
      markRead(convo);
      paint();
    } catch (err) { showToast(err.message, "error"); }
    finally { btn.disabled = false; box.focus({ preventScroll: true }); }
  });
}

function time(iso) { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function dayKey(iso) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function paint() {
  if (!root) return;
  if (convo !== "group" && !others().some((m) => m.user_id === convo)) convo = "group";
  // Unread total on the bar.
  const keys = ["group", ...others().map((m) => m.user_id)];
  const total = keys.reduce((s, k) => s + unread(k), 0);
  const badge = root.querySelector(".li-chat-unread");
  badge.hidden = !total || isOpen();
  badge.textContent = total > 99 ? "99+" : String(total);
  if (!isOpen()) return;
  // Conversations: Group, then each person.
  root.querySelector(".li-chat-convos").innerHTML = keys.map((k) => {
    const n = k === convo ? 0 : unread(k);
    const label = k === "group" ? "Group" : memberName(k);
    return `<button type="button" role="tab" class="li-chat-convo${k === convo ? " on" : ""}" data-convo="${esc(k)}" aria-selected="${k === convo}">${esc(label)}${n ? ` <span class="li-nav-dot">${n}</span>` : ""}</button>`;
  }).join("");
  // Messages, with a line for each new day.
  const list = messagesIn(convo);
  let lastDay = null;
  const log = root.querySelector(".li-chat-log");
  log.innerHTML = list.length ? list.map((m) => {
    const mine = m.sender_id === state.me, d = dayKey(m.created_at);
    const sep = d !== lastDay ? `<li class="li-chat-day">${esc(d === state.today ? "Today" : formatDay(d, { weekday: "short", month: "short", day: "numeric" }))}</li>` : "";
    lastDay = d;
    return `${sep}<li class="li-chat-msg${mine ? " mine" : ""}">
      ${!mine && convo === "group" ? `<span class="li-chat-from">${esc(memberName(m.sender_id))}</span>` : ""}
      <span class="li-chat-body">${esc(m.body)}</span>
      <span class="li-chat-meta">${esc(time(m.created_at))}${mine ? ` <button type="button" class="li-chat-del" data-delete-msg="${esc(m.id)}" aria-label="Delete message" title="Delete">✕</button>` : ""}</span>
    </li>`;
  }).join("") : `<li class="li-chat-empty">${convo === "group" ? "No messages yet. Say hello to the team." : `No messages with ${esc(memberName(convo))} yet.`}</li>`;
  log.scrollTop = log.scrollHeight;
  root.querySelector("textarea").placeholder = convo === "group" ? "Message the team…" : `Message ${memberName(convo)}…`;
}

/** For tests and sign-out: stop live updates and remove the chat. */
export function teardownChat() { stopLive?.(); stopLive = null; root?.remove(); root = null; document.documentElement.classList.remove("li-has-chat"); }
