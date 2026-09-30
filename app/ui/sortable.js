// Drag to reorder a list by its grips (⠿): mouse or finger, the item moves
// as you drag and onChange() runs after you let go. Items are the list's
// children matching `item`; only a pointer that starts on `handle` drags, so
// inputs inside items keep working and a phone can still scroll the page.
export function sortable(list, { item, handle = "[data-sort-handle]", onChange }) {
  let drag = null;
  const items = () => [...list.children].filter((c) => c.matches(item));

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    drag.ghost.style.top = e.clientY - drag.dy + "px";
    // Where would it go? Before the first item whose middle is below the pointer.
    const others = items().filter((c) => c !== drag.el);
    const before = others.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (before) { if (drag.el.nextElementSibling !== before) list.insertBefore(drag.el, before); }
    else if (others.length && others[others.length - 1].nextElementSibling !== drag.el) others[others.length - 1].after(drag.el);
  }
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    d.ghost.remove();
    d.el.classList.remove("li-sort-dragging");
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    if (items().indexOf(d.el) !== d.from) onChange?.();
  }
  list.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(handle);
    const el = h && h.closest(item);
    if (!el || !list.contains(el) || e.button > 0) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add("li-sort-ghost");
    Object.assign(ghost.style, { width: r.width + "px", left: r.left + "px", top: r.top + "px" });
    document.body.appendChild(ghost);
    el.classList.add("li-sort-dragging");
    drag = { id: e.pointerId, el, ghost, dy: e.clientY - r.top, from: items().indexOf(el) };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  });
  // Keyboard: on a grip, arrow up/down moves the item.
  list.addEventListener("keydown", (e) => {
    const h = e.target.closest(handle);
    const el = h && h.closest(item);
    if (!el || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const sib = e.key === "ArrowUp" ? el.previousElementSibling : el.nextElementSibling;
    if (!sib || !sib.matches(item)) return;
    if (e.key === "ArrowUp") sib.before(el); else sib.after(el);
    h.focus();
    onChange?.();
  });
}
