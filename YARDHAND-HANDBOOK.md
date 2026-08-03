# Yardhand — Master Handbook

**Everything about Yardhand in one place:** how to resume work on it, how to use it, how to
pitch it, and what's left to build. This single file replaces having to remember or re-explain
anything.

**Contents**
- [Part A — Resume / Current State](#part-a--resume--current-state)  *(paste this to restart a session)*
- [Part B — How to Use Yardhand](#part-b--how-to-use-yardhand)  *(owner & crew guide)*
- [Part C — The Pitch](#part-c--the-pitch)  *(for selling it to other rental businesses)*
- [Part D — Roadmap & What's Simulated](#part-d--roadmap--whats-simulated)  *(the path to launch)*
- [Part E — Technical Reference](#part-e--technical-reference)  *(files, routes, data model, helpers)*

> **This is the only project document — it includes everything.** (The one-line repo `README.md`
> is just Next.js boilerplate.) A polished Word version can be generated on request.

---

# Part A — Resume / Current State

*Paste this section into a new chat to pick up with full context — no reminders needed.*

**What it is:** Yardhand — a booking + operations app for a dump-trailer/equipment rental business
(Ext Professionals), being built toward a **white-label SaaS** other rental businesses can pay for.
**Not launched yet.**

**Repo & workflow**
- GitHub `gmuihlein-svg/yardhand` is the source of truth; Vercel auto-deploys from it.
- **Working branch:** `claude/nextjs-setup-local-render-8xb2u7` — develop & push here.
- Stack: Next.js (App Router) single-file client app `app/yardhand-app.jsx`; server files
  `app/layout.js`, `app/page.js`, `app/site-data.js`, `app/robots.js`, `app/sitemap.js`; routes
  `/` (rental app), `/book` (embeddable booking), `/operator` (SaaS admin), `/portal` (chooser).
- Data: Supabase JSONB `workspaces` row (`id=default`) + localStorage fallback (`app/db.js`).
- Build/run: `timeout 300 npm run build`; dev on PORT 3112 (`fuser -k 3112/tcp` first).
- **Sandbox CANNOT reach Supabase/Vercel/Stripe/Twilio** — cloud/live paths verify at deploy.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + a `Claude-Session:`
  line. **Never** put the model ID in commits/PRs/code.
- **AGENTS.md rule:** this is a customized Next.js — read `node_modules/next/dist/docs/` before
  writing framework code.

**Built & working**
- **Owner app:** dashboard with a named **"Start here"** checklist + **at-risk alerts** (a staffed
  delivery/collection within 3 days with nobody assigned goes red & named); calendar, bookings,
  customers, crew & dispatch, fleet, insights; **multi-location branches**.
- **Customer storefront:** editable copy/hero/brand, 3 site modes (full / booking-only / owner-only);
  **online booking** (multi-equipment cart, delivery/will-call, COI upload, e-sign); **embeddable/
  linkable booking page** at `/book` (link + iframe snippet in Settings).
- **Scheduling engine:** standing **weekly schedule** + per-day overrides (`availOn`); auto/manual
  dispatch; sick-day auto-reassign.
- **Booking availability modes** (`business.bookingMode`: strict / flexible / hybrid) — customers can
  only book when someone qualified is working; **"how far ahead you take bookings"** window
  (`bookHorizonDays`).
- **Custom job roles/positions** (`business.roles[]` with drive/yard caps; `contractor.roleId`) gate
  dispatch — a Mechanic-type role is never dispatched but is still a scheduled/paid employee.
- **Per-employee PIN logins** (`contractor.pin`) — each crew member sees ONLY their own jobs/hours/pay.
- **"Who sets work hours"** (`scheduleControl`: worker / owner / both).
- **Flexible pay:** 1099/W2 × per-job/hourly/salary; payroll views (payouts simulated).
- **Marketing win-back texts** (config; simulated send).
- **SEO — live & self-service:** Settings → "Get found on Google" (seoTitle/seoDescription/
  seoKeywords + checklist) feeds `generateMetadata` (layout.js) + LocalBusiness JSON-LD (page.js) via
  `app/site-data.js`. Verified in server-rendered HTML.
- **Separate SaaS side:** `/operator` (passcode) + `/portal` chooser; simulated **Platform Admin**
  (subscribers, MRR/ARR/KPIs, editable Yardhand marketing site). `/operator`, `/portal`, `/book` noindex.

**⚠️ Simulated / not real yet — the gates to selling**
- Real **auth + multi-tenant data isolation** (one shared workspace today) — Phases 1–2.
- **Payments** (Stripe), **messaging** (SMS/email), **SaaS subscription billing** — all simulated.
- **Reliability & data-safety** and **Mobile experience** are **FIRST-CLASS, launch-gating**
  cross-cutting workstreams (don't defer to the end).

**Honest positioning:** a strong, well-modeled prototype. It becomes a genuinely competitive product
for the small equipment/trailer-rental niche **once the backend (auth/multi-tenant/payments/messaging/
billing) is real**, plus reliability and mobile polish. It won't out-feature Jobber/Housecall Pro on
breadth — it wins the niche on fit, price, and the integrated storefront + booking + SEO. Highest-
leverage next build = **Phase 1–2 (real accounts + multi-tenant isolation)**.

**Standing owner requests:** (1) every new feature gets added to the in-app "How this page works"
notes, in detail. (2) Keep the docs current (this handbook + `PROJECT-NOTES.md` + the two `docs/*.docx`).

---

# Part B — How to Use Yardhand

*The owner & crew guide.*

## The big picture
Yardhand runs your whole rental yard from one screen: customers book & pay themselves, you dispatch
drivers, track your fleet, and see your money — no wall calendar, no phone tag.

## The one idea worth understanding: two legs
Every rental is **two separate trips** — the **OUT leg** (getting the trailer to the customer) and
the **RETURN leg** (getting it back). Each is scheduled on its own, so a month-long rental never ties
up a driver for a month. Each leg is either **self-serve** (customer picks up / drops off at your
yard — needs nobody) or **you handle it** (delivery / collection — needs a driver).

## Your daily routine
1. Open the **Dashboard** first. The **"Start here"** box lists everything needing you today, named
   and color-ranked: **red** = urgent, **amber** = today, **blue** = money & housekeeping.
2. Clear the list: mark today's pickups out and returns back, chase any red items (overdue, unsigned
   agreement, expired COI, a delivery/collection within 3 days with no driver).
3. Everything updates live across your devices and your crew's.

## Every screen
- **Dashboard** — today's work + the Start-here checklist + at-a-glance tiles.
- **Calendar / Bookings** — the schedule and every reservation.
- **Customers** — who's rented, repeat rate, and per-customer rebooking reminders.
- **Team & dispatch** — assign jobs, set crew hours/roles/PINs, run payroll.
- **Fleet** — every unit and its status; put units in/out of maintenance.
- **Insights** — revenue, utilization, and ROI per unit.
- **Settings** — everything below.

## Your crew — positions, hours & private sign-ins
- **Positions (roles):** in *Settings → Job roles*, make your own roles and set what each can do —
  **Delivery** (drives) and/or **Yard** (counter handoffs). A role with neither (Mechanic, Manager)
  is never dispatched but is still a normal scheduled, paid employee. Set each person's role on their
  card or when adding them.
- **Hours & the repeating week:** tap a person's name in Team & dispatch to set their **repeating
  week** once (e.g. Mon–Fri 7–4); it fills every week automatically. Tap any single day to override
  it. In *Settings → Who sets work hours*, choose **workers set their own / you set it / either**.
- **Only book when someone's working:** in *Settings → When customers can book delivery & pickup*,
  pick **Only when we're staffed** / **Strict up close, flexible further out** (default) / **Take it
  now, staff it later**. Self drop-off never needs anyone. *"How far ahead you take bookings"* sets
  the furthest out a customer can book.
- **Assigning:** jobs auto-assign to an available, qualified person (or press *Auto-assign all*);
  reassign by hand anytime. *"Sick today"* hands off someone's day; anything within 3 days with no one
  assigned turns red on your dashboard.
- **Private sign-ins:** each crew member signs in on your public site (Team sign-in) with their
  phone/email + their **own personal PIN** (you set it on their card). They see **only their own**
  jobs, hours & pay — never your dashboard, another person's schedule, your customers, or the money.

## Your website & getting found on Google
- **Three site modes** (*Settings → Your website*): **Full site** (complete hosted page + booking),
  **Booking only** (equipment + booking to link from your own site), **Owner-only** (no public page;
  you take bookings yourself). Every word + the hero image are editable; it wears your logo & colors.
- **Link or embed:** copy a **link** ("Book now" button) or an **embed** snippet (booking shows up
  inside your own website). Either way it's brand-themed and bookings land in your dashboard.
- **SEO:** in *Settings → Get found on Google*, fill in page title, description, and keywords (each
  pre-filled with a smart suggestion) — they become your real Google listing. Then work the checklist:
  **(1)** set up a free **Google Business Profile** (the #1 local lever), **(2)** ask customers for
  Google reviews, **(3)** use your city + service in your wording, **(4)** connect your own domain,
  **(5)** list in a few local directories.

## How the money works
- Per-unit daily/weekly/2-week/monthly rates; delivery/self-pickup fees; a refundable **deposit
  hold** (not a charge); optional **damage waiver**; sales tax; cancellation rules.
- Crew pay: choose their **tax status** (1099/W2) and **how you pay** (per-job / hourly / salary),
  any mix. Payroll views total what's owed with a Pay/Mark-paid button.

## Signing in
- **Owner:** your address → owner password. **Crew:** Team sign-in → phone/email + personal PIN.
- **Your SaaS business** (managing Yardhand as a product) is a **separate door** at `/operator` with
  its own passcode — deliberately kept out of the rental dashboard. Use `/portal` to choose between them.

## Good to know right now
- Live and real, behind your owner password; your data saves to the cloud and syncs across devices.
- Sample data is loaded so screens aren't empty — your real data replaces it as you go.
- **Payments, confirmations, reminders, and driver texts are staged previews** — built and waiting to
  be switched on when the payment/texting services are connected.

---

# Part C — The Pitch

*For selling Yardhand to other rental businesses (white-label).*

**In one line:** Yardhand runs your entire rental yard — customer bookings, driver dispatch, fleet,
and billing — from a single screen. Built by a working rental operator, so it already speaks the
business. You don't adapt to the software; the software adapts to you.

**The problem we solve:** most rental operations run on a wall calendar, a spreadsheet, and a stack
of texts to drivers. It works until it doesn't — double-bookings, phone tag, forgotten returns,
after-hours bookings lost to a competitor, and money that slips (deposits not held, fees not charged).
Every one is a leak. Yardhand closes them.

**What Yardhand does**
- **Customers book themselves, 24/7** — a clean public page: pick a unit, choose dates, delivery or
  self-pickup, sign, and pay; it lands on your dashboard instantly, with fully transparent itemized
  pricing.
- **You run the day from one dashboard** — today's pickups/returns, anything overdue, and every run
  that needs a driver, all on one screen.
- **Dispatch that thinks like a dispatcher** — every rental is two independent trips, so a long
  rental never ties up a driver; it knows who's available, won't offer a slot you can't staff, and
  auto-assigns the whole board with one click.
- **Your crew, organized and private** — build your own **positions** (Driver/Yard/Mechanic…) that
  decide who gets which jobs; set each person's normal week once; every crew member gets a **private
  personal sign-in** and sees only their own work.
- **A real website — and found on Google** — a brandable public site with booking, or drop a booking
  **link/embed** onto your existing site; technical SEO built in with a plain-English get-found setup.
- **Fleet, counter & money handled** — unit tracking, will-call handoffs, tiered pricing, deposit
  holds, damage waiver, tax, cancellation rules, and a running tally of crew pay.
- **Know your numbers** — revenue by month and category, utilization, and ROI per unit, best and
  worst performers ranked.
- **Your brand, not ours** — your logo, colors, equipment photos; your dashboard behind a private login.

**What that means for you:** fewer mistakes, less phone time, more bookings captured, and a
professional experience customers feel the first time they book. You run the yard, not the paperwork.

**Made yours (multi-tenant, by design):** your version isn't a generic tool with your logo pasted on —
your brand, equipment, pricing, fees, crew, and policies are all yours. Yardhand's core idea (a unit
goes out, comes back, someone moves it each way) fits equipment & tool rental, containers & storage,
and event & party rental — not just dump trailers. *Full account-level data separation is the top
near-term item before multiple companies run on it; we onboard pilot partners one at a time so data is
handled right from day one.*

**Where it is today (honest):**

| Working today | On the near-term roadmap |
|---|---|
| Full customer booking with transparent pricing | Separate, walled-off accounts per business (multi-tenant) |
| Cloud data synced across your devices & crew's | Live card payments & deposit captures |
| Owner dashboard behind a private sign-in | Automatic booking confirmations & reminders |
| Individual staff sign-ins (personal PINs) | Job alerts texted/emailed to drivers |
| Custom positions/roles gating dispatch | Subscription billing & free trials |
| Standing weekly schedules + only-book-when-staffed | Rock-solid backups + polished mobile (both first-class) |
| Two-leg dispatch, auto or manual | |
| Built-in analytics (revenue, utilization, ROI) | |
| Branding, a real website, embeddable booking & SEO | |
| Configurable pricing, fees, policies & yard counter | |

**Why "pilot partner" is the right time:** coming in now means your operation helps decide what gets
built next — and you get a platform tuned to your real workflow, not a one-size-fits-all product
handed down after the fact.

---

# Part D — Roadmap & What's Simulated

*The path from strong prototype to sellable SaaS. Full detail in `PLATFORM-PLAN.md`.*

## What's real vs. simulated

| Today (simulated / prototype) | Becomes real in |
|---|---|
| Logins (owner password, team code, PINs, operator passcode) | Phase 1 (real auth) |
| One shared workspace | Phase 2 (multi-tenant isolation) |
| Operator portal = sample subscribers | Phase 5 (real billing) |
| Trials & subscription billing | Phase 5 |
| Texts / emails / payouts / customer card payments | Phase 6 |

## Phased build (order matters)
1. **Accounts & authentication** — real sign-up/login, hashed passwords, sessions, roles
   (platform_owner / business_owner / crew / customer), optional MFA. *Blocks everything else.*
2. **Multi-tenant data isolation (the linchpin)** — every record carries a `tenant_id`; Row-Level
   Security so a user only sees their own business's data; migrate the single JSONB workspace to
   per-tenant rows. *This is what makes it safe to hold multiple businesses.*
3. **Security hardening** — files (COI/signatures) in access-controlled storage; secrets server-side
   only; audit logging; PII hygiene + privacy policy.
4. **SaaS billing** — Stripe Billing: 7-day trial → convert, manual or autopay, plans, dunning; wire
   the Operator portal to real subscribers.
5. **Messaging & customer payments go live** — Stripe for rentals (tokens only, never store cards);
   Twilio SMS + email for confirmations, reminders, owner alerts, review requests, crew notifications.

## Cross-cutting — FIRST-CLASS, not afterthoughts (they gate launch)
- **Reliability & data-safety** — never lose data (automated backups + point-in-time recovery,
  soft-deletes, version history, per-business export); guarded writes so no bad save clobbers a
  workspace; graceful failure/retry, uptime monitoring, and a **rehearsed** restore.
- **Mobile experience** — crew mark jobs done in the field on a phone (one-thumb flow, spotty signal,
  offline-tolerant); the owner's daily loop and taking a booking comfortable on mobile; customer
  booking + `/book` embed feel native; add-to-home-screen / PWA.

## Security checklist
- [ ] Real auth (hashed passwords, sessions, reset, optional MFA)
- [ ] Roles: platform_owner / business_owner / crew / customer
- [ ] Row-Level Security on every table (tenant isolation)
- [ ] Operator portal gated to platform_owner role
- [ ] Files (COI, signatures) in access-controlled Storage
- [ ] Secrets server-side only; anon key + RLS on client
- [ ] Payments via Stripe tokens (no raw cards stored)
- [ ] Audit log of sensitive changes
- [ ] PII minimization, retention/deletion, privacy policy + consent

## Durability checklist
- [ ] Automated backups + point-in-time recovery
- [ ] Soft-deletes with a recovery window
- [ ] Version history on bookings / agreements / settings
- [ ] Per-business data export
- [ ] Guarded writes (per-tenant rows; validation)
- [ ] Cloud = source of truth; localStorage = cache only (already true)

## Open decisions (confirm before building the backend)
1. **Data model migration:** JSONB-per-tenant first (fast) vs. normalize now (robust)? → Recommended:
   JSONB-per-tenant first, normalize incrementally.
2. **Hosting/plan:** Supabase paid tier (for point-in-time recovery) + Vercel Pro for commercial use.
3. **Auth provider:** Supabase Auth (fits the stack) vs. an external identity provider.
4. **Providers:** Stripe (payments/billing) default; SMS via Twilio; email via SendGrid/Resend.
5. **Compliance scope:** which regions/customers → GDPR/CCPA obligations, privacy-policy owner.

## Bottom line
The product depth and operational modeling are already strong — the hard part most competitors get
wrong. The remaining work is the plumbing that makes it a business people trust with their livelihood:
**real accounts + data isolation, real payments, real messaging, real billing, plus reliability and
mobile.** Do Phases 1–2 first; everything sellable sits on top of them.

---

# Part E — Technical Reference

*Key files, routes, data shapes, and helpers — so work can resume precisely.*

## Routes / files
- `app/yardhand-app.jsx` — the whole client app (owner, crew, customer, storefront, settings,
  operator). Single `"use client"` file. Exports `App` (default), `OperatorApp`, `PortalChooser`.
- `app/page.js` — renders `<YardHandApp/>` + LocalBusiness JSON-LD (async, from `getBusiness()`).
- `app/layout.js` — `generateMetadata()` builds title/description/keywords/OG from business settings.
- `app/site-data.js` — server-side `getBusiness()` (REST read of the workspace; null fallback).
- `app/db.js` — `loadWorkspace/saveWorkspace/subscribeWorkspace` (Supabase + localStorage).
- `app/book/page.js` → `<YardHandApp embed/>` (booking only, noindex).
- `app/operator/page.js` → `<OperatorApp/>` (SaaS admin, passcode, noindex).
- `app/portal/page.js` → `<PortalChooser/>` (pick rental vs SaaS door, noindex).
- `app/robots.js`, `app/sitemap.js`.

## State shape (one `state` object, synced as one JSONB row `id=default`)
`{ business, types[], trailers[], contractors[], bookings[], locations[], platform }`
- **business** — name, yard, phone, brand `theme{accent,dark}`, `logo`, `ownerPass`, `teamPass`,
  fees/deposit/tax/waiver, `pickupHours`, `dispatchMode`, `counterMode`, `ownerWorks`,
  `bookHorizonDays`, `scheduleControl` (worker|owner|both), `bookingMode` (strict|flexible|hybrid),
  `hybridNearDays`, `offerDelivery`, `siteMode` (full|booking|owner) + editable storefront copy,
  `seoTitle`/`seoDescription`/`seoKeywords`, `workerModel` (contractor|employee), `payBasis`
  (perjob|hourly|flat), `flatPeriod`, `roles[]` (`{id,name,drive,yard}`), marketing* fields.
- **contractors[]** — `{id,name,phone,email,vehicle,active, roleId, pin, avail{date:[windows]},
  weekly{dow:[fromIdx,toIdx]}, hourlyRate, flatRate, shifts[], payouts[]}`.
- **locations[]** — branches; each may carry `overrides` (business fields) + `types`.
- **platform** — simulated SaaS layer: `operatorPass`, `trialDays`, `plans[]`, `tenants[]`, `site{}`.

## Availability & dispatch engine (top-level helpers in yardhand-app.jsx)
- `availOn(c, dateISO)` — a worker's hours for a date: explicit `avail[date]` override (incl. `[]` =
  day off) wins, else the `weekly` pattern. `weeklyOn`, `rangeWindows` support it.
- Roles: `roleOf`, `roleCaps`, `canDoKind(biz,c,kind)`, `roleName`. `kind` = `"road"` (delivery/
  collection) | `"yard"` (will-call/handoff) | null.
- `availableDrivers(state,date,window,excludeId,kind)` → filters active + role-qualified + available +
  not-too-close. `assignRun(...,kind)` round-robins by load. `windowCovered(...,kind)` gates customer
  slots. Customer booking `outCovers`/return checks call these with the right `kind`, gated by
  `policyAllows(date,staffed)` per `bookingMode`.

## Build / run / deploy
- Build: `timeout 300 npm run build`. Dev: PORT 3112 (`fuser -k 3112/tcp` first, then start, wait for
  "ready"). Playwright at `/opt/node22/lib/node_modules/playwright`, chromium
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Sandbox has no Supabase/Vercel/Stripe/Twilio — cloud & live paths verify only at deploy.
- All sending (texts/emails/payouts/customer payments/billing) is **simulated** until backends connect.

---

*Keep this handbook current as Yardhand grows. It's the single place that explains what Yardhand is,
how to use it, how to sell it, what's left to build, and how the code is put together.*
