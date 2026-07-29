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
| **Workspace data** (bookings, settings, everything) | **Supabase (cloud) ✅ LIVE** — one `workspaces` JSONB row (`id=default`), localStorage as offline cache/fallback | ✅ durable, backed up, shared across devices |

- **Working branch:** `claude/nextjs-setup-local-render-8xb2u7`
- **Owner login:** password gate; default password `admin`, changeable in
  **Settings → Owner access**. Prototype-level (stored client-side), not real auth yet.
- **Main file:** `app/yardhand-app.jsx` (single-file app; ~2600 lines).
- **Framework note:** see `AGENTS.md` — this is a customized Next.js; read
  `node_modules/next/dist/docs/` before writing framework code.

---

## What's built (Phase 1 — live prototype)

**Owner dashboard tabs:** Dashboard · Insights · Calendar · Bookings · Customers ·
Team & dispatch · Fleet · Settings.

- **Team & dispatch (one unified tab):** the old "Drivers & dispatch" and "Yard counter"
  tabs are merged — it was always ONE shared pool (`state.contractors`); adding a person
  makes them available for both road runs and yard handoffs. "Add driver" is now **"Add
  employee."** Component: `TeamView` (replaced `DriversView`; `YardView` deleted). Nav id
  is `"team"`. **Laid out as one obvious top-to-bottom flow, numbered 1–4** (designed for a
  non-technical owner who's never seen it):
  1. **Jobs coming up — who's covering each:** `coverJobs` = every job from today forward
     (delivery runs DELIVER/COLLECT + yard handoffs PICKUP/RETURN), each shown once.
     Unassigned road runs float to the top, highlighted amber, with an Auto button; each row
     has an assignee dropdown (yard rows include "You"). **No pay button here** — coverage
     only. "Auto-assign all" (`autoAssignEverything`) covers both road + yard in one pass.
  2. **To pay:** `payJobs` = finished jobs (`jobDone` = leg date < today) assigned to a real
     person and still unpaid; each shows the person + customer and a Mark-paid button.
     Header shows `$owedTotal` split into road/yard. Money is deliberately its own section,
     separate from coverage (owner asked for this). Owe totals (`owedBy`/`owedRoad`/
     `owedYardTotal`) are computed from `payJobs` — i.e. only finished work counts as owed;
     future assigned jobs aren't "owed" yet.
  3. **Your team:** roster (people only) — avatar, contact, `$owed` (finished work),
     open-job count, sick-today / set-inactive, Add employee.
  4. **When each person works:** the availability grid (rows = people, cols = days, color =
     how free), with a plain-language explainer + legend; tap a cell → `AvailabilityEditor`
     (plain language, lists that day's booked jobs).
  5. **Auto-assign settings:** the two mode toggles (`dispatchMode` auto/manual;
     `counterMode` self/auto), framed as set-once automation.
  Shared data: `allJobs` = `legRuns` + `yardEvents` (legRuns now carries `status`).
  The old per-employee job cards, separate needs-dispatch queue, and yard today/upcoming
  lists were removed to kill the duplication ("names/jobs above and below") the owner flagged.

- **Customer booking flow** (4 steps: Trailer → Dates → Details → Review) with a **live,
  itemized price panel on every step** (shows tier applied + savings vs daily).
- **Insights analytics:** fleet ROI, weighted utilization, revenue KPIs; revenue-by-month,
  revenue-by-type, fleet-value donut, top performers, lowest-ROI table. Computed from
  bookings; seeded with ~12 months of sample history. (AI "plain-English chart builder"
  is a tracked, not-yet-built teaser — needs the AI backend.)
- **Equipment model:** each **type/product** has name, capacity, tiered pricing, **photo,
  description**. **Add equipment** = new product/rental; **Add unit** = another physical
  unit of an existing product. Units carry a **purchase price** (powers ROI).
- **Notifications — customers & crew (config + simulation built):** the Settings card is now
  "Notifications · customers & crew" with two blocks: **Customers** (channel email/text/both
  via `notifyChannel`, booking-confirm + waiver toggles, reminder lead-times) and **Your team
  (workforce)** — channel `notifyTeamChannel` (email/text/both, default text), `notifyTeamAssign`
  (heads-up when a job is assigned/reassigned), `notifyTeamReminder` (nudge before the job).
  Sending is still SIMULATED — real SMS/email + scheduler is the remaining messaging-phase work
  (tasks #7 workforce + #17 customers). Legacy note below (kept for the customer detail):
- **Customer notifications (config + simulation built):** Settings "When customers get
  notified" card — channel (text/email/both), toggles for booking confirmation + waiver
  copy, and an editable list of reminder lead-times (default 48h + 24h). Business fields:
  notifyChannel, notifyConfirm, notifyWaiver, notifyReminders[]. `notifyTimeline(state, b)`
  computes each booking's schedule (sent vs scheduled), shown in the booking detail; the
  confirmation screen reflects the settings. SENDING IS SIMULATED — real email/SMS + a
  scheduler are the remaining Phase 5 work (task #17).
- **"Start here" daily checklist (Dashboard, top):** a plain-language list of what needs
  the owner today, so nothing slips at login — overdue trailers, trailers going out today,
  due-back-today, jobs still needing a driver, double-bookings, and finished jobs to pay.
  Colour-coded (red urgent / amber today / blue money); collapses to a green "all caught up"
  when empty. Each line says what to do and where. Computed in `Dashboard` (`dailyChecks`).
- **Calendar (Availability board):** the current day is highlighted — a **TODAY** pill in the
  header + an amber tint down today's column — and each rental's **return/due-back day** (the
  booking's `end`) is marked with a ↻ icon and a dark right edge, so it's easy to see when
  each trailer is due back. Marking a trailer out/returned lives on the Dashboard "Pickups &
  returns today" rows, the Bookings list row buttons, and inside a booking's detail.
- **Employee (team) portal** ✅ — a fourth app mode (`owner | customer | landing | employee`).
  Crew reach it via **Team sign-in** on the public site or the **Team** tab in the top bar.
  Sign-in = their **phone or email** (must match an active contractor) + a shared **team code**
  (`business.teamPass`, default `team`, set in Settings → Owner access). Session kept in
  `sessionStorage` (`yardhand_emp`). Components: `EmployeeLogin`, `EmployeePortal`. Three tabs:
  - **My jobs** — their assigned legs (road runs + yard handoffs) split Today/overdue vs
    Coming up. Each card: what to do, customer, address, **Call** (tel:), **Directions**
    (maps), **Add photos** (camera), and the status action — an OUT leg marks the booking
    `out`, a RETURN leg marks it `returned` (gated: can't return before it's out).
  - **My hours** — a tap-to-set availability calendar (writes `contractor.avail`, same data
    the owner's schedule grid reads) so crew set their own hours; opens `AvailabilityEditor`.
    The **owner sets the same hours** for anyone from Team & dispatch → schedule grid → tap a
    cell — it's the same editor.
- **Availability = ranges.** `AvailabilityEditor` is a **range** picker: Working/Off toggle,
  Starts/Until dropdowns, Morning/Afternoon/All-day presets → stores the continuous list of
  hour windows in `contractor.avail[date]`. Used by both the owner grid and the employee
  "My hours". Customers still pick a single start time (unchanged).
- **Scheduling buffers (Settings):** `business.bufferMins` (gap between one person's jobs;
  applied in `availableDrivers` — a person is blocked for windows within the buffer of an
  existing job) and `business.firstJobDriveMins` (holds the day's earliest **delivery** slots
  so the crew can drive out; applied in the customer booking `outCovers`). Both in minutes,
  rounded to whole hour-slots; default 30 each; 0 disables.
  - **My pay** — read-only: total owed for finished-unpaid work + recently-paid list. Owner
    still does the actual paying in Team & dispatch → To pay.
- **Inspection photos** ✅ — real photo capture (task #8 done). Employees (and the owner in
  the booking detail) attach checkout/return photos; stored as **downscaled** data URLs on
  `booking.inspectOutPhotos[]` / `inspectInPhotos[]` (+ `inspectOutAt`/`inspectInAt`), capped
  at 8 each, shrunk via `fileToResizedDataURL` (canvas → JPEG) so the cloud blob stays small.
  Owner booking-detail inspection section shows the thumbnails (tap to open full-size).
- **Customer self-extend** already exists — "Manage my booking" → **Extend** (`CustExtend`):
  add days, see the extra charge, auto-swaps to a free same-size unit if theirs is booked next.
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
- **COI (Certificate of Insurance):** per-equipment **policy** (`type.coiPolicy`:
  `commercial` = business customers only / `all` = every customer / `none` = never)
  crossed with customer type via `coiRequired(type, ctype)` — so a residential rental of
  certain gear can still require a COI. Requirement shows at booking (Step 2, with
  instructions to name the insured as additionally insured), on the confirmation screen,
  in the owner booking detail, and as a reminder in `notifyTimeline`. **Insured name:**
  Settings has a separate **Legal / insured name** field (`business.legalName`) for
  businesses that carry insurance under an LLC different from their DBA/brand;
  `insuredName(biz)` = `legalName || name`. **Upload paths:** customer during booking,
  customer later via "Manage my booking," owner in the booking detail (View / Download /
  Replace / Remove). File stored as data URL on `booking.coiFile`/`coiName`.
  **Repeat customers:** `latestValidCoi(state, phone, email)` finds a still-valid COI on
  file (matched by phone/email, filtered by `coiExpiry`); the booking flow shows a green
  "already on file" state instead of forcing re-upload and carries `coiFile`/`coiName`/
  `coiExpiry` forward. Owner sets/edits **`booking.coiExpiry`** (date) in the booking
  detail; once it lapses the app asks the customer for a fresh COI again.
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

- **Phase 2 — shared database** ✅ **DONE (core)**: workspace synced to Supabase (Postgres
  JSONB row), durable + backed up + shared across devices. Env vars set in Vercel
  (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY — publishable key). Supabase
  project: yardhand (rrrqehrxmycblfvzmjms). Remaining polish: enable realtime (add
  `workspaces` to the supabase_realtime publication) for instant cross-device updates;
  later normalize into per-entity tables + real per-user auth/RLS (the multi-tenant foundation).
- **#5 Owner login** ✅ done (prototype gate).
- **#7** Notify workforce when assigned a job (email/SMS).
- **#8** Real before/after inspection photo upload. ✅ **DONE** (crew + owner attach photos to
  the booking; downscaled data URLs).
- **#9** Employee/workforce self-service portal. ✅ **DONE** (Team sign-in → My jobs / My hours /
  My pay; mark out/returned, photos, call, directions, set own availability).
- **#10** Multi-tenant / white-label foundation (sell to other businesses).
- **#11** Availability workflow: standing weekly schedule + exceptions.
- **#12** Send customer their booking confirmation (absorbed by #17).
- **#13** Text-to-book auto-reply with booking link.
- **#17** Configurable customer notifications — Settings section, per-booking timeline, and
  confirmation-screen wording are **BUILT (simulated)**. Remaining: wire real email + SMS
  providers and a scheduler to actually send (fits after Phase 2). Shares plumbing with #7.
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
