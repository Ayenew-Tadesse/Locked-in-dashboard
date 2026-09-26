// Sign-in screen (Supabase Auth). Styled like the original password gate.
import { esc } from "./dom.js";

const MODES = {
  signin: { title: "Sign in", button: "Sign in", password: true },
  signup: { title: "Create your account", button: "Create account", password: true, name: true },
  magic: { title: "Email me a sign-in link", button: "Send link" },
  reset: { title: "Reset your password", button: "Send reset link" },
  update: { title: "Choose a new password", button: "Save password", password: true, noEmail: true },
};

export function showAuth(store, { mode = "signin", message = "" } = {}) {
  let el = document.getElementById("li-auth");
  if (!el) {
    el = document.createElement("div");
    el.id = "li-auth";
    el.className = "gate li-auth";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "li-auth-title");
    document.body.appendChild(el);
  }
  document.documentElement.classList.add("li-authing");
  const m = MODES[mode];
  el.innerHTML = `
    <form class="gate-card" autocomplete="on" novalidate>
      <span class="gate-lock" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>
      <h2 class="gate-title" id="li-auth-title">Locked in</h2>
      <p class="gate-sub">${esc(m.title)}</p>
      ${m.name ? `<input type="text" name="name" autocomplete="name" placeholder="Your name" aria-label="Your name" maxlength="120">` : ""}
      ${m.noEmail ? "" : `<input type="email" name="email" autocomplete="email" placeholder="Email" aria-label="Email" required>`}
      ${m.password ? `<input type="password" name="password" autocomplete="${mode === "signin" ? "current-password" : "new-password"}" placeholder="Password${mode === "signin" ? "" : " (8+ characters)"}" aria-label="Password" required minlength="${mode === "signin" ? 1 : 8}">` : ""}
      <p class="gate-error" role="alert" ${message ? "" : "hidden"}>${esc(message)}</p>
      <p class="li-auth-ok" role="status" hidden></p>
      <button type="submit">${esc(m.button)}</button>
      <div class="li-auth-links">
        ${mode !== "signin" ? `<button type="button" data-mode="signin">Sign in with password</button>` : ""}
        ${mode !== "signup" ? `<button type="button" data-mode="signup">Create an account</button>` : ""}
        ${mode !== "magic" && mode !== "update" ? `<button type="button" data-mode="magic">Email me a link</button>` : ""}
        ${mode === "signin" ? `<button type="button" data-mode="reset">Forgot password?</button>` : ""}
      </div>
    </form>`;
  const form = el.querySelector("form");
  const err = el.querySelector(".gate-error"), ok = el.querySelector(".li-auth-ok");
  el.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => showAuth(store, { mode: b.dataset.mode })));
  setTimeout(() => form.querySelector("input")?.focus(), 30);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true; ok.hidden = true;
    const f = form.elements, btn = form.querySelector("button[type=submit]");
    const email = f.email?.value.trim();
    if (!m.noEmail && !/^\S+@\S+\.\S+$/.test(email || "")) { err.textContent = "Enter a valid email address."; err.hidden = false; return; }
    if (m.password && mode !== "signin" && f.password.value.length < 8) { err.textContent = "Use at least 8 characters."; err.hidden = false; return; }
    btn.disabled = true;
    try {
      if (mode === "signin") await store.auth.signIn(email, f.password.value);
      else if (mode === "signup") {
        const r = await store.auth.signUp(email, f.password.value, f.name.value.trim());
        if (r.needsConfirmation) { ok.textContent = "Check your email to confirm your account, then sign in."; ok.hidden = false; }
      } else if (mode === "magic") { await store.auth.magicLink(email); ok.textContent = "Check your email for a sign-in link."; ok.hidden = false; }
      else if (mode === "reset") { await store.auth.resetPassword(email); ok.textContent = "Check your email for a reset link."; ok.hidden = false; }
      else if (mode === "update") { await store.auth.updatePassword(f.password.value); }
    } catch (ex) {
      err.textContent = ex.message === "Invalid login credentials" ? "That email and password don't match." : ex.message;
      err.hidden = false;
    } finally { btn.disabled = false; }
  });
}

export function hideAuth() {
  document.getElementById("li-auth")?.remove();
  document.documentElement.classList.remove("li-authing");
}
