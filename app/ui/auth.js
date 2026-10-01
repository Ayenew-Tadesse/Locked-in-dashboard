// Sign-in screen (Supabase Auth). Styled like the original password gate.
import { esc } from "./dom.js";
import { greetingOptions } from "../core/people.js";

const MODES = {
  signin: { title: "Sign in", button: "Sign in", password: true },
  signup: { title: "Create your account", button: "Create account", password: true, name: true },
  magic: { title: "Email me a sign-in link", button: "Send link" },
  reset: { title: "Reset your password", button: "Send reset link" },
  update: { title: "Choose a new password", button: "Save password", password: true, noEmail: true },
  request: { title: "Ask the team owner for access", button: "Request access", request: true },
};

export function showAuth(store, { mode = "signin", message = "", prefill = {} } = {}) {
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
      ${m.name ? `<input type="text" name="name" autocomplete="name" placeholder="Your name" aria-label="Your name" maxlength="120" required>
        <label class="li-auth-greet">Greet me as <select name="greeting" aria-label="Greet me as"><option value="">Choose…</option>${greetingOptions("")}</select></label>` : ""}
      ${m.request ? `<p class="li-auth-note">Sign-up is by invitation. Leave your name and email and the team owner will be notified; once they approve, create your account with this email.</p>
        <input type="text" name="name" autocomplete="name" placeholder="Your name" aria-label="Your name" maxlength="80" value="${esc(prefill.name || "")}">` : ""}
      ${m.noEmail ? "" : `<input type="email" name="email" autocomplete="email" placeholder="Email" aria-label="Email" required value="${esc(prefill.email || "")}">`}
      ${m.request ? `<textarea name="note" rows="3" maxlength="500" placeholder="A short note (optional): who you are, which project" aria-label="Note for the team owner"></textarea>` : ""}
      ${m.password ? `<input type="password" name="password" autocomplete="${mode === "signin" ? "current-password" : "new-password"}" placeholder="Password${mode === "signin" ? "" : " (8+ characters)"}" aria-label="Password" required minlength="${mode === "signin" ? 1 : 8}">` : ""}
      <p class="gate-error" role="alert" ${message ? "" : "hidden"}>${esc(message)}</p>
      <p class="li-auth-ok" role="status" hidden></p>
      <button type="button" class="li-auth-request" data-request hidden>Request access</button>
      <button type="submit">${esc(m.button)}</button>
      <div class="li-auth-links">
        ${mode !== "signin" ? `<button type="button" data-mode="signin">Sign in with password</button>` : ""}
        ${mode !== "signup" ? `<button type="button" data-mode="signup">Create an account</button>` : ""}
        ${mode !== "magic" && mode !== "update" ? `<button type="button" data-mode="magic">Email me a link</button>` : ""}
        ${mode === "signin" ? `<button type="button" data-mode="reset">Forgot password?</button>` : ""}
        ${mode === "signin" || mode === "signup" ? `<button type="button" data-mode="request">Not invited? Request access</button>` : ""}
      </div>
    </form>`;
  const form = el.querySelector("form");
  const err = el.querySelector(".gate-error"), ok = el.querySelector(".li-auth-ok");
  const typed = () => ({ email: form.elements.email?.value.trim() || "", name: form.elements.name?.value.trim() || "" });
  el.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => showAuth(store, { mode: b.dataset.mode, prefill: typed() })));
  el.querySelector("[data-request]").addEventListener("click", () => showAuth(store, { mode: "request", prefill: typed() }));
  (prefill.email && m.request ? form.elements.note : form.querySelector("input"))?.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true; ok.hidden = true;
    const f = form.elements, btn = form.querySelector("button[type=submit]");
    const email = f.email?.value.trim();
    if (!m.noEmail && !/^\S+@\S+\.\S+$/.test(email || "")) { err.textContent = "Enter a valid email address."; err.hidden = false; return; }
    if (m.name && !f.name.value.trim()) { err.textContent = "Enter your name, so your team sees it instead of your email."; err.hidden = false; return; }
    if (m.name && !f.greeting.value) { err.textContent = "Choose how you'd like to be greeted."; err.hidden = false; return; }
    if (m.password && mode !== "signin" && f.password.value.length < 8) { err.textContent = "Use at least 8 characters."; err.hidden = false; return; }
    btn.disabled = true;
    try {
      if (mode === "signin") await store.auth.signIn(email, f.password.value);
      else if (mode === "signup") {
        const r = await store.auth.signUp(email, f.password.value, f.name.value.trim(), f.greeting.value);
        if (r.needsConfirmation) { ok.textContent = "Check your email to confirm your account, then sign in."; ok.hidden = false; }
      } else if (mode === "magic") { await store.auth.magicLink(email); ok.textContent = "Check your email for a sign-in link."; ok.hidden = false; }
      else if (mode === "reset") { await store.auth.resetPassword(email); ok.textContent = "Check your email for a reset link."; ok.hidden = false; }
      else if (mode === "update") { await store.auth.updatePassword(f.password.value); }
      else if (mode === "request") {
        const r = await store.auth.requestAccess(email, f.name.value.trim(), f.note.value.trim());
        ok.textContent = r === "invited" ? "Good news: this email is already invited. Choose Create an account and sign up with it."
          : "Request sent. The team owner has been notified; once they approve, come back and create your account with this email.";
        ok.hidden = false;
        form.querySelector("button[type=submit]").hidden = true;
      }
    } catch (ex) {
      err.textContent = ex.message === "Invalid login credentials" ? "That email and password don't match."
        : /invitation only|Database error saving new user/i.test(ex.message) ? "This email hasn't been invited yet. Request access and the team owner will be notified."
        : ex.message;
      err.hidden = false;
      el.querySelector("[data-request]").hidden = mode !== "signup" || !/invited yet/.test(err.textContent);
    } finally { btn.disabled = false; }
  });
}

export function hideAuth() {
  document.getElementById("li-auth")?.remove();
  document.documentElement.classList.remove("li-authing");
}
