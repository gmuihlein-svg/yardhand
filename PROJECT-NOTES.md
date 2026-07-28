# Yardhand — Project Notes & Handoff

> **Purpose:** durable memory for this project so any new session (or a new chat)
> can pick up with full context — independent of any single conversation.
> The **GitHub repo is the source of truth.** Vercel just deploys what's in GitHub.

---

## 🔴 NEXT SESSION — START HERE (owner's standing request)

**Remaining: create the customer-management (multi-tenant) admin guide.** Status:

1. ✅ **DONE** — Operator's Guide updated (Insights, equipment photos/descriptions,
   Add equipment vs Add unit, branding, owner login/sign-out, transparent pricing,
   workforce email).
2. ⬜ **TODO** — **Create a new "Managing Customers" / Platform-Admin guide** — for the
   platform owner (not end businesses): how to onboard a new business, customize
   per-customer via settings + feature flags, keep others on defaults, and roll out safe
   platform-wide updates. Base it on the "Multi-tenant principles" section below.
3. ✅ **DONE** — Partnership Pitch refreshed with new capabilities (analytics, branding,
   logins, transparent pricing).

_(This note exists because the owner asked to be reminded next time — surface it.)_

---

## Where things live (how to resume)

| Thing | Lives in | Durable? |
|---|---|---|
| App code | **GitHub** (`gmuihlein-svg/yardhand`) | ✅ versioned, every change committed |
| Deployed site | **Vercel** (auto-deploys from GitHub) | ✅ rebuilds from GitHub; prior deploys roll back |
| This/any chat | Claude Code session | ⚠️ not a store of record — the repo is |
| **Customer data** (bookings, settings) | **each browser's localStorage** | ❌ **NOT durable — Phase 2 (database) fixes this** |

- **Working branch:** `claude/nextjs-setup-local-render-8xb2u7`
- **Owner login:** password gate; default password `admin`, changeable in
  **Settings → Owner access**. Prototype-level (stored client-side), not real auth yet.
- **Main file:** `app/yardhand-app.jsx` (single-file app; ~2600 lines).
- **Framework note:** see `AGENTS.md` — this is a customized Next.js; read
  `node_modules/next/dist/docs/` before writing framework code.

---

## What's built (Phase 1 — live prototype)

**Owner dashboard tabs:** Dashboard · Insights · Calendar · Bookings · Drivers & dispatch ·
Yard counter · Fleet · Settings.

- **Customer booking flow** (4 steps: Trailer → Dates → Details → Review) with a **live,
  itemized price panel on every step** (shows tier applied + savings vs daily).
- **Insights analytics:** fleet ROI, weighted utilization, revenue KPIs; revenue-by-month,
  revenue-by-type, fleet-value donut, top performers, lowest-ROI table. Computed from
  bookings; seeded with ~12 months of sample history. (AI "plain-English chart builder"
  is a tracked, not-yet-built teaser — needs the AI backend.)
- **Equipment model:** each **type/product** has name, capacity, tiered pricing, **photo,
  description**. **Add equipment** = new product/rental; **Add unit** = another physical
  unit of an existing product. Units carry a **purchase price** (powers ROI).
- **Undo:** consequential actions (mark paid, mark returned/out, cancel, extend, reassign,
  sick-day reassign, auto-assign-all, remove equipment type, maintenance toggle, and even
  "Reset demo data") show a one-tap **Undo** in the toast (~6s) that restores the full
  pre-action state. `flash(msg, true)` captures the pre-action `state` snapshot; the toast's
  Undo does `setState(snapshot)`. Undoes the most recent action only.
- **Customers tab:** a customer database derived from bookings (grouped by name) — each
  customer's full rental history, signed-waiver count, and COIs. Searchable by name, phone,
  email, or confirmation number (single box). Click a rental to open its full detail.
  Insights also gains a Customers section (count, repeat rate, avg booking, commercial %,
  top customers by revenue). `computeCustomers(state)` does the aggregation.
- **COI storage:** the booking detail lets the owner upload/view/remove a real Certificate
  of Insurance file (image or PDF, stored as a data URL on `booking.coiFile`/`coiName`).
- **Booking notice (lead time):** Settings lets the owner require X hours of notice before
  the crew can be booked — separate values for delivery/collection (`leadDeliveryHours`,
  default 12) and will-call/yard (`leadCounterHours`, default 2). The booking flow hides
  time slots that are too soon and shows a "needs X notice" message. Set to 0 to disable.
- **Two-leg dispatch:** every rental has an OUT leg + RETURN leg, scheduled independently;
  delivery/collection (driver) vs will-call/yard (counter handoff). Availability-gated so
  customers can't book slots that can't be staffed.
- **Branding (white-label):** upload a **logo** (shown top-left + public site) and pick
  **accent + header colors**; whole app recolors live. Stored on `business.theme`.
- **Owner login:** branded sign-in gate + sign-out; public site & booking stay open.
- **Workforce onboarding:** name, phone, tow vehicle, **email** (for future job alerts +
  portal login). Availability is set separately in the schedule grid.
- **Money:** tiered rental pricing, refundable deposit hold, delivery/collect + will-call/
  yard fees, optional damage waiver, sales tax, cancellation policy. All editable in Settings.
- **Deliverables produced:** Operator's Guide (.docx), Partnership Pitch (.docx),
  and a hosted Operator's Guide artifact.

---

## Multi-tenant principles (for when we sell to other businesses — Phase 2+)

The model: **one shared codebase + per-tenant configuration + feature flags.** Never fork
the code per customer.

1. **Separate CODE from DATA.** Mass updates change shared code; each customer's tweaks live
   in their own config/data. Deploying new code doesn't overwrite anyone's settings.
2. **Customize three ways** (safest first): (a) config they set themselves (branding,
   pricing, equipment, policies); (b) **feature flags** — turn features on/off per customer;
   (c) new features built **behind a flag, default off**, on only for those who want them.
3. **Prevent update conflicts** with **safe fallbacks + migrations.** Never assume a data
   field exists — the app already does this (`biweekly ?? weekly*2`, `theme || default`,
   `bookHorizonDays || 30`). Schema changes ship with migrations.
4. **Roll out safely:** test updates on a staging copy; consider gradual/canary rollout.
5. **Customer requests workflow:** sort each into self-serve config / new flagged feature /
   (rarely) bespoke-but-still-shared-code. Keep everything in the one codebase.

---

## Phase roadmap (tracked tasks)

- **Phase 2 — shared database** (the big unlock): moves data off the browser to a real,
  backed-up server; enables multi-device, logins, and multi-tenancy. _Most important next step._
- **#5 Owner login** ✅ done (prototype gate).
- **#7** Notify workforce when assigned a job (email/SMS).
- **#8** Real before/after inspection photo upload.
- **#9** Employee/workforce self-service portal.
- **#10** Multi-tenant / white-label foundation (sell to other businesses).
- **#11** Availability workflow: standing weekly schedule + exceptions.
- **#12** Send customer their booking confirmation.
- **#13** Text-to-book auto-reply with booking link.
- **#14** Late-return fees: charge or waive (with payments).
- **#15** AI "plain-English dashboard builder" for Insights (needs AI backend).

---

## Data model quick reference (`state`)

- `business` — name, yard, phone, logo, theme{accent,dark}, ownerPass, fees (deposit,
  deliveryFee, dropFee, counterFee, taxRate, waiverRate), refund policy, agreementText,
  bookHorizonDays, dispatchMode, counterMode, leadDeliveryHours, leadCounterHours.
- `types[]` — equipment products: size (key), name, cuyd, daily/weekly/biweekly/monthly,
  image, desc, reqLabel + tow (generalized "requirements & specs" heading + text, shown on
  booking cards + review; e.g. towing for trailers, operator/transport/power for other gear).
- `trailers[]` — physical units: id, assetId, size, vin, maint, **cost** (purchase price).
- `contractors[]` — workforce: id, name, phone, **email**, vehicle, active, avail{}.
- `bookings[]` — id, code, trailerId, size, customer info, start/end, times, status
  (reserved/out/returned/overdue via date/cancelled), waiver, outMethod/returnMethod,
  outBy/returnBy + paid flags, price, deposit, coi, coiFile, coiName, signName/signedAt,
  agreementText, inspectOutAt/inspectInAt.
