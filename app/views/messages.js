// Messages: the team chat, in the floating chat window (ui/chat-dock.js).
// Conversations (the Team group chat, then each person) come first; one opens
// with Back. New messages arrive live; the chat button shows your unread
// count. Which messages you've seen is remembered per device.
import { state, sendMessage, deleteMessage, receiveMessage, forgetMessage, memberName, can } from "../state.js";
import { esc, confirmDialog, showToast } from "../ui/dom.js";
import { formatDay } from "../core/dates.js";

const READ_KEY = "li_chat_read";
let convo = "group";        // the open conversation: "group" or a person's user id
let phoneThread = false;    // narrow: showing a conversation (not the list)
let dock = false;           // drawn in the chat window: always one column
let stopLive = null, host = null, badgeChanged = () => {};

/** Is there a team chat? (a team and the messages table) */
export const messagesAvailable = () => !!state.team && Array.isArray(state.messages);
const others = () => state.members.filter((m) => m.user_id !== state.me);
const keys = () => ["group", ...others().map((m) => m.user_id)];

function lastRead() { try { return JSON.parse(localStorage.getItem(READ_KEY) || "{}"); } catch { return {}; } }
function markRead(key) {
  const list = messagesIn(key);
  if (!list.length) return;
  const read = lastRead();
  read[key] = list.reduce((max, m) => (m.created_at > max ? m.created_at : max), read[key] || "");
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
/** Unread messages across your conversations (the Messages tab's badge). */
export function unreadTotal() {
  if (!messagesAvailable()) return 0;
  return keys().reduce((s, k) => s + unread(k), 0);
}
const viewing = () => !!host && document.contains(host) && !host.closest("[hidden]");

/** Live updates (once): new and deleted messages; the badge and an open page follow. */
export function startMessages(onBadge) {
  badgeChanged = onBadge || badgeChanged;
  if (stopLive || !messagesAvailable()) return;
  stopLive = state.store.subscribeMessages?.(state.team.id, { onInsert: receiveMessage, onDelete: forgetMessage }) || (() => {});
  window.addEventListener("li:messages", () => {
    if (viewing() && (!isPhone() || phoneThread)) markRead(convo);
    if (viewing()) paint();
    badgeChanged();
  });
}
const isPhone = () => dock || matchMedia("(max-width: 699px)").matches;

export function renderMessages(el, opts = {}) {
  host = el;
  dock = !!opts.dock;
  const head = dock ? "" : `<header class="li-view-head"><div><span class="card-label">Messages</span><h2 class="li-h2">Messages</h2></div></header>`;
  if (!messagesAvailable()) {
    el.innerHTML = `${head}
      <section class="li-card"><p class="li-empty">${state.team ? "Messages need a small database update: run the team chat SQL (20261004000000_team_chat.sql) in Supabase." : "Messages are for teams."}</p></section>`;
    return;
  }
  if (convo !== "group" && !others().some((m) => m.user_id === convo)) convo = "group";
  el.innerHTML = `
    ${head}
    <section class="li-card li-msgs${phoneThread ? " thread-open" : ""}" aria-label="Messages">
      <nav class="li-msgs-list" aria-label="Conversations"></nav>
      <div class="li-msgs-thread">
        <div class="li-msgs-head"><button type="button" class="li-btn small li-msgs-back" aria-label="Back to conversations">&#8249; Back</button><b class="li-msgs-title"></b></div>
        <ol class="li-chat-log" aria-live="polite"></ol>
        <form class="li-chat-form" autocomplete="off">
          <textarea name="body" rows="1" maxlength="2000" aria-label="Message" required></textarea>
          <button type="submit" class="li-btn primary small">Send</button>
        </form>
      </div>
    </section>
    ${others().length ? "" : `<p class="li-sub li-msgs-note">No one to message yet: <a class="li-link" href="#/team">invite someone from the Team page</a>.</p>`}`;
  wire(el);
  if (!isPhone() || phoneThread) markRead(convo);
  paint();
  badgeChanged();
}

/** The chat window opened again: catch up on what arrived while it was closed (keeps what you typed). */
export function resumeMessages() {
  if (!viewing()) return;
  if (!isPhone() || phoneThread) markRead(convo);
  paint();
  badgeChanged();
}

function open(key) {
  convo = key;
  phoneThread = true;
  host.querySelector(".li-msgs").classList.add("thread-open");
  markRead(convo);
  paint();
  badgeChanged();
  host.querySelector("textarea").focus({ preventScroll: true });
}

function wire(el) {
  el.querySelector(".li-msgs-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-convo]");
    if (b) open(b.dataset.convo);
  });
  el.querySelector(".li-msgs-back").addEventListener("click", () => {
    phoneThread = false;
    el.querySelector(".li-msgs").classList.remove("thread-open");
    paint();
  });
  el.querySelector(".li-chat-log").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-delete-msg]");
    if (!b) return;
    if (await confirmDialog("Delete this message?")) await deleteMessage(b.dataset.deleteMsg).catch(() => {});
  });
  const form = el.querySelector(".li-chat-form"), box = form.elements.body;
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  box.addEventListener("input", () => { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 140) + "px"; });
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
const label = (k) => (k === "group" ? "Team" : memberName(k));

/** Draw the conversation list and the open conversation (the message box keeps what you've typed). */
function paint() {
  if (!viewing()) return;
  const list = host.querySelector(".li-msgs-list");
  list.innerHTML = keys().map((k) => {
    const last = messagesIn(k).at(-1);
    const n = k === convo && (!isPhone() || phoneThread) ? 0 : unread(k);
    return `<button type="button" class="li-msgs-convo${k === convo ? " on" : ""}" data-convo="${esc(k)}" aria-current="${k === convo}">
      <span class="li-avatar" aria-hidden="true">${k === "group" ? "#" : esc(initials(memberName(k)))}</span>
      <span class="li-msgs-who"><b>${esc(label(k))}</b><small>${last ? esc((last.sender_id === state.me ? "You: " : k === "group" ? memberName(last.sender_id) + ": " : "") + last.body) : k === "group" ? "The whole team" : "No messages yet"}</small></span>
      ${n ? `<span class="li-nav-dot">${n > 99 ? "99+" : n}</span>` : ""}
    </button>`;
  }).join("");
  host.querySelector(".li-msgs-title").textContent = convo === "group" ? "Team · everyone" : memberName(convo);
  const msgs = messagesIn(convo);
  let lastDay = null;
  const log = host.querySelector(".li-chat-log");
  log.innerHTML = msgs.length ? msgs.map((m) => {
    const mine = m.sender_id === state.me, d = dayKey(m.created_at);
    const sep = d !== lastDay ? `<li class="li-chat-day">${esc(d === state.today ? "Today" : formatDay(d, { weekday: "short", month: "short", day: "numeric" }))}</li>` : "";
    lastDay = d;
    return `${sep}<li class="li-chat-msg${mine ? " mine" : ""}">
      ${!mine && convo === "group" ? `<span class="li-chat-from">${esc(memberName(m.sender_id))}</span>` : ""}
      <span class="li-chat-body">${esc(m.body)}</span>
      <span class="li-chat-meta">${esc(time(m.created_at))}${mine || (convo === "group" && can("moderate_chat")) ? ` <button type="button" class="li-chat-del" data-delete-msg="${esc(m.id)}" aria-label="Delete message" title="Delete">✕</button>` : ""}</span>
    </li>`;
  }).join("") : `<li class="li-chat-empty">${convo === "group" ? "No messages yet. Say hello to the team." : `No messages with ${esc(memberName(convo))} yet.`}</li>`;
  log.scrollTop = log.scrollHeight;
  host.querySelector("textarea").placeholder = convo === "group" ? "Message the team…" : `Message ${memberName(convo)}…`;
}

function initials(name) {
  return String(name || "?").split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

/** For tests and sign-out: stop live updates. */
export function stopMessages() { stopLive?.(); stopLive = null; }
