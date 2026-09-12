# Auth Flow & Production-Readiness Audit

**Date:** 2026-09-11
**Scope:** Registration, login, password reset, account settings, email infrastructure, input/injection safety, and readiness to serve ~1,000,000 users/month.
**Method:** Direct code inspection (file:line citations throughout — nothing in this report is assumed or guessed).

---

## 1. Bottom line, up front

Most of what you described as "already documented" is **partially built and partially not built at all**. Specifically:

| Claim | Reality |
|---|---|
| Register requires the right fields | ✅ Real — but only email + password. No name field exists anywhere in the database. |
| Register sends a verification email | ✅ Real logic (token-link) — ❌ but the email itself only ever prints to the server console. No real email is ever sent to anyone. |
| Reset password sends OTP or link | ✅ Real logic (token-link, not OTP) — ❌ same console-only problem. No real email is ever sent. |
| A pre-made, reusable, logo-branded email template exists | ❌ Does not exist. There is no HTML email of any kind anywhere in the codebase. Every "email" is a plain-text line written to the server's console log. |
| Settings page lets you update your profile from the dashboard | ❌ Does not work at all. It is a cosmetic mockup. No button on that page does anything. |
| Login/register have live validation | ✅ Real, server-side, non-negotiable (client-side is a courtesy, not the actual gate) |
| Protected against injecting JS code (XSS) | ✅ Real — no unsafe rendering paths found in the auth area |
| Protected against SQL injection | ✅ Real — the ORM parameterizes everything; no unsafe raw SQL anywhere in the auth code |
| Can handle 1,000,000 users/month | ❌ No. The database connection pool is explicitly sized and documented for ~1,000 users, not 1,000,000. Several other scale-blocking gaps exist (below). |

The good news: the parts that exist are built carefully and correctly (real password hashing, real rate limiting, real token-based flows, no injection holes). The bad news: two entire pieces that you specifically asked about — **real email delivery** and **the profile/settings page** — are not implemented at all, not "half-working." They are placeholders.

---

## 2. Registration — detailed findings

**What's real:**
- The only fields the server accepts are `email` and `password`. Password must be 12–200 characters; there is no complexity rule (no forced uppercase/number/symbol).
- This is enforced on the server, which is what actually matters — the frontend's own length check is a convenience, not the real gate. A request that skips the frontend entirely still gets rejected correctly.
- On successful registration, the server creates a real, single-use, cryptographically random verification token, hashes it before storing it (so a database leak wouldn't hand out working tokens), gives it a 24-hour expiry, and correctly marks it used exactly once when the link is clicked.
- The verification link mechanism itself (not the email delivery) is solid and correctly built.

**What's missing or wrong:**
- **The signup form on the website shows a "Name" field, but there is nowhere in the database for a name to live.** Whatever a new user types into that field is silently thrown away — it is never sent to the server at all. This is a real, user-facing lie: the form implies the name is being collected, but it never was and currently cannot be.
- **No real email is ever sent, for any reason, to any user, anywhere in this product.** The "mailer" is a single stub whose entire implementation is: print a line to the server's own terminal window containing the raw verification link or reset link. If that server isn't a machine you personally have open in front of you, no human being will ever see that link. This applies to every kind of email the product is supposed to send: the verification link, the password-reset link, the "you passed the readiness check" congratulations, plan-renewal warnings, and data-retention warnings — all of them, every single one, only ever reach a terminal log line.
- There is a placeholder in the environment configuration for a real email provider (Resend), but nothing in the code actually uses it. It's an unused, empty slot.

---

## 3. Login — detailed findings

**What's real and working correctly:**
- Passwords are hashed with a strong, modern algorithm (bcrypt) at an industry-acceptable cost — not reversible, not fast enough for cheap brute-forcing.
- Login attempts are rate-limited per client, backed by Redis (meaning the limit is enforced correctly even if the API runs on more than one server at once — a naive in-memory limiter would let an attacker get more attempts than intended simply by hitting different servers). Ten attempts per 15 minutes on the login/register/password-reset endpoints specifically.
- The server deliberately takes the same amount of time whether the email exists or not, and returns the same generic error either way, so an attacker can't use response timing or error wording to figure out which emails are registered.

No real problems found here.

---

## 4. Password reset — detailed findings

**What's real:**
- This is a proper reset-link flow, not a one-time code. Requesting a reset invalidates any earlier still-pending reset request for that account, so an old, forgotten link can't be replayed later. The reset link expires after one hour (shorter than the 24-hour verification link, correctly, since a reset link is more security-sensitive). Using it correctly invalidates all of that user's other logged-in sessions, which is the right behavior — someone who just reset their password because their account was compromised should not still be logged in from an attacker's device.
- The website pages for "forgot password" and "reset password" are real and wired to the real backend.

**What's missing:** identical problem to registration — the reset email is console-log only. Nobody outside the server operator will ever receive it in real use.

---

## 5. Account settings / dashboard profile — detailed findings

**This is the most serious gap in the whole audit, because it is presented to the user as if it works.**

- Every field on the Settings screen — name, email, "change password," "delete my account," disconnect GitHub, revoke a session — is decorative. Not one of these controls calls the server. Clicking "Save changes" does nothing at all; there is no code behind that button.
- The values shown (name "Khalid Ahmed," a sample email, "Pro plan," a list of sessions) are not the real signed-in user's data — they are fixed, fake placeholder text that is the same for every account, regardless of who is logged in.
- There is no way, anywhere in the product today, for a real user to change their own email or password from the website. The only password-change path that exists at all is the full forgot-password-email flow — and as covered above, that email doesn't actually get delivered to anyone yet either.
- Account deletion does exist and works correctly on the server side (it's used and tested), but the "Delete my account" button on the page is not connected to it — so in practice a user cannot delete their own account through the website today, only via a direct, technical API request.
- There is genuinely no way today for an account to change the name shown for it, because the concept of a "name" doesn't exist in the database at all yet — this needs a real decision and a real database change, not just wiring up a button.

---

## 6. Security review: XSS and SQL injection

**Good news across the board here — this part of the product is done properly.**

- Every piece of data coming in from a user, on every auth-related request, is checked against a strict schema before it ever touches the database (right type, right length, right shape — an email must look like an email, a password must be the right length, and so on). Malformed or unexpected data is rejected before it gets anywhere near storage.
- The database layer used throughout the product automatically protects against SQL injection by design — user input is never pasted directly into a database command as raw text. A focused search of the entire codebase for the specific unsafe pattern that *would* allow SQL injection (building a raw SQL string by hand instead of using the safe parameterized method) turned up zero instances anywhere related to authentication, and the handful of raw-SQL usages that do exist elsewhere in the product (credits, admin tools) all use the safe, parameterized form correctly.
- On the "doesn't accept JS code" question: the website's rendering technology (React) automatically treats anything a user typed as plain text, never as code to execute, everywhere a user's own data (like their email address) is shown back to them. There is exactly one place in the entire frontend that injects raw markup directly, and it's a fixed piece of the website's own dark-mode-switching logic — it has nothing to do with user input and cannot be influenced by what any user types.

No changes needed here for what currently exists. The main risk going forward is discipline: this protection is automatic today because nobody has manually bypassed it — any future feature must keep using the same safe patterns rather than introducing a shortcut.

---

## 7. Email infrastructure — the reusable branded template you asked about

**Does not exist in any form.** Today:
- There is no real connection to any email-sending service at all (no Resend, no SendGrid, no Amazon SES, nothing) — only an empty placeholder for one provider's API key that nothing reads.
- There is no HTML email of any kind anywhere in the codebase — not a branded one, not a plain one. Every "email" the system thinks it sends is really just one line of plain text written to a server log.
- Because there's no real sending mechanism yet, there is naturally no shared, reusable template with your logo either — there's nothing to reuse a template *in*.

This needs to be built from nothing: a real connection to an email-sending service, one shared branded template (logo, consistent look) that every kind of email in the product (verification, password reset, billing receipts, renewal warnings, the "you're ready to ship" congratulations, and anything added later) can plug its own message into, so you only ever design the look once.

---

## 8. Can this handle 1,000,000 users a month?

**Not as currently configured, but the underlying architecture is not fundamentally wrong — several specific, known, already-documented limits need to be raised or filled in.** In order of how much they'd actually hurt first:

1. **The database connection allowance is explicitly set for a much smaller product.** The current limit is written into the code with a comment stating it was deliberately sized for roughly 1,000 users and about 60 people running an audit at the same time — nowhere close to a million users a month. It can be raised, and the code already leaves room to roughly double capacity without a redesign, but "double" is still far short of what a million users a month implies. A proper connection-pooling layer (a well-known piece of standard infrastructure for this exact problem) is planned for in the comments but not yet installed.

2. **There is no error-tracking or performance-monitoring service connected anywhere.** If something breaks in production at that scale, today the only way to find out is if someone happens to be watching a server's log file at the right moment. This is a real operational risk at any real scale, not just a million users — but it becomes a serious problem the moment paying customers are involved.

3. **The AI cost configuration for two of the three providers isn't filled in yet**, and the system is deliberately built to refuse to run for real in that state rather than risk billing surprises — meaning a real production launch is currently blocked by two unset numbers, not a code defect. Someone needs to decide and enter the real per-usage cost for those two providers before this product can go live at all, independent of the scale question.

4. **The screenshot/browser-automation piece of the product (used for visual and performance checks) can only run one instance at a time today; there's no built way yet to run several of them as an independent, scalable fleet.** At high volume this specific piece of work — not the rest of the product — would become a bottleneck first, since every other major piece (the web servers, the background job workers, the file storage) is already built to run as multiple copies behind a load balancer.

5. **The isolated "run untrusted code safely" component (used when an operator uploads a custom check) is currently a single running program on a single machine.** The way it's built would technically allow running several copies of it behind a load balancer, but nobody has actually set that up, tested it, or written instructions for doing so yet.

6. **Storage for reports and screenshots is already done the right way** (a proper cloud object store, not local disk on one server), which is one less thing to fix later.

7. **The system that automatically expires old accounts' data has one documented spot where it intentionally skips actually deleting the stored files** (it still correctly removes the database record, but the file itself can be left behind in storage) — a minor, already-acknowledged gap, not a scale blocker, but worth closing before relying on it at high volume for cost and compliance reasons.

**In plain terms:** nothing here requires starting over. The pieces that are hard to scale later (how the servers talk to each other, how work is split into replaceable workers, where files are stored) were already built the scalable way from day one. What's missing for a million users a month is mostly: raise a couple of intentionally-conservative limits, plug in the two missing pricing numbers, add a monitoring/alerting service so problems are caught automatically instead of by luck, and build out the one or two pieces (the browser-automation runner, and proving the sandboxed-code runner works with several copies at once) that were designed to be scalable but never actually tested at more than one copy running.

---

## 9. What "done" looks like — the real gap list, plainly

To honestly claim everything you described as working, these pieces need to be built (not fixed — built, since they don't exist yet):

1. **A real connection to an actual email-sending service**, replacing the console-log stub, for every email type the product already tries to send.
2. **One shared, branded HTML email template** (your logo, consistent styling) that every email type reuses, so the design is done once and every message just fills in its own text.
3. **A real "edit your profile" feature reachable from the Settings page** — meaning: decide whether a display name is wanted at all (it needs a new place to live in the database first, since it doesn't exist today), then build a real save action for it.
4. **A real, working "change your password while logged in" feature** on the Settings page (today the only password-change path is the emailed reset link, and even that link doesn't reach anyone yet per point 1).
5. **A real, working "change your email" feature**, including re-verifying the new address before it takes effect — this doesn't exist in any form today.
6. **Wiring the "Delete my account" button** on the Settings page to the account-deletion feature that already works correctly on the server but isn't connected to anything a user can click.
7. **Deciding and entering the real usage-based costs** for the two AI providers that currently have none, since the system is deliberately built to refuse to run without them.
8. **Adding an error-tracking/monitoring service** so failures in production are caught automatically rather than depending on someone watching a log file.
9. **Raising the database connection limit for real scale**, and adding the standard connection-pooling layer that's already anticipated in the code's own comments but not yet installed.
10. **Deciding how the browser-automation piece will run at higher volume** (today it only runs one at a time, with no built way to run several copies as an independent, scalable group).
11. **Actually testing the sandboxed-code runner with more than one copy running behind a load balancer** — the design allows for it, but nobody has proven it works yet.
12. **Closing the one known spot where expired data's stored file can be left behind** even though its database record was correctly removed.

Everything else this audit checked — the registration, login, and password-reset *logic* itself, the protection against injected code and SQL injection, the rate-limiting, and the overall shape of how the servers and background workers are built to scale — is genuinely done well and does not need to be redone.
