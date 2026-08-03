# Yardhand — Platform Build Plan (Multi-tenant · Security · Billing · Durability)

> **Purpose.** This is the written plan for turning Yardhand from a single-business
> prototype into a **multi-tenant SaaS** that other rental businesses can safely pay
> for. It covers accounts, data isolation, security, backups, and billing, and states
> honestly what is real today vs. what each phase makes live.
>
> Companion docs: `PROJECT-NOTES.md` (what's built), `AGENTS.md` (framework rules).
> Related tasks: **#10** multi-tenant foundation · **#26** trial + subscription billing ·
> **#27** operator/platform dashboard · **#28** security & data protection ·
> **#29** backups & data durability.

---

## 0. Honest current state (read first)

Yardhand today is a **single shared workspace** — great for running *one* business
(yours) and for demoing the vision. It is **not yet safe to hold multiple real
businesses' customer data.** Known gaps:

- **Prototype logins.** Owner password, team code, and operator passcode are simple
  checks stored in the workspace data — not real, hashed authentication.
- **One shared record.** All data (bookings, customers, PII, signed agreements, COI
  files) lives in a single Supabase JSONB row — **no per-business or per-customer
  isolation.** Nothing in code stops one account from reading another's data.
- **Simulated integrations.** Texts, emails, payouts, customer card payments, trials,
  and subscription billing are all config-only mockups.
- **Data does persist** to Supabase cloud (browser is only a cache), and traffic is
  TLS-encrypted, with Supabase at-rest encryption — but that's the floor, not real
  protection or isolation.

**Rule: do not onboard a real second business until Phases 1–2 below are done.**

---

## 1. Target model & who-sees-what

| Role | Sees |
|---|---|
| **Platform owner (you)** | Everything: your rental business + the **Operator** portal (all SaaS customers, MRR, financials) |
| **Business owner (a SaaS customer)** | ONLY their own rental business — their dashboard, equipment, bookings, crew, money. Never your data, never another business's, never the Operator portal |
| **Crew / employee** | Only their own team portal for their business |
| **Rental customer** | Only the public storefront + their own booking |

This separation must be **enforced in code** (auth + Row-Level Security), not by
convention. That is the heart of Phases 1–2.

---

## 1b. Cross-cutting workstreams — FIRST-CLASS, not afterthoughts

Two things decide whether a *competitive product* becomes a *business people switch
to*. They are **not** a final polish pass — they run **alongside every phase** below,
and **both gate launch**. Treat them as standing requirements, not tickets at the end.

### A. Reliability & data-safety  *(task #29 — the trust bar)*
Businesses put their livelihood in this — bookings, money, customer records. "Mostly
works" is a failing grade the moment real data is inside.
- **Never lose data:** automated backups + point-in-time recovery; soft-deletes with a
  recovery window; version history on bookings/agreements/settings; per-business export.
  (Cloud is source of truth; localStorage is cache only — already true.)
- **Guarded writes:** no single bad save can clobber a workspace (a benefit of the
  per-tenant row model); validate before write; optimistic-concurrency / last-writer
  checks so two devices don't stomp each other.
- **Resilience:** graceful failure + clear retry on network/cloud errors (no silent data
  loss); health checks; uptime monitoring & alerting; tested restore (a backup you've
  never restored is a hope, not a backup).
- **Definition of done for launch:** a full restore has been rehearsed; a killed write
  mid-save never corrupts a workspace; every business can export their own data.

### B. Mobile experience  *(new task #30 — where the work actually happens)*
Owners run the business from a phone; crew mark jobs done in the field, in gloves,
outside. Desktop-only loses in this market.
- **Crew portal, phone-first:** big tap targets, one-thumb job flow (directions →
  photos → mark done → clock in/out), works on spotty signal; consider offline-tolerant
  actions that sync when back online.
- **Owner on mobile:** dashboard "Start here", assign/reassign, mark out/back, and take
  a booking must all be comfortable on a phone, not just shrunk-down desktop.
- **Customer booking on mobile:** the storefront + booking flow (and the /book embed)
  must feel native on a phone — that's where most customers book.
- **Add-to-home-screen / PWA:** installable, app-like, push-capable later — cheap way to
  feel like "an app" without app-store overhead.
- **Definition of done for launch:** every primary task (crew job completion, owner
  daily loop, customer booking) is verified smooth on a real phone screen.

> Sequencing: fold these into each phase's work — e.g. when Phase 2 lands the per-tenant
> row model, that same change enables guarded writes and per-business export (A); when
> any customer- or crew-facing screen is touched, it ships phone-first (B). Don't batch
> them for the end.

---

## 2. Phased build

Phases build on each other; order matters. **Reliability/data-safety (1b-A) and mobile
(1b-B) run across all of them and gate launch.**

### Phase 1 — Accounts & authentication  *(foundation)*
- Replace prototype password gates with **Supabase Auth**: real sign-up / login,
  **hashed passwords**, sessions/tokens, password reset.
- Define **roles**: `platform_owner`, `business_owner`, `crew`, `customer`.
- Optional **2FA/MFA** for `platform_owner` and `business_owner`.
- Remove `ownerPass` / `teamPass` / `operatorPass` from any synced/client-readable
  state.
- **Depends on:** nothing. **Blocks:** everything else.

### Phase 2 — Multi-tenant data isolation  *(the linchpin)*
- Introduce a **tenant** = one subscribing business. Every record carries a
  `tenant_id`.
- **Row-Level Security (RLS)** policies so a signed-in user can only read/write rows
  for their own tenant. `platform_owner` can read the **subscriptions** table but not
  tenants' operational data.
- **Migrate** the single JSONB workspace → per-tenant rows. Options:
  - **(a) Fast:** keep JSONB but one row **per tenant** (`tenant_id, data jsonb`) with
    RLS on `tenant_id`. Smallest change; ships isolation quickly.
  - **(b) Robust (later):** normalize into tables (bookings, customers, equipment, …)
    for querying, reporting, soft-deletes, and finer RLS.
  - Recommendation: **(a) now, (b) incrementally.**
- **Depends on:** Phase 1. **Blocks:** billing, real operator portal, safe backups.

### Phase 3 — Security hardening  *(task #28)*
- **Files:** move COI documents & signatures out of the JSONB blob into
  **access-controlled Supabase Storage** with per-tenant policies.
- **Secrets:** `service_role` key stays **server-side only** (Edge Functions / API
  routes); browser uses the anon key **+ RLS**.
- **Audit logging:** who changed what, when.
- **PII hygiene:** collect only what's needed; retention & deletion policy; privacy
  policy + consent; GDPR/CCPA basics.
- **Depends on:** Phases 1–2.

### Phase 4 — Backups & durability  *(task #29 — "nothing is ever lost")*
- **Automated backups + point-in-time recovery** (Supabase paid tier) — restore to any
  moment.
- **Soft-deletes:** mark deleted (recoverable window) instead of hard-deleting.
- **Version history** on critical records (bookings, agreements, settings).
- **Export/download** per business, so each owns a copy of their data.
- **Guarded writes:** avoid one bad save clobbering everything (a benefit of the
  per-tenant row model).
- **Depends on:** partly Phase 2 (data model); enabling backups can start anytime.

### Phase 5 — SaaS billing  *(tasks #26/#27)*
- **Stripe Billing / Subscriptions:** 7-day free trial → convert; manual invoice or
  recurring autopay; plans/tiers; dunning for past-due.
- Wire the **Operator portal** from sample data to **real subscribers** (status, MRR,
  ARR, churn, etc. computed from live subscription data).
- **Depends on:** Phases 1–2.

### Phase 6 — Messaging & customer payments go live
- **Payments:** Stripe for customer rentals — **never store card numbers** (tokens
  only; PCI handled by Stripe). Flips today's simulated pay/deposit.
- **Messaging:** Twilio (SMS) + an email provider (e.g. SendGrid/Resend) — flips the
  simulated texts/emails (confirmations, reminders, owner alerts, review requests,
  crew notifications). A scheduler enables time-based sends (e.g. reminders, payday).
- **Depends on:** Phase 1 (to attribute sends/charges to a tenant).

---

## 3. What stays simulated vs. goes live

| Today (simulated / prototype) | Becomes real in |
|---|---|
| Logins (prototype passwords) | Phase 1 |
| One shared workspace | Phase 2 |
| Operator portal = sample businesses | Phase 5 |
| Trials & subscription billing | Phase 5 |
| Texts / emails / payouts | Phase 6 |
| Customer card payments | Phase 6 |

---

## 4. Security checklist (task #28)

- [ ] Real auth (Supabase Auth), hashed passwords, sessions, reset, optional MFA
- [ ] Roles: platform_owner / business_owner / crew / customer
- [ ] Row-Level Security on every table (tenant isolation)
- [ ] Operator portal gated to platform_owner role
- [ ] Files (COI, signatures) in access-controlled Storage
- [ ] Secrets server-side only; anon key + RLS on client
- [ ] Payments via Stripe tokens (no raw cards stored)
- [ ] Audit log of sensitive changes
- [ ] PII minimization, retention/deletion, privacy policy + consent

## 5. Durability checklist (task #29)

- [ ] Supabase automated backups + point-in-time recovery
- [ ] Soft-deletes with recovery window
- [ ] Version history on bookings / agreements / settings
- [ ] Per-business data export
- [ ] Guarded writes (per-tenant rows; validation)
- [ ] Cloud = source of truth; localStorage = cache only (already true)

---

## 6. Sequencing summary

```
Phase 1 (Auth)  ──►  Phase 2 (Isolation/RLS)  ──►  Phase 3 (Security)
                                     │                     │
                                     ├──►  Phase 4 (Backups/Durability)
                                     ├──►  Phase 5 (Billing → real Operator portal)
                                     └──►  Phase 6 (Payments + Messaging live)
```

**Linchpin: Phases 1 → 2.** Almost everything (security, billing, private Operator
portal, safe backups) sits on real accounts + data isolation.

---

## 7. Open decisions (confirm before building)

1. **Data model migration:** JSONB-per-tenant first (fast) vs. normalize now (robust)?
   → Recommended: JSONB-per-tenant first, normalize incrementally.
2. **Hosting/plan:** Supabase paid tier (needed for point-in-time recovery) + Vercel
   Pro for commercial use — confirm budget.
3. **Auth provider:** Supabase Auth (fits current stack) vs. an external IdP.
4. **Messaging/payments providers:** Stripe (payments/billing) is the default; SMS via
   Twilio, email via SendGrid/Resend — confirm.
5. **Compliance scope:** which regions/customers → GDPR/CCPA obligations, privacy
   policy owner.

---

## 8. Build note / environment

The current dev sandbox **cannot reach Supabase or external providers** (network is
restricted), so Phase-1+ backend work (Auth, RLS, Stripe) must be built and tested in
an environment with real Supabase/Stripe credentials, then deployed via Vercel. The
plan above is implementable incrementally — each phase can ship on its own.
