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

- **In-platform help / training:** a reusable collapsible `HelpNote` component ("How this
  page works", **starts closed** — a click-to-expand dropdown with a rotating chevron, so it
  never clutters) sits at the top of every screen — Dashboard, Insights, Calendar, Bookings,
  Customers, Team & dispatch, Fleet, Settings, the customer booking flow, and the employee portal
  — with detailed, plain-language, screen-specific operating instructions so a non-technical
  owner/crew can run the software without asking anyone. **Standing rule:** every new feature gets
  written into the relevant page's HelpNote. Page-level intros live ONLY in the dropdown (the old
  always-visible blue "This page is…" intro card on Team & dispatch was removed as duplicate
  clutter); short per-section hints under each card still stay visible as inline context.
- **Multi-location / branches (foundation):** `state.locations[]` = `{id,name,area,phone}`;
  every trailer, booking, and contractor carries a `locationId` (migration on load stamps
  legacy rows + guarantees one default location). App holds a per-browser `activeLoc`
  (sessionStorage `yardhand_loc`); it computes a **`scoped`** state (trailers/bookings/
  contractors filtered to the active location) and passes `scoped` to all owner views + the
  customer area, so the whole dashboard shows one branch at a time. The core helpers
  (`trailerStatus`, `currentBooking`, `findUnit`, `countAvail`) run on `scoped`; `addBooking`
  and new units/crew are stamped with the active `locId`. **Top-bar location switcher** shows
  when >1 location; **customer booking** shows a branch picker when >1. Manage in Settings →
  **"Locations / branches"** (add/rename/remove; can't remove one with data). Catalog (`types`),
  pricing, branding, and the agreement are **shared** across locations; trailers/crew/bookings
  are **per-location**. Employee portal uses full state (crew see their own jobs regardless).
  Deferred: "Manage my booking" lookup is currently scoped to the picked branch (fine at one
  location); a global-by-code lookup + a fuller customer branch experience are the next step.
  **Model = fully independent branches, seeded by copying the first branch on add (owner's
  final choice).** Each `location` carries its OWN complete config: `overrides` (a full business
  snapshot) and `types` (its own equipment catalog), plus `timezone`, name/area/phone. The FIRST
  location is the "base" and uses top-level `state.business`/`state.types`; other locations use
  their own copies. App: `scopedBusiness = {...state.business, ...(activeLocation.overrides||{})}`,
  `scopedTypes = activeLocation.timezone ? (activeLocation.types||state.types) : state.types`
  (actually `activeLocation.types || state.types`), `typeBySize` + `scoped.types` use scopedTypes;
  `applyTheme`/`setAppTz` use the active branch. **Settings edits whichever branch you're in**
  (top-bar switcher = `curId`): `set`/`setType`/`addType`/`removeType`/`copyContractToAll` write
  to the base (state.business/types) when on branch 1, else to that location's overrides/types.
  A banner shows "Editing settings for <branch>." **Adding a location deep-copies the first
  branch** (`overrides: clone(business)`, `types: clone(types)`) so setup is instant, then you
  change only what differs. Fleet "Add equipment" is branch-aware too. Verified independent:
  renaming the new branch to "Dallas Branch Co" left branch 1 as "Ext Professionals." The
  location switcher tab stays. Per-branch: settings, catalog, pricing, waiver, branding, fees,
  crew, trailers, bookings. Deferred: "Manage my booking" global-by-code lookup across branches.
- **Flexible pay model + payments/payouts:** two **independent** settings so the app fits any
  crew (owner asked: "some people use contractors but pay them hourly too, right?"). **Tax
  status** `business.workerModel` (`contractor`=1099 / `employee`=W2) is paperwork wording only.
  **Pay basis** `business.payBasis` (`perjob` / `hourly` / `flat`) drives the pay UI, and any mix
  works (a 1099 contractor paid hourly, a W2 on salary, etc.). Both toggles live in Settings →
  **"How you pay your team."**
  - **Per job** (default): Team & dispatch section 2 = "To pay" list of finished unpaid jobs
    (the existing `payJobs`/`owedBy`), pay each one off. Employee portal "My pay" shows owed/paid.
  - **Hourly** (`hourly = payBasis === "hourly"`): section 2 becomes **"Payroll"** — per person,
    `unpaid shifts hours × hourlyRate` with a Pay button that marks all their finished shifts
    paid. Roster cards get an inline **$/hr rate editor**. `AddContractorModal` collects a rate.
    Employee portal tab becomes **"Time & pay"**: **Clock in / Clock out** (writes
    `contractor.shifts[] = {in, out, paid, bookingId?, jobLabel?}`), an "Earned, not paid yet"
    total (hours × rate), and a recent-shifts list. Hours computed live from shift timestamps.
    **Two ways to clock in:** a general shift (big button on the Time & pay tab) OR **against a
    specific job** — each job card in "My jobs" has a *Clock in for this job* button that tags
    the shift with `bookingId`+`jobLabel`; only one job open at a time (others show "Clocked into
    another job"); the tag shows on the shift list and the on-the-clock header.
  - **Salary / flat** (`flat = payBasis === "flat"`): each active person gets a fixed amount every
    period. `business.flatPeriod` = `weekly` / `biweekly` (Settings shows a period selector).
    Section 2 = "Payroll" list of each active person's `flatRate` per period with a Pay button
    that logs `contractor.payouts[] = {at, amount}` (shows "last paid <date>"). Roster cards get a
    **$/period salary editor**. `AddContractorModal` collects the salary. Employee portal "My pay"
    shows their salary + recent pay (no clock-in). No hours/jobs accumulation — it's a fixed recurring pay.
  - **On-screen pay reminders (Dashboard "Start here", no email/text):** matched to `payBasis` and it
    **names the person** — per-job = "N finished jobs to pay" (gated to per-job mode); hourly =
    "Pay <name(s)> for clocked hours"; salary = "Payday — pay <name(s)>" (period-based via `flatPeriod`,
    fires when last payout is a full period old or never paid). `nameList` shows one/two names else
    "<name> & N more". **Deliberately dashboard-only** — the owner rejected email/text payday nags
    ("they can check their bank"), so there is NO `ownerAlertPayroll` toggle and no scheduled send.
  - **Payments** (Settings → Payments card): `paymentProcessor` = how customers pay you
    (Stripe/Square/PayPal-Venmo/Authorize.net/manual) + `paymentAccount`; `payoutMethod` = how
    you pay your team — `platform` (one-tap **Pay $X** button labels; simulated payout) vs
    `manual` (**Mark paid**). `payVia = payoutMethod === "platform"` switches button wording in
    both the per-job and payroll views. **All charging/payouts are simulated** (config only)
    until the payments backend + bank verification are connected (same "goes live" gate as
    messaging). HelpNotes on Team & dispatch, Settings, and the employee portal all detail this.
- **Editable storefront + site modes (white-label foundation):** the public `Landing` page is a
  real website + booking system (point a custom domain at the Vercel URL and it's live). **All copy
  is editable** in Settings → **"Your website (storefront)"** — hero headline (two lines, 2nd is the
  accent colour), subheadline, trust line, equipment-section heading/sub, the "how it works" steps
  (add/remove, title+desc; icons fixed by index), the "why choose us" reasons (add/remove), and the
  bottom CTA. Defaults live in module const `SITE_DEFAULTS` (Ext Professionals' dump-trailer wording),
  spread into `SEED.business` and merged into existing workspaces on load; `Landing` reads each field
  as `b.field || SITE_DEFAULTS.field` (helper `g()`), so nothing changes for the owner out of the box
  and any other business rewrites it for their vertical. **`business.siteMode`** switches the public
  page: `full` (marketing landing + booking — current), `booking` (hides the how-it-works/why-us
  marketing, keeps equipment catalog + booking — for businesses whose own website markets and who just
  want the booking engine to embed a "Book now" link to), `owner` (no public storefront at all —
  `Landing` early-returns a minimal "call/text to book" card; owner enters bookings from the dashboard).
  All branch-aware (per-location `set`). Deferred: SEO foundation is task #24.
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
- **"Start here" daily checklist (Dashboard, top):** the owner's catch-all so nothing slips at
  login. Colour-ranked (red urgent / amber today / blue money & housekeeping); collapses to a
  green "all caught up" when empty; each line says what to do and where, and **names the customer
  or crew member** (`listNames` → one/two names else "X & N more"). Computed in `Dashboard`
  (`dailyChecks`). Full coverage:
  - **Red:** double-bookings · overdue trailers · COI **expired** (`coiExpiredBookings`) ·
    rental **agreement not signed** on a trailer that's out or going out today (`unsignedActive`).
  - **Amber (today):** trailers going out · trailers due back · **COI not uploaded** by the
    customer (`coiNeededBookings`, keys off `!b.coiFile`) · COI **expiring within 2 weeks**
    (`coiExpiringBookings`) · jobs still needing a driver · **customer payments to collect**
    (`toCollect` = active/out bookings with `!b.paid`).
  - **Blue:** paying the crew (per-job `toPay` gated to per-job mode / hourly `hoursDuePeople` /
    salary `salaryDuePeople`) · trailers sitting in **maintenance** (`maintCount`).
  - **Customer payment action:** `BookingDetail` has a **Mark paid / Mark unpaid** toggle
    (sets `b.paid`, shows the rental total) so the "Collect payment" reminder is resolvable —
    previously `b.paid` was tracked but had no owner action. Dashboard-only, no email/text.
- **Crew handoff confirmations:** when a team member taps Mark delivered / handed over /
  collected / received in the portal, the booking is stamped `outDoneBy`+`outDoneAt` (or
  `returnDoneBy`+`returnDoneAt`). The owner's booking detail shows a green **"Crew confirmations"**
  block (who + when), live via cloud sync. Owner alert `ownerAlertHandoff` pings the owner on
  these (simulated send). `crewName(state, id)` resolves the name.
- **Text-to-book (config built, simulated):** Settings → "Text-to-book" card. `textToBookAutoReply`
  (auto-reply with the booking link — the SYSTEM sends it, not the owner), `bookingLink` (owner's
  booking-page URL, appended to the message), `textToBookMessage` (editable, live preview),
  `textToBookNotifyChannel` (email/text/both — where inbound customer texts/questions reach the
  owner, using the owner alert email/cell). After the auto-reply it's a normal two-way SMS
  conversation. Real auto-reply + 2-way texting need a live SMS number (Twilio-style) — task #13.
- **Owner alerts (config built, simulated):** Settings → Notifications → "Alerts to you (the
  owner)" — master `ownerNotify`, channel `ownerNotifyChannel` (email/text/both), `ownerAlertEmail`
  + `ownerAlertPhone` (where alerts go — separate from the customer-facing business number), and
  event toggles: `ownerAlertNewBooking`, `ownerAlertHandoff` (crew confirms pickup/delivery/return),
  `ownerAlertTextToBook`, `ownerAlertCancel`, `ownerAlertScheduleChange`. Purpose: owner gets pinged when off the dashboard. Real send waits
  on the messaging provider (task #19). NOTE: "Text to book" already reaches the owner as a normal
  SMS to the business number; this alert is the in-system heads-up.
- **Review request (after return):** Settings → Notifications → Customers has an
  **"Ask for a review (after return)"** toggle (`notifyReview`), a **review link** field
  (`reviewLink`, paste Google/Yelp URL) and an editable **message** (`reviewMessage`). Added to
  `notifyTimeline` as a `review` item ~3h after the trailer is returned, sent by the customer
  channel. Simulated until the messaging phase like the other notifications.
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
  bookHorizonDays, dispatchMode, counterMode, leadDeliveryHours, leadCounterHours,
  **workerModel** (`contractor`=1099 / `employee`=W2 — paperwork wording only),
  **payBasis** (`perjob` / `hourly` / `flat` — drives the pay UI, independent of workerModel),
  **flatPeriod** (`weekly` / `biweekly` — salary period when payBasis=flat),
  **paymentProcessor** (stripe/square/paypal/authorize/manual — how customers pay),
  **paymentAccount**, **payoutMethod** (`platform`=one-tap Pay button / `manual`=Mark paid).
- `types[]` — equipment products: size (key), name, cuyd, daily/weekly/biweekly/monthly,
  image, desc, reqLabel + tow (generalized "requirements & specs" heading + text, shown on
  booking cards + review; e.g. towing for trailers, operator/transport/power for other gear).
- `trailers[]` — physical units: id, assetId, size, vin, maint, **cost** (purchase price).
- `contractors[]` — workforce: id, name, phone, **email**, vehicle, active, avail{},
  **hourlyRate** (hourly pay), **flatRate** (salary amount per period), **shifts[]**
  (`{in, out, paid, bookingId?, jobLabel?}` — clock-in/out records; `bookingId`/`jobLabel`
  set when clocked in against a specific job), **payouts[]** (`{at, amount}` — logged salary pays).
- `bookings[]` — id, code, trailerId, size, customer info, start/end, times, status
  (reserved/out/returned/overdue via date/cancelled), waiver, outMethod/returnMethod,
  outBy/returnBy + paid flags, price, deposit, coi, coiFile, coiName, signName/signedAt,
  agreementText, inspectOutAt/inspectInAt.
