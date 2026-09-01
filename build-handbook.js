/* Generates Yardhand-Handbook.docx — one Word document for running Ext Professionals.
   Run: node build-handbook.js   (needs `npm install docx` on a fresh clone)  */
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  TableOfContents, PageBreak, LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

/* ---- palette ---- */
const STEEL = "26343C", STEEL2 = "3E5561", AMBER = "B57A1F", AMBERBG = "F6ECD8";
const SUB = "5B6770", LINE = "D8DEE2", HEADFILL = "26343C", ROWALT = "F4F6F7", INK = "222B30";

/* ---- helpers ---- */
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 140 }, children: [new TextRun({ text: t, bold: true, color: STEEL, size: 32 })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: [new TextRun({ text: t, bold: true, color: AMBER, size: 24 })] });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 120, line: 278 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: INK })], ...opts });
const T = (text, o = {}) => new TextRun({ text, size: 21, color: INK, ...o });
const B = (text, o = {}) => new TextRun({ text, size: 21, color: INK, bold: true, ...o });
const bullet = (runs) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 70, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: INK })] });
const num = (runs) => new Paragraph({ numbering: { reference: "n", level: 0 }, spacing: { after: 80, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: INK })] });
const check = (text) => new Paragraph({ spacing: { after: 60, line: 268 }, indent: { left: 300 }, children: [new TextRun({ text: "☐  ", size: 21, color: AMBER }), new TextRun({ text, size: 21, color: INK })] });
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [] });

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const cellBorders = { top: { style: BorderStyle.SINGLE, size: 2, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE }, left: noBorder, right: noBorder };
function hCell(text, w) {
  return new TableCell({ width: { size: w, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: HEADFILL, color: "auto" }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 19 })] })] });
}
function bCell(runs, w, fill) {
  const children = Array.isArray(runs) ? [new Paragraph({ spacing: { line: 264 }, children: runs })] : [new Paragraph({ spacing: { line: 264 }, children: [new TextRun({ text: String(runs), size: 19, color: INK })] })];
  return new TableCell({ width: { size: w, type: WidthType.DXA }, shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined, margins: { top: 55, bottom: 55, left: 120, right: 120 }, borders: cellBorders, children });
}
function table(widths, headers, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  const head = new TableRow({ tableHeader: true, children: headers.map((h, i) => hCell(h, widths[i])) });
  const body = rows.map((r, ri) => new TableRow({ children: r.map((c, i) => bCell(c, widths[i], ri % 2 ? ROWALT : undefined)) }));
  return new Table({ columnWidths: widths, width: { size: total, type: WidthType.DXA }, rows: [head, ...body] });
}
function callout(title, lines, fill = AMBERBG, bar = AMBER) {
  const kids = [];
  if (title) kids.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, size: 20, color: STEEL })] }));
  lines.forEach((ln, i) => kids.push(new Paragraph({ spacing: { after: i === lines.length - 1 ? 0 : 50, line: 268 }, children: Array.isArray(ln) ? ln : [new TextRun({ text: ln, size: 20, color: "2A343A" })] })));
  return new Table({ columnWidths: [9360], width: { size: 9360, type: WidthType.DXA }, borders: { top: noBorder, bottom: noBorder, right: noBorder, left: { style: BorderStyle.SINGLE, size: 24, color: bar }, insideHorizontal: noBorder, insideVertical: noBorder }, rows: [new TableRow({ children: [new TableCell({ width: { size: 9360, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill, color: "auto" }, margins: { top: 130, bottom: 130, left: 200, right: 160 }, children: kids })] })] });
}
const partBreak = () => new Paragraph({ children: [new PageBreak()] });

/* ======================= BODY ======================= */
const body = [];

/* --- Cover --- */
body.push(new Paragraph({ spacing: { before: 1600, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "YARDHAND", bold: true, size: 64, color: STEEL })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Handbook", size: 32, color: AMBER })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: "Everything for running Ext Professionals — how to use it, the roadmap, and the technical reference.", italics: true, size: 21, color: SUB })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER } }, children: [new TextRun({ text: "", size: 2 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 260 }, children: [new TextRun({ text: "Booking, dispatch & fleet for a dump-trailer / equipment rental business.", size: 20, color: STEEL2 })] }));
body.push(partBreak());

/* --- Contents --- */
body.push(H1("Contents"));
body.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
body.push(partBreak());

/* ============ PART A ============ */
body.push(H1("Part A — Resume / Current State"));
body.push(P([T("Paste this Part into a new chat to pick up with full context — no reminders needed.", { italics: true, color: SUB })]));
body.push(P([B("What it is: "), T("Yardhand — a booking + operations app for "), B("Ext Professionals"), T(", a dump-trailer / equipment rental business. Built and used for this one business (it is not sold to other companies).")]));

body.push(H2("Repo & workflow"));
body.push(bullet([T("GitHub "), B("gmuihlein-svg/yardhand"), T(" is the source of truth; Vercel auto-deploys from it.")]));
body.push(bullet([B("Working branch: "), T("claude/nextjs-setup-local-render-8xb2u7 — develop & push here.")]));
body.push(bullet([T("Stack: Next.js (App Router) single-file client app app/yardhand-app.jsx; server files app/layout.js, app/page.js, app/site-data.js, app/robots.js, app/sitemap.js; routes / (the app) and /book (embeddable booking page).")]));
body.push(bullet([T("Data: Supabase JSONB workspaces row (id=default) + localStorage fallback (app/db.js).")]));
body.push(bullet([T("Build/run: timeout 300 npm run build; dev on PORT 3112. Sandbox CANNOT reach Supabase/Vercel/Stripe/Twilio — cloud/live paths verify only at deploy.")]));
body.push(bullet([B("AGENTS.md rule: "), T("this is a customized Next.js — read node_modules/next/dist/docs/ before writing framework code.")]));

body.push(H2("Built & working"));
body.push(bullet([B("Owner app: "), T("dashboard with a named “Start here” checklist + at-risk alerts (a staffed delivery/collection within 3 days with nobody assigned goes red & named); calendar, bookings, customers, crew & dispatch, fleet, insights; multi-location branches.")]));
body.push(bullet([B("Customer storefront: "), T("editable copy/hero/brand, 3 site modes (full / booking-only / owner-only); online booking (multi-equipment cart, delivery/will-call, COI upload, e-sign); embeddable/linkable booking page at /book.")]));
body.push(bullet([B("Scheduling engine: "), T("standing weekly schedule + per-day overrides (availOn); auto/manual dispatch; sick-day auto-reassign; booking availability modes (bookingMode: strict / flexible / hybrid); “how far ahead you take bookings” window.")]));
body.push(bullet([B("Crew: "), T("custom job roles/positions (drive/yard caps) that gate dispatch; per-employee PIN logins (each person sees only their own jobs/hours/pay); “who sets work hours” (worker/owner/both).")]));
body.push(bullet([B("Money: "), T("flexible pay (1099/W2 × per-job/hourly/salary) + payroll views; pricing/fees/deposit/waiver/tax/cancellation; marketing win-back texts (config).")]));
body.push(bullet([B("SEO — live & self-service: "), T("Settings → “Get found on Google” (seoTitle/seoDescription/seoKeywords + checklist) feeds generateMetadata (layout.js) + LocalBusiness JSON-LD (page.js) via app/site-data.js.")]));

body.push(H2("Still simulated (not yet connected)"));
body.push(bullet([B("Payments "), T("(Stripe) — card charges, deposit holds, and crew payouts are set up as realistic previews until the payment service is connected.")]));
body.push(bullet([B("Messaging "), T("(SMS/email) — booking confirmations, reminders, driver job alerts, and review requests are staged until Twilio/email is connected.")]));

body.push(H2("Positioning"));
body.push(P("A capable operations tool for running the business day to day. To take real money and send real messages, connect payments (Stripe) and messaging (Twilio/email). The two things that matter most on the way there: don't lose data (keep the Supabase project active + backed up) and a good phone experience for the field."));
body.push(callout("Standing owner requests", [
  [T("(1) Every new feature gets added to the in-app “How this page works” notes, in detail. (2) Keep this handbook current as the single source of truth.")],
]));
body.push(partBreak());

/* ============ PART B ============ */
body.push(H1("Part B — How to Use Yardhand"));
body.push(P([T("The owner & crew guide.", { italics: true, color: SUB })]));

body.push(H2("The big picture"));
body.push(P("Yardhand runs your whole rental yard from one screen: customers book & pay themselves, you dispatch drivers, track your fleet, and see your money — no wall calendar, no phone tag."));

body.push(H2("The one idea worth understanding: two legs"));
body.push(P([T("Every rental is "), B("two separate trips"), T(" — the OUT leg (getting the trailer to the customer) and the RETURN leg (getting it back). Each is scheduled on its own, so a month-long rental never ties up a driver for a month. Each leg is either self-serve (customer picks up / drops off at your yard — needs nobody) or you handle it (delivery / collection — needs a driver).")]));

body.push(H2("Your daily routine"));
body.push(num([T("Open the "), B("Dashboard"), T(" first. The “Start here” box lists everything needing you today, named and color-ranked: red = urgent, amber = today, blue = money & housekeeping.")]));
body.push(num("Clear the list: mark today's pickups out and returns back; chase any red items (overdue, unsigned agreement, expired COI, a delivery/collection within 3 days with no driver)."));
body.push(num("Everything updates live across your devices and your crew's."));

body.push(H2("Every screen"));
body.push(bullet([B("Dashboard"), T(" — today's work + the Start-here checklist + at-a-glance tiles.")]));
body.push(bullet([B("Calendar / Bookings"), T(" — the schedule and every reservation.")]));
body.push(bullet([B("Customers"), T(" — who's rented, repeat rate, per-customer rebooking reminders.")]));
body.push(bullet([B("Team & dispatch"), T(" — assign jobs, set crew hours/roles/PINs, run payroll.")]));
body.push(bullet([B("Fleet"), T(" — every unit and its status; maintenance in/out.")]));
body.push(bullet([B("Insights"), T(" — revenue, utilization, and ROI per unit.")]));
body.push(bullet([B("Settings"), T(" — everything below.")]));

body.push(H2("Your crew — positions, hours & private sign-ins"));
body.push(P([B("Positions (roles): "), T("in Settings → Job roles, make your own roles and set what each can do — Delivery (drives) and/or Yard (counter handoffs). A role with neither (Mechanic, Manager) is never dispatched but is still a normal scheduled, paid employee.")]));
body.push(P([B("Hours & the repeating week: "), T("tap a person's name in Team & dispatch to set their repeating week once (e.g. Mon–Fri 7–4); it fills every week automatically. Tap any single day to override. In Settings → Who sets work hours, choose workers set their own / you set it / either.")]));
body.push(P([B("Only book when someone's working: "), T("in Settings → When customers can book delivery & pickup, pick Only when we're staffed / Strict up close, flexible further out (default) / Take it now, staff it later. Self drop-off never needs anyone. “How far ahead you take bookings” sets the furthest out a customer can book.")]));
body.push(P([B("Assigning: "), T("jobs auto-assign to an available, qualified person (or press Auto-assign all); reassign by hand anytime. “Sick today” hands off someone's day; anything within 3 days with no one assigned turns red on your dashboard.")]));
body.push(P([B("Private sign-ins: "), T("each crew member signs in on your public site (Team sign-in) with their phone/email + their own personal PIN (you set it on their card). They see only their own jobs, hours & pay — never your dashboard, another person's schedule, your customers, or the money.")]));

body.push(H2("Your website & getting found on Google"));
body.push(P([B("Three site modes"), T(" (Settings → Your website): Full site (complete hosted page + booking), Booking only (equipment + booking to link from your own site), Owner-only (no public page; you take bookings yourself). Every word + the hero image are editable; it wears your logo & colors.")]));
body.push(P([B("Link or embed: "), T("copy a link (“Book now” button) or an embed snippet (booking shows up inside your own website). Either way it's brand-themed and bookings land in your dashboard.")]));
body.push(P([B("SEO: "), T("in Settings → Get found on Google, fill in page title, description, and keywords (each pre-filled with a smart suggestion) — they become your real Google listing. Then work the checklist:")]));
body.push(bullet([B("Set up a free Google Business Profile "), T("(google.com/business) — the #1 thing for Google Maps & local results.")]));
body.push(bullet([B("Ask every happy customer for a Google review.")]));
body.push(bullet([B("Use your city + what you rent "), T("in your title, description, and headline.")]));
body.push(bullet([B("Connect your own domain name.")]));
body.push(bullet([B("List your business in a few local directories "), T("(Yelp, Bing Places).")]));

body.push(H2("How the money works"));
body.push(P("Per-unit daily/weekly/2-week/monthly rates; delivery/self-pickup fees; a refundable deposit hold (not a charge); optional damage waiver; sales tax; cancellation rules. Crew pay: choose their tax status (1099/W2) and how you pay (per-job / hourly / salary), any mix; payroll views total what's owed with a Pay/Mark-paid button."));

body.push(H2("Signing in"));
body.push(P([B("Owner: "), T("your address → owner password. "), B("Crew: "), T("Team sign-in on your public site → phone/email + personal PIN.")]));

body.push(H2("Good to know right now"));
body.push(bullet([B("Live and real, "), T("behind your owner password; your data saves to the cloud and syncs across devices.")]));
body.push(bullet([B("Sample data is loaded "), T("so screens aren't empty — your real data replaces it as you go.")]));
body.push(bullet([B("Payments, confirmations, reminders, and driver texts are staged previews "), T("— built and waiting to be switched on when the payment/texting services are connected.")]));
body.push(partBreak());

/* ============ PART C — Roadmap ============ */
body.push(H1("Part C — Roadmap & What's Simulated"));
body.push(P([T("What's left to turn on for the business.", { italics: true, color: SUB })]));
body.push(H2("What's simulated → becomes real"));
body.push(table([4680, 4680], ["Today (preview)", "Becomes real when…"], [
  ["Card charges, deposit holds, crew payouts", "Stripe (payments) is connected"],
  ["Booking confirmations & reminders to customers", "Twilio/email (messaging) is connected"],
  ["Driver job alerts (text/email)", "Twilio/email is connected"],
  ["Review requests after a rental", "Twilio/email is connected"],
]));
body.push(H2("To turn on when you're ready"));
body.push(bullet([B("Real payments "), T("— Stripe for rentals & deposits (tokens only, never store card numbers); one-tap crew payouts.")]));
body.push(bullet([B("Real messaging "), T("— Twilio SMS + email for confirmations, reminders, driver alerts, and review requests; a scheduler for time-based sends (reminders, payday).")]));
body.push(H2("Keep first-class (they matter even for one business)"));
body.push(bullet([B("Reliability & data-safety "), T("— never lose data: automated backups + point-in-time recovery, soft-deletes with a recovery window, version history on bookings/agreements/settings, and a per-business export. Guarded writes so no bad save clobbers your data; a rehearsed restore (a backup you've never restored is a hope, not a backup).")]));
body.push(bullet([B("Mobile experience "), T("— crew mark jobs done in the field on a phone (one-thumb flow, spotty signal, offline-tolerant); your daily loop and taking a booking comfortable on mobile; the customer booking + /book embed feel native; add-to-home-screen / PWA.")]));
body.push(H2("Data-safety checklist"));
["Supabase project kept active (or on Pro so it never pauses)", "Automated backups + point-in-time recovery", "Soft-deletes with a recovery window", "Version history on bookings / agreements / settings", "A downloadable export of your data", "Cloud = source of truth; the browser copy is just a cache (already true)"].forEach((t) => body.push(check(t)));
body.push(callout("Bottom line", [
  [T("The operations are already there — the hard part. What's left is turning on the plumbing so it takes real money and sends real messages, and keeping your data rock-solid safe. Connect payments and messaging when you're ready to go fully live; back up your data in the meantime.")],
]));
body.push(partBreak());

/* ============ PART D — Technical ============ */
body.push(H1("Part D — Technical Reference"));
body.push(P([T("Key files, routes, data shapes, and helpers — so work can resume precisely.", { italics: true, color: SUB })]));
body.push(H2("Routes / files"));
body.push(bullet([B("app/yardhand-app.jsx "), T("— the whole client app (owner, crew, customer, storefront, settings). Single “use client” file; default export App.")]));
body.push(bullet([B("app/page.js "), T("— renders <YardHandApp/> + LocalBusiness JSON-LD (async, from getBusiness()).")]));
body.push(bullet([B("app/layout.js "), T("— generateMetadata() builds title/description/keywords/OG from business settings.")]));
body.push(bullet([B("app/site-data.js "), T("— server-side getBusiness() (REST read of the workspace; null fallback).")]));
body.push(bullet([B("app/db.js "), T("— loadWorkspace/saveWorkspace/subscribeWorkspace (Supabase + localStorage).")]));
body.push(bullet([B("app/book/page.js "), T("→ <YardHandApp embed/> (booking only, noindex). Plus app/robots.js, app/sitemap.js.")]));
body.push(H2("State shape (one state object, synced as one JSONB row id=default)"));
body.push(P([B("{ business, types[], trailers[], contractors[], bookings[], locations[] }")]));
body.push(bullet([B("business "), T("— name, yard, phone, theme{accent,dark}, logo, ownerPass, teamPass, fees/deposit/tax/waiver, pickupHours, dispatchMode, counterMode, ownerWorks, bookHorizonDays, scheduleControl, bookingMode, hybridNearDays, offerDelivery, siteMode + storefront copy, seoTitle/seoDescription/seoKeywords, workerModel, payBasis, flatPeriod, roles[] ({id,name,drive,yard}), marketing* fields.")]));
body.push(bullet([B("contractors[] "), T("— {id,name,phone,email,vehicle,active, roleId, pin, avail{date:[windows]}, weekly{dow:[fromIdx,toIdx]}, hourlyRate, flatRate, shifts[], payouts[]}.")]));
body.push(bullet([B("locations[] "), T("— branches; each may carry overrides (business fields) + types.")]));
body.push(H2("Availability & dispatch engine (top-level helpers)"));
body.push(bullet([B("availOn(c, dateISO) "), T("— a worker's hours: explicit avail[date] override (incl. [] = day off) wins, else the weekly pattern. Supported by weeklyOn, rangeWindows.")]));
body.push(bullet([B("Roles: "), T("roleOf, roleCaps, canDoKind(biz,c,kind), roleName. kind = “road” (delivery/collection) | “yard” (will-call/handoff) | null.")]));
body.push(bullet([B("availableDrivers(state,date,window,excludeId,kind) "), T("→ active + role-qualified + available + not-too-close. assignRun(...,kind) round-robins by load. windowCovered(...,kind) gates customer slots. Customer booking outCovers/return checks call these with the right kind, gated by policyAllows(date,staffed) per bookingMode.")]));
body.push(H2("Build / run / deploy"));
body.push(bullet([T("Build: timeout 300 npm run build. Dev: PORT 3112 (fuser -k 3112/tcp first, then start, wait for “ready”).")]));
body.push(bullet([T("Sandbox has no Supabase/Vercel/Stripe/Twilio — cloud & live paths verify only at deploy.")]));
body.push(bullet([T("All sending (texts/emails/payouts/customer payments) is simulated until backends connect.")]));
body.push(spacer(160));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "—  Keep this handbook current as Yardhand grows.  —", italics: true, size: 19, color: SUB })] }));

/* ======================= DOC ======================= */
const doc = new Document({
  creator: "Ext Professionals",
  title: "Yardhand — Handbook",
  styles: { default: { document: { run: { font: "Calibri", size: 21, color: INK } } } },
  numbering: {
    config: [
      { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { run: { color: AMBER }, paragraph: { indent: { left: 380, hanging: 220 } } } }] },
      { reference: "n", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 380, hanging: 220 } } } }] },
    ],
  },
  features: { updateFields: true },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "Yardhand-Handbook.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
});
