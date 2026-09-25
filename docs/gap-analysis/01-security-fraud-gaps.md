# 01 — Security, Fraud & Abuse Gap Analysis

> Scope: `plan.md` v2.0 + `docs/05-auth-rbac.md`, `docs/06-api-reference.md`, `docs/11-security.md`
> (cross-checked against `docs/08` §8.2/§8.5 and `docs/09` §9.3/§9.5 where auth/API/security defer).
> Method: attacker-first. Each gap: evidence (silent/weak section), concrete attack, specific fix.
> Severity: **P0** = launch-blocker, **P1** = fix in first month, **P2** = backlog.

**Counts: 6 x P0, 9 x P1, 4 x P2 = 19 gaps.**

---

## P0 — Launch blockers

### G-01 (P0) — Privileged roles use phone-OTP only; no MFA/step-up; 30-day sessions; unilateral refund + PIN powers
- **Evidence.** `plan.md` Sec 6 / `docs/05` Sec 5.3-5.4: EVERY role (`SUPER_ADMIN`, `CAMPUS_ADMIN`,
  `CONFIG_CHANGER`, `QUERY_RESOLVER`) logs in via the same `POST /auth/otp/verify` phone flow with
  the same 30-day sliding Redis session (`gb:session:{token}`). No MFA, no TOTP/hardware-key
  step-up, no per-role lifetime, no re-auth for sensitive actions in Sec 6, Sec 15, or docs/11.
  Yet Sec 5.4 grants `QUERY_RESOLVER` both `POST /support/orders/{id}/resolve-pin` (returns current
  plaintext PIN, docs/06 Sec 6.6) AND dispute refunds (docs/09 Sec 9.5); `CONFIG_CHANGER` moves
  `codMaxPaise`, fees, surge.
- **Attack.** SIM-swap (or steal/snoop the phone of) one campus support agent — helpdesk numbers
  are public and support staff are the most phishable. One OTP gives a 30-day resolver session:
  dump live PINs via `resolve-pin` for accomplice food theft, then issue refunds to accomplice UPI
  IDs for already-eaten orders. Each writes an `audit_logs` row (plan Sec 15.6) nobody reviews live,
  readable only by `SUPER_ADMIN` (docs/06 Sec 6.7). One phone = unlimited refunds + all live PINs.
- **Fix.** (1) TOTP in addition to OTP for all privileged roles at verify time (`totpCode` when
  role in privileged set). (2) Privileged sessions 12h absolute, no slide past 24h (per-role TTL
  on `gb:session:{token}`); customers keep 30d. (3) Step-up: `resolve-pin` and refunds over ~Rs 200
  require fresh OTP (<=5 min, `session.auth_time` check) plus maker-checker second approval
  (see G-04). Log `auth_time` + `mfa: totp` in session hash.
### G-02 (P0) — SMS pumping: `POST /auth/otp/request` is an unauthenticated money-dispenser; IP bucket falls to rotating IPs
- **Evidence.** docs/11 Sec 11.2: `otp:request` = 1/60s + 4/hour per phone, `otp:request:ip` =
  20/hour per IP. plan.md Sec 12.3 lists cooldown + hourly cap + IP bucket as the ENTIRE anti-abuse
  story. Silent on: CAPTCHA/bot check, number validity/geography, virtual/OTP-bot ranges, global
  daily SMS budget, spend alerting, progressive friction. Response must return <300ms (Sec 12.3) —
  frictionless by design.
- **Attack.** Attacker rents 10,000 plausible +91 numbers (SIM farm / virtual-number API fleet) plus
  a cheap residential-proxy pool. Each request is a distinct phone from a distinct IP: neither the
  per-phone cap (4/hr) nor per-IP cap (20/hr) ever trips. Each enqueues `sms-otp` -> Fast2SMS bulkV2
  at ~Rs 0.15-0.25. One night = tens of thousands of rupees wallet drain + DLT reputation damage.
  First signal: balance hits zero at lunch rush, when legitimate OTP + ORDER_ACCEPTED /
  OUT_FOR_DELIVERY SMS start failing. Bonus: same primitive SMS-bombs any victim (4 msgs/hr each,
  spread across victims — per-phone cap does not help).
- **Fix.** (1) Cloudflare Turnstile on `POST /auth/otp/request`, verified server-side before the
  cooldown check; fail closed. (2) Validate phone: E.164, India-only (+91, 10 digits, valid series)
  unless campus config enables international; reject invalid/high-risk ranges. (3) Global spend
  breaker: rolling `gb:abuse:sms:day:{yyyy-mm-dd}` + `gb:abuse:sms:hour:{...}` counters; breach ->
  degrade (CAPTCHA-strict, then 503 + Sentry `sms.budget_breaker`) + page on-call. Alert at
  50/80/100% of daily Fast2SMS budget. (4) Datacenter/ASN velocity rules + device-fingerprint bucket
  (`otp:request:fp`, 5/hr). (5) Cold numbers: >=3 sends + zero verifies in 24h (`gb:otp:cold:{phone}`)
  -> 24h send cool-down.

### G-03 (P0) — Delivery-PIN handoff is pure social-engineering surface: static 4-digit PIN, plaintext support disclosure, no attestation
- **Evidence.** plan.md Sec 10.6/10.8 + docs/11 Sec 11.3(1): completion = customer reads a static
  4-digit PIN (10,000 space, fixed for order lifetime) to whoever claims to collect; docs/06 Sec 6.6
  `resolve-pin` "returns current PIN; audited". plan.md Sec 15.5 redacts PIN from logs but says
  nothing about rotation/expiry, staff-UI masking, caller verification for PIN disclosure,
  recording WHICH staffer verified handoff, or proof-of-collection. Sec 15.6 audit list omits staff
### G-04 (P0) — Refund/dispute path is one human with no evidence bar, no limits, no dual control
- **Evidence.** docs/09 Sec 9.5: "QUERY_RESOLVER issues refund -> payments.status=REFUNDED +
  audit_logs entry". That one row is the ENTIRE dispute design: no evidence, no velocity limits, no
  amount thresholds, no second approval, no cooling-off, no fraud score. Customer self-cancel is
  correctly narrow (<=120s, PLACED only, docs/06 Sec 6.5) — pushing all refund fraud into the
  unbounded support path. docs/11 Sec 11.6 audits AFTER the fact; nothing PREVENTS.
- **Attack.** "Eat then weep": accomplice pair orders Rs 400 lunch, eats it, files "wrong item /
  cold / never arrived" via `POST /support/tickets`. One resolver — bribed (Rs 100 beats a stipend),
  engineered, or phished (G-01) — issues refund. Repeat 20x/day across Sybil accounts (G-06). No photo
  requirement, no per-user refund tripwire, no per-agent alert. Audit row exists; nobody watches.
- **Fix.** (1) Maker-checker: refunds > Rs 200 (campus-tunable) need second privileged approval
  (`POST /support/refunds/{id}/approve`, different actor; self-approval 403s). (2) Evidence gate:
  photo(s) + reason code + within N hours of DELIVERED; "never arrived" cross-checks PIN-handoff
  attribution (G-03), auto-reject when valid handoff exists. (3) Velocity guards
  `gb:abuse:refund:user:{id}` (>2/30d -> manual review + prepaid-only) and
  `gb:abuse:refund:agent:{id}` (>N/day -> page + freeze); Sentry on both. (4) Daily SUPER_ADMIN refund
  + PIN-override digest; `GET /admin/audit-logs` gains `action=REFUND_ISSUED&groupBy=actor`.

### G-05 (P0) — Staff deprovisioning does not revoke sessions; shared tablets make actions unattributable
- **Evidence.** docs/05 Sec 5.3: "Revocation = DEL gb:session:{token} (logout endpoint)". Logout is
  the ONLY revocation path named anywhere. No role/shop-removal hook, no staff-removal flow, no
  session inventory. Campus reality (one greasy tablet, daily turnover, shared credentials) meets a
  30-day sliding session: tablet holder IS the staff identity indefinitely. Sec 11.6 audits
  "privileged mutations" but staff order transitions (accept/reject/status/verify) are not listed —
  ex-employee abuse is anonymous.
- **Attack.** Fired counter worker knows the shared tablet PIN. Weeks later opens the still-valid
  session from own phone: harvest customer phones from `GET /shop/orders` (G-09), reject rush orders
  to drive traffic to a rival stall, or feed live PINs to a G-03 accomplice. Owner has no "log out all
### G-06 (P0) — Phone-number identity with no Sybil resistance: virtual numbers walk through every per-account control
- **Evidence.** plan Sec 6.1/15 + docs/11 Sec 11.3: the ACCOUNT is a verified phone, and every abuse
  control is per-account — `orders:place` 10/min per user, COD block after >=2 undelivered, OTP caps
  per phone. Nothing binds accounts to devices, attests integrity, caps accounts-per-device, screens
  virtual/OTP-bot ranges, or tiers new-account trust. TEST_OTP guard (docs/05 Sec 5.1) covers only the
  local bypass.
- **Attack.** 200 accounts via Indian virtual-number APIs (per-number cost fungible; OTP SMS
  subsidised by Go-Bite per G-02). Each has clean COD + refund ledgers and a fresh 10/min budget.
  Farm then: (a) no-show/COD-frauds shops at scale (order, never collect — shop eats COGS, G-10);
  (b) eat-then-refund cycles (G-04) under naive per-account thresholds; (c) floods rival shop with fake
  PLACED orders to trip `max_active_orders` auto-snooze (Sec 11.3(2)) and knock it offline at rush.
- **Fix.** (1) Device binding: fingerprint at verify; `accounts_per_device <= 3`
  (`gb:device:{fp}:accounts`), overflow to manual review. (2) Phone-reputation screen on request:
  virtual/OTP-bot ranges -> block or Turnstile + review; `gb:abuse:cold_numbers`. (3) New-account tier:
  <7d accounts get COD <=Rs 200 + 1 active COD order, N orders/day first week; graduate on clean
  history. (4) Daily cross-account clustering (device fp + ASN + time patterns) -> Sentry
  `fraud.sybil_cluster` + auto-restrict; cluster tag visible on tickets.

---

## P1 — Fix in the first month

### G-07 (P1) — Rate limits fall to rotating IPs: only 2 of 8 buckets are IP-keyed; reads fail open; no bot layer
- **Evidence.** docs/11 Sec 11.2: only `otp:request:ip` and `api:global` are IP-keyed; the valuable
  ones (`otp:verify` per-phone, `pin:verify` per-order, `orders:place`/`payments:refresh` per-user)
  assume one identity. No WAF/bot management, fingerprint/ASN rules, or CAPTCHA escalation anywhere.
  Fail mode: "read buckets fail open" — degrading Redis DISABLES read-path control.
- **Attack.** Residential-proxy pool rotates exit IP per request: `api:global` 100/min/IP never fires;
  per-phone/per-order buckets dodged by spreading attempts (OTP spray 1000 phones x 4 codes, PIN shots
  across accomplice orders, full menu scrape for a clone). During Redis brownout, read limits evaporate
  exactly when scrapers are cheapest.
- **Fix.** Fingerprint + ASN buckets beside IP (`otp:verify:fp`, `pin:verify:fp`, `orders:place:fp`);
  datacenter-ASN strict tier + residential watch tier; Turnstile escalation after 2x 429s; fail-closed
  on `otp:*`/`pin:*`/`payments:*` when Redis down; 429 `retryAfterSec` jitter (no pacing oracle). Edge
  bot-management tier (Cloudflare Pro+ managed rules) before campus 3.

### G-08 (P1) — Webhook HMAC-correct but incident-naive: missing event types, no rotation overlap, no sig-failure alerts
- **Evidence.** docs/09 Sec 9.3 handles only `payment.captured`/`payment.failed` (default-ignore);
  plan Sec 13.2-13.3 pins HMAC + idempotency + 5s. Silent on: `payment.authorized`
  (cards/netbanking authorize-then-capture), `refund.*`/`payment.refunded` (dashboard refunds never
  reconcile), dual-secret rotation overlap, source-range validation, replay window, sig-failure spike
  alerting, webhook-route rate limiting.
- **Attack.** Card-heavy lunch: authorizations land, captures lag; payments sit PENDING until the 5-min
  reconciler rescues them — food goes cold meanwhile. Finance issues a dashboard refund for a duplicate
  charge; no `refund.*` handler -> status never REFUNDED -> resolver issues it AGAIN (double refund).
  Attacker floods `POST /webhooks/razorpay` with garbage; cheap HMAC checks but log volume buries the
  real mismatch signal, which nobody alerts on.
- **Fix.** (1) Handle `payment.authorized` (hold, don't cancel) + `refund.processed/failed`,
  `payment.refunded` via same `markCaptured/markFailed/markRefunded`; reconcile polls refund status.
  (2) Dual-secret verify (`_CURRENT` + `_PREVIOUS`, 48h overlap). (3) Sentry `payment.webhook_sig_spike`
  (>N mismatches/5min) + per-IP bucket on webhook route + Razorpay source-range check (HMAC stays root
  of trust).

  staff devices" button — never built.
- **Fix.** (1) `session.auth_version` vs `users.auth_version`; `withApi` rejects stale. Any
  role/shop/campus change bumps version -> instant revocation. (2) `DELETE /shop/staff/{userId}/
  sessions` (SHOP_OWNER) + self `POST /auth/logout-all`; dashboard shows staff sessions with revoke.
  (3) Per-staff counter PIN (`POST /shop/staff/pin-login`, 12h session) so `verified_by_staff_id`
  (G-03) is real; ban generic "counter" accounts. (4) Audit staff transitions with actor_id + IP;
  alert off-hours activity.

  `verify-pin` events with actor identity.
- **Attack.** (A) Hostel-shout scam: at 1pm in a noisy lobby attacker calls "Go-Bite for B-204,
  confirm PIN for verification?" Rushed student reads the in-app PIN; attacker repeats it at the
  counter first, walks off with food. (B) Support pretexting: attacker with victim phone + order
  number (enumerable `GB-XXX-NNNNN`, plan Sec 10.2) calls support as "locked-out customer"; resolver
  tool returns the PIN, reads it out. No caller-verification procedure exists.
- **Fix.** (1) Single-view PIN UX (tracking screen only, `user-select:none`) + customer
  `POST /orders/{id}/rotate-pin` (invalidates old, 3/order limit) so a phished PIN dies instantly.
  (2) `resolve-pin` never returns PIN: issue one-time 5-min reset code to owner phone over SMS path;
  requester proves control of that phone; both sides write `audit_logs` with actor/IP/ticket.
  (3) Handoff attribution: `verify-pin` writes `verified_by_staff_id`, `verified_at`,
  `verification_channel` into `order_status_history`; receipt shows "handed over by {staff}". (4) Push/
  SMS on every `PIN_LOCKED` + on delivery ("GB-... delivered 13:04 counter 2 — wasn't you? Report in
  30 min").

