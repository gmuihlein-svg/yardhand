const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat,
} = require("docx");
const fs = require("fs");

/* ---- palette (matches the Operator's Guide) ---- */
const STEEL = "26343C";
const STEEL2 = "3E5561";
const AMBER = "B57A1F";
const AMBERBG = "F6ECD8";
const SUB = "5B6770";
const LINE = "D8DEE2";
const HEADFILL = "26343C";
const ROWALT = "F4F6F7";
const INK = "222B30";

/* ---- helpers ---- */
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 340, after: 140 }, children: [new TextRun({ text: t, bold: true, color: STEEL, size: 30 })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t, bold: true, color: AMBER, size: 23 })] });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 120, line: 278 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: INK })], ...opts });
const T = (text, o = {}) => new TextRun({ text, size: 21, color: INK, ...o });
const bullet = (runs) => new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 80, line: 274 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: INK })] });
const spacer = (h = 90) => new Paragraph({ spacing: { after: h }, children: [] });

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

/* ======================= BODY ======================= */
const body = [];

/* --- Cover --- */
body.push(new Paragraph({ spacing: { before: 1500, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "YARDHAND", bold: true, size: 62, color: STEEL })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Rental operations, run from one screen.", size: 30, color: AMBER })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 340 }, children: [new TextRun({ text: "A white-label booking, dispatch & fleet platform — built by an operator, made yours.", italics: true, size: 21, color: SUB })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER } }, children: [new TextRun({ text: "", size: 2 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 260 }, children: [new TextRun({ text: "Partnership Overview", bold: true, size: 22, color: STEEL2 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: "Prepared for:  ____________________________", size: 20, color: SUB })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20 }, children: [new TextRun({ text: "A platform for equipment-rental operators who want to book, dispatch, and get paid without the whiteboard and the phone tag.", italics: true, size: 19, color: SUB })] }));
body.push(new Paragraph({ children: [new PageBreak()] }));

/* --- 1. In one line --- */
body.push(H1("The pitch, in one line"));
body.push(callout(null, [
  [T("Yardhand runs your entire rental yard — customer bookings, driver dispatch, fleet, and billing — from a single screen. ", { bold: true, size: 22 }), T("It was built by a working rental operator, so it already speaks the language of the business. And because it's multi-tenant, we can stand up a version branded and configured entirely to ", { size: 22 }), T("your", { italics: true, size: 22 }), T(" operation.", { size: 22 })],
]));
body.push(spacer(40));
body.push(P([T("You don't adapt to the software. The software adapts to you.", { bold: true, color: STEEL })]));

/* --- 2. The problem --- */
body.push(H1("The problem we solve"));
body.push(P([T("Most rental operations still run on a patchwork: a wall calendar, a spreadsheet, a stack of texts to drivers, and a lot of phone calls. It works — until it doesn't:")]));
body.push(bullet([T("Double-bookings", { bold: true }), T(" — two customers promised the same unit because two people were looking at two different lists.")]));
body.push(bullet([T("Phone tag with drivers", { bold: true }), T(" — every delivery and pickup is a separate round of “are you free Tuesday?”")]));
body.push(bullet([T("Forgotten returns", { bold: true }), T(" — a unit sits out three extra days because nobody was watching the return date.")]));
body.push(bullet([T("After-hours bookings lost", { bold: true }), T(" — a customer ready to rent at 9pm has no way to book, so they call your competitor in the morning.")]));
body.push(bullet([T("Money that slips", { bold: true }), T(" — deposits not held, fees not charged, and no clean record of who owes whom.")]));
body.push(P([T("Every one of those is a leak. Yardhand closes them.")]));

/* --- 3. What it does --- */
body.push(H1("What Yardhand does"));
body.push(H2("Customers book themselves — 24/7"));
body.push(P([T("A clean public booking page: pick a unit, choose dates, choose delivery or self-pickup, sign the rental agreement, and pay. It lands on your dashboard instantly — no re-typing, no missed calls, no lost weekend bookings. Pricing is fully transparent — the customer sees an itemized total build up on every step, so there are no surprises and far fewer “how much is it?” calls.")]));
body.push(H2("You run the day from one dashboard"));
body.push(P([T("Today's pickups, today's returns, anything overdue, and every run that still needs a driver — all on one screen the moment you log in. If it's clear, your day is under control.")]));
body.push(H2("Dispatch that thinks like a dispatcher"));
body.push(P([T("Yardhand treats every rental as two independent trips — the drop-off and the pickup — so a month-long rental never ties up a driver for a month. It knows who's available, won't offer a slot you can't staff, and can auto-assign the whole queue with one click.")]));
body.push(H2("Fleet, counter & money — handled"));
body.push(P([T("Track every unit and its status, run will-call handoffs at the yard, and keep the money straight: tiered pricing, refundable deposit holds, optional damage waiver, tax, cancellation rules, and a running tally of what each driver is owed.")]));
body.push(H2("Know your numbers"));
body.push(P([T("A built-in analytics view turns your bookings into decisions: revenue by month and by category, how hard each unit is working (utilization), and return on what you paid (ROI) — with your best and worst performers ranked, so you know exactly what to buy more of, push harder, or sell. The stuff most operators only find out at tax time, you see any morning.")]));
body.push(H2("Your brand, not ours"));
body.push(P([T("Upload your logo and pick your colors, and the whole platform — public site and dashboard — becomes yours. Add a photo and description to every piece of equipment so customers know exactly what they're renting. And your dashboard sits behind a private owner sign-in.")]));

/* --- 4. Benefits table --- */
body.push(H1("What that means for you"));
body.push(P([T("The same day, before and after:")]));
body.push(table([4680, 4680],
  ["How it runs today", "How it runs on Yardhand"],
  [
    ["Two people, two lists, the occasional double-booking", "One live schedule — the app won't let a booked unit be booked again"],
    ["Texting drivers one job at a time", "Assign a run in two taps, or auto-assign the whole board at once"],
    ["Hoping someone remembers the return date", "Overdue units turn red on the dashboard automatically"],
    ["Bookings only when someone answers the phone", "Customers book and pay themselves, around the clock"],
    ["Deposits and fees tracked in your head", "Held, charged, and recorded on every booking"],
    ["“Who did we owe for that delivery?”", "A running total of driver and staff pay, per person"],
  ]
));
body.push(spacer(120));
body.push(callout("The bottom line for an owner", [
  [T("Fewer mistakes, less phone time, more bookings captured, and a professional experience your customers feel the first time they book. ", {}), T("You spend the day running the yard — not chasing the paperwork.", { bold: true })],
], "EAF1F4", STEEL2));

/* --- 5. Made yours: multi-tenancy --- */
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(H1("Made yours: one platform, your operation"));
body.push(P([T("This is the part that matters most. Yardhand is "), T("multi-tenant", { bold: true, color: AMBER }), T(" — one platform that runs many independent businesses, each configured to how "), T("they", { italics: true }), T(" work. Your version isn't a generic tool with your logo pasted on. Every number, name, and rule is yours:")]));
body.push(table([3000, 6360],
  ["You control", "What that looks like"],
  [
    ["Your brand", "Upload your logo and pick your accent + header colors; the whole app — public site and dashboard — recolors to match, instantly. Plus your name, yard location, and phone."],
    ["Your equipment", "Not just dump trailers. Any rentable asset — define your own products, capacities, and unit IDs, each with its own photo and description that customers see when they book."],
    ["Your pricing", "Per-unit daily, weekly, two-week, and monthly rates. Change a number and it applies to every new booking."],
    ["Your fees", "Delivery, self-pickup, deposit hold, damage-waiver %, and sales-tax rate — all set to your policy."],
    ["Your crew", "Your drivers and yard staff, their availability, and what each is paid per run or handoff."],
    ["Your policies", "Your cancellation terms and your full rental-agreement and liability-waiver text, shown to customers before they sign."],
  ]
));
body.push(spacer(120));
body.push(H2("Walled off and private"));
body.push(P([T("Each business on Yardhand is its own island. Your bookings, customers, pricing, and crew are yours alone — no other operator can see them, and you never see theirs. Same platform underneath; completely separate operations on top.")]));
body.push(H2("It's not just dump trailers"));
body.push(P([T("Yardhand's core idea — a unit goes out, comes back, and someone has to move it each way — fits almost anything you rent and retrieve:")]));
body.push(bullet([T("Equipment & tool rental", { bold: true }), T(" — skid steers, lifts, compressors, generators.")]));
body.push(bullet([T("Containers & storage", { bold: true }), T(" — roll-offs, storage units, portable offices.")]));
body.push(bullet([T("Event & party rental", { bold: true }), T(" — staging, tents, tables, restrooms.")]));
body.push(P([T("If it leaves your yard and comes back, Yardhand can schedule it, dispatch it, and bill it.")]));

/* --- 6. Where it is / roadmap --- */
body.push(H1("Where it is today"));
body.push(P([T("Straight answer: Yardhand is "), T("live and in active development", { bold: true }), T(", and ready for pilot partners who want to shape it. Here's the honest picture:")]));
body.push(table([4680, 4680],
  ["Working today", "On the near-term roadmap"],
  [
    ["Full customer booking flow with transparent pricing", "One shared account & data across all your devices"],
    ["Owner dashboard behind a private sign-in", "Individual staff logins with roles"],
    ["Two-leg dispatch & driver assignment", "Live card payments and deposit captures"],
    ["Built-in analytics (revenue, utilization, ROI)", "Automatic booking confirmations to customers"],
    ["Your branding — logo, colors, equipment photos", "Job alerts texted/emailed to your drivers"],
    ["Configurable pricing, fees, policies & yard counter", "Standing weekly staff schedules"],
  ]
));
body.push(spacer(120));
body.push(callout("Why “pilot partner” is the right time to join", [
  [T("Coming in now means your operation helps decide what gets built next — and you get a platform tuned to your real workflow, not a one-size-fits-all product handed down after the fact.")],
]));

/* --- 7. Why us --- */
body.push(H1("Why this, and why us"));
body.push(P([T("Plenty of software is written by people who've never run a yard. Yardhand wasn't. It was built inside a real dump-trailer rental business, to solve real problems that were costing real money — the double-bookings, the phone tag, the forgotten returns.")]));
body.push(P([T("That's why the workflows already fit: the two-leg dispatch, the deposit-as-a-hold, the will-call vs. delivery split, the driver-pay tally. Nobody had to imagine how the business works. We just built what we already needed — and now we can hand you your own.")]));

/* --- 8. Next steps --- */
body.push(H1("Let's talk"));
body.push(P([T("Three easy next steps, whenever you're ready:")]));
body.push(bullet([T("A 20-minute walkthrough", { bold: true }), T(" — we show you the live platform end to end.")]));
body.push(bullet([T("A branded demo", { bold: true }), T(" — we stand up a version with your name, your units, and your pricing so you can see your", { }), T(" operation in it.")]));
body.push(bullet([T("A pilot", { bold: true }), T(" — run a slice of your rentals through Yardhand and feel the difference before you commit.")]));
body.push(spacer(140));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 30 }, children: [new TextRun({ text: "Yardhand", bold: true, size: 26, color: STEEL })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: "Rental operations, run from one screen.", italics: true, size: 20, color: AMBER })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Contact:  ____________________     ·     ____________________", size: 19, color: SUB })] }));

/* ======================= DOC ======================= */
const doc = new Document({
  creator: "Yardhand",
  title: "Yardhand — Partnership Pitch",
  styles: { default: { document: { run: { font: "Calibri", size: 21, color: INK } } } },
  numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { run: { color: AMBER }, paragraph: { indent: { left: 380, hanging: 220 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = "/tmp/claude-0/-home-user-yardhand/34493c9a-ac6d-5f0b-af34-1bc782bea07a/scratchpad/Yardhand-Partnership-Pitch.docx";
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
});
