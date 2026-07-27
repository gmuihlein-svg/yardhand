const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  TableOfContents, PageBreak, LevelFormat, PositionalTab,
  PositionalTabAlignment, PositionalTabLeader,
} = require("docx");
const fs = require("fs");

/* ---- palette ---- */
const STEEL = "26343C";     // dark steel
const STEEL2 = "3E5561";    // medium steel
const AMBER = "B57A1F";     // amber (readable on white)
const AMBERBG = "F6ECD8";   // soft amber fill
const SUB = "5B6770";       // muted text
const LINE = "D8DEE2";      // hairline
const HEADFILL = "26343C";  // table header fill
const ROWALT = "F4F6F7";    // zebra row

/* ---- helpers ---- */
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 340, after: 140 }, children: [new TextRun({ text: t, bold: true, color: STEEL, size: 30 })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 90 }, children: [new TextRun({ text: t, bold: true, color: AMBER, size: 24 })] });
const P = (runs, opts = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: "222B30" })], ...opts });
const T = (text, o = {}) => new TextRun({ text, size: 21, color: "222B30", ...o });
const bullet = (runs) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 70, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: "222B30" })] });
const num = (runs, ref) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80, line: 272 }, children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, color: "222B30" })] });

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const cellBorders = { top: { style: BorderStyle.SINGLE, size: 2, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE }, left: noBorder, right: noBorder };

function headerCell(text, widthDxa) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: HEADFILL, color: "auto" },
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    borders: cellBorders,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 19 })] })],
  });
}
function bodyCell(runs, widthDxa, fill) {
  const children = Array.isArray(runs)
    ? [new Paragraph({ spacing: { line: 264 }, children: runs })]
    : [new Paragraph({ spacing: { line: 264 }, children: [new TextRun({ text: String(runs), size: 19, color: "222B30" })] })];
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: 55, bottom: 55, left: 110, right: 110 },
    borders: cellBorders,
    children,
  });
}
function makeTable(widths, headers, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  const headRow = new TableRow({ tableHeader: true, children: headers.map((h, i) => headerCell(h, widths[i])) });
  const bodyRows = rows.map((r, ri) =>
    new TableRow({ children: r.map((c, i) => bodyCell(c, widths[i], ri % 2 ? ROWALT : undefined)) })
  );
  return new Table({ columnWidths: widths, width: { size: total, type: WidthType.DXA }, rows: [headRow, ...bodyRows] });
}
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [] });

// callout box (single-cell shaded table)
function callout(title, lines, fill = AMBERBG, bar = AMBER) {
  const kids = [];
  if (title) kids.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, size: 20, color: STEEL })] }));
  lines.forEach((ln, i) => kids.push(new Paragraph({ spacing: { after: i === lines.length - 1 ? 0 : 50, line: 268 }, children: Array.isArray(ln) ? ln : [new TextRun({ text: ln, size: 20, color: "2A343A" })] })));
  return new Table({
    columnWidths: [9360],
    width: { size: 9360, type: WidthType.DXA },
    borders: {
      top: noBorder, bottom: noBorder, right: noBorder,
      left: { style: BorderStyle.SINGLE, size: 24, color: bar },
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 9360, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill, color: "auto" },
      margins: { top: 130, bottom: 130, left: 200, right: 160 },
      children: kids,
    })] })],
  });
}

/* ======================= BODY ======================= */
const body = [];

/* --- Title page --- */
body.push(new Paragraph({ spacing: { before: 1600, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "EXT PROFESSIONALS", bold: true, size: 56, color: STEEL })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Operator's Guide", size: 40, color: AMBER })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "How your dump-trailer rental platform works — and how to run the day on it", italics: true, size: 22, color: SUB })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER } }, spacing: { after: 0 }, children: [new TextRun({ text: "", size: 2 })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 260 }, children: [new TextRun({ text: "Charlotte, NC  ·  (704) 555-0100", size: 20, color: SUB })] }));
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: "Written for the person running the yard, not the person who built the software.", italics: true, size: 19, color: SUB })] }));
body.push(new Paragraph({ children: [new PageBreak()] }));

/* --- TOC --- */
body.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Contents", bold: true, size: 30, color: STEEL })] }));
body.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-1" }));
body.push(new Paragraph({ children: [new PageBreak()] }));

/* --- 1. Big picture --- */
body.push(H1("1. The big picture"));
body.push(P([T("Everything you rent, book, dispatch, and settle up runs through "), T("one app", { bold: true }), T(". That single app has "), T("two sides", { bold: true }), T(", and knowing which side you're on is the whole trick:")]));
body.push(bullet([T("The customer side", { bold: true, color: AMBER }), T(" — the public booking page. A customer picks a trailer, chooses their dates, decides whether they'll grab it or you deliver, signs the agreement, and pays. That's all they ever see.")]));
body.push(bullet([T("Your side — the dashboard", { bold: true, color: AMBER }), T(" — everything else: the calendar, every booking, your drivers, the yard counter, your fleet, and your settings. This is where you run the business.")]));
body.push(P([T("A booking made on the customer side shows up on your dashboard "), T("instantly", { bold: true }), T(" — you don't re-type anything. Your job is to watch the dashboard and keep trailers moving.")]));
body.push(callout("The one sentence to remember", [[T("Customers "), T("book", { bold: true }), T("; you "), T("dispatch", { bold: true }), T(". The app keeps the two in sync so nothing gets double-booked and nothing gets forgotten.")]]));

/* --- 2. Life of a booking --- */
body.push(H1("2. The life of a booking"));
body.push(P([T("Every rental walks through the same three stages. The app tags each one with a color so you can read a whole screen at a glance:")]));
body.push(makeTable([1900, 2100, 5360],
  ["Stage", "What it means", "What you do"],
  [
    ["Reserved", "Booked and paid, but the trailer hasn't left the yard yet.", "Make sure it's ready and a driver (or the customer) is lined up for pickup day."],
    ["Out", "The trailer is with the customer right now.", "Nothing — until it's due back. Keep an eye on the return date."],
    ["Overdue", "It's past the return date and still hasn't come back.", "Follow up with the customer. This turns red so it's hard to miss."],
    ["Returned", "It's back, inspected, and the deposit hold is released.", "Done. The trailer frees up for the next rental automatically."],
  ]
));
body.push(spacer());
body.push(P([T("You move a booking forward by opening it and clicking the action button — "), T("Mark returned", { bold: true }), T(" (or "), T("Mark collected", { bold: true }), T(", if you're the one going to get it). The moment you do, the deposit hold is released and the trailer becomes available again.")]));

/* --- 3. Two-leg idea --- */
body.push(H1("3. The one idea worth understanding: two legs"));
body.push(P([T("This is the only concept in the whole system that isn't obvious — and once it clicks, the rest is easy.")]));
body.push(P([T("Every rental has "), T("two separate trips", { bold: true }), T(", and the app treats them independently:")]));
body.push(num([T("The OUT leg", { bold: true, color: AMBER }), T(" — getting the trailer "), T("to", { italics: true }), T(" the customer on pickup day.")], "legs"));
body.push(num([T("The RETURN leg", { bold: true, color: AMBER }), T(" — getting the trailer "), T("back", { italics: true }), T(" on return day.")], "legs"));
body.push(P([T("Each leg is handled one of two ways, and the customer chooses when they book:")]));
body.push(makeTable([2400, 3480, 3480],
  ["Leg", "Self-serve (cheaper)", "You handle it"],
  [
    ["Getting it out", "Will-call — customer comes to the yard (+$25)", "Delivery — a driver takes it to them (+$40)"],
    ["Getting it back", "Yard return — customer brings it back (+$25)", "Collection — a driver goes and gets it (+$40)"],
  ]
));
body.push(spacer());
body.push(callout("Why split them?", [
  [T("Because a month-long rental shouldn't tie up a driver for a month. ", {}), T("The delivery is one job on day one; the collection is a separate job weeks later.", { bold: true })],
  [T("The app schedules them as two independent runs, so a driver is only ever booked for the hour they're actually driving — not the whole rental.", {})],
]));

/* --- 4. Daily routine --- */
body.push(H1("4. Your daily routine"));
body.push(P([T("Open the "), T("Dashboard", { bold: true }), T(" tab each morning. Four things are worth a glance, and the app surfaces all of them at the top:")]));
body.push(num([T("Pickups today", { bold: true }), T(" — trailers going out. Is each one ready, and is a driver or will-call lined up?")], "routine"));
body.push(num([T("Returns due today", { bold: true }), T(" — trailers coming back. Be ready to receive and inspect them.")], "routine"));
body.push(num([T("Overdue", { bold: true }), T(" — anything red. Call the customer.")], "routine"));
body.push(num([T("Needs dispatch", { bold: true }), T(" — runs (deliveries or collections) that don't have a driver yet. Assign them.")], "routine"));
body.push(P([T("If those four are clear, your day is under control. Everything else on the dashboard is detail you can drill into when you need it.")]));

/* --- 5. Every screen --- */
body.push(H1("5. Every screen, explained"));
body.push(P([T("Your dashboard has eight tabs across the top. Here's what each one is for:")]));
const tabs = [
  ["Dashboard", "Your home base. Today's pickups, returns, overdue trailers, and the dispatch queue — the morning-glance view from Section 4."],
  ["Insights", "Your numbers at a glance — revenue, how hard each trailer is working (utilization), and return on what you paid (ROI), plus your best and worst performers. Covered in Section 8."],
  ["Calendar", "A visual grid of every trailer across the next several weeks. See at a glance what's booked, what's out, and what's free. Great for answering “do I have a 7×14 open next Tuesday?”"],
  ["Bookings", "The full list of every rental — active, overdue, completed, and cancelled. Filter, search, open any one to see details, extend it, or mark it returned."],
  ["Drivers & dispatch", "Your crew and their runs. Assign drivers to deliveries and collections, see who's available when, use “Auto-assign all,” and track what each driver is owed. Adding someone captures their name, phone, tow vehicle, and email (for future job alerts)."],
  ["Yard counter", "Will-call pickups and yard returns — the trips where the customer comes to you. Each one is a staffed handoff (someone inspects the trailer). Assign who covers each."],
  ["Fleet", "Everything you rent. Two different buttons: “Add equipment” creates a brand-new product or rental (its own name, pricing, photo); “Add unit” adds another physical one of a product you already offer. Also mark a unit down for maintenance or set its purchase price (which powers the ROI on Insights)."],
  ["Settings", "Your prices, fees, deposit, tax, waiver, cancellation policy, and agreement text — plus your branding (logo & colors), equipment photos & descriptions, and your owner password. Change a number here and it applies to every new booking."],
];
tabs.forEach(([t, d]) => body.push(bullet([new TextRun({ text: t + " — ", bold: true, color: AMBER, size: 21 }), T(d)])));

/* --- 6. Signing in --- */
body.push(H1("6. Signing in & your password"));
body.push(P([T("Your dashboard is now behind a password, so customers and passers-by can't see your bookings or finances.")]));
body.push(bullet([T("Signing in — ", { bold: true, color: AMBER, size: 21 }), T("open the app and enter your password on the sign-in screen. You stay signed in on that device until you sign out.")]));
body.push(bullet([T("Signing out — ", { bold: true, color: AMBER, size: 21 }), T("use the “Sign out” button in the top-right of the bar. Good habit on a shared or public computer.")]));
body.push(bullet([T("Changing the password — ", { bold: true, color: AMBER, size: 21 }), T("Settings → Owner access. The starter password is “admin” — change it before you rely on it.")]));
body.push(bullet([T("Your public site still works — ", { bold: true, color: AMBER, size: 21 }), T("the login only guards your dashboard. Customers can still visit your site and book without signing in.")]));
body.push(callout("Heads-up", [
  [T("For now this is a simple gate, and there's one shared owner password. ", {}), T("Individual staff logins with their own accounts and roles arrive with the database phase.", { bold: true })],
], AMBERBG, AMBER));

/* --- 7. Branding & photos --- */
body.push(H1("7. Making it yours — logo, colors & photos"));
body.push(P([T("Everything customers see can carry your brand. It all lives in "), T("Settings", { bold: true }), T(":")]));
body.push(bullet([T("Your logo — ", { bold: true, color: AMBER, size: 21 }), T("upload it once and it shows top-left in the app and on your public site. A transparent PNG looks best.")]));
body.push(bullet([T("Your colors — ", { bold: true, color: AMBER, size: 21 }), T("pick an accent color (buttons and highlights) and a header color. The whole app recolors instantly, with a live preview.")]));
body.push(bullet([T("Equipment photos & descriptions — ", { bold: true, color: AMBER, size: 21 }), T("give each product a photo and a plain-English write-up. Customers see them on the booking page, which builds trust and cuts questions. Every new product you add gets its own photo and description too.")]));
body.push(P([T("These are the same controls we'd hand a brand-new business to make the platform look and feel entirely theirs.")]));

/* --- 8. Reading Insights --- */
body.push(H1("8. Reading your numbers (Insights)"));
body.push(P([T("The "), T("Insights", { bold: true }), T(" tab turns your bookings into a picture of how the business is doing. The four tiles at the top:")]));
body.push(bullet([T("Fleet ROI — ", { bold: true, color: AMBER, size: 21 }), T("how much a trailer has earned versus what you paid for it. Higher is better.")]));
body.push(bullet([T("Weighted utilization — ", { bold: true, color: AMBER, size: 21 }), T("how much of the time your trailers are actually out earning, vs. sitting in the yard.")]));
body.push(bullet([T("Revenue — ", { bold: true, color: AMBER, size: 21 }), T("total rental income recorded.")]));
body.push(bullet([T("Rentals — ", { bold: true, color: AMBER, size: 21 }), T("how many bookings that's across.")]));
body.push(P([T("Below that: revenue by month, revenue by equipment type, where your money is invested, your "), T("top performers", { bold: true }), T(", and an "), T("underperformers", { bold: true }), T(" table — the units earning least against what you paid, so you know what to push, move, or sell. For ROI to be accurate, set each unit's "), T("purchase price", { bold: true }), T(" in Fleet.")]));
body.push(callout("One thing to know", [
  [T("The numbers you see today include realistic ", {}), T("sample history", { bold: true }), T(" so the charts aren't empty. As your real rentals accumulate, they take over. A plain-English “ask a question, get a chart” assistant is coming later.")],
], "EAF1F4", STEEL2));

/* --- 9. Scenarios --- */
body.push(H1("9. When this happens, do this"));
body.push(P([T("The eight situations you'll actually run into, and exactly where to go:")]));
const scen = [
  ["A booking comes in", "Nothing is required — it's already on your Dashboard and Calendar, paid and signed. Just note whether it's a delivery (needs a driver) or will-call (customer comes to you)."],
  ["It's pickup day", "For a delivery, make sure the run has a driver in Drivers & dispatch. For a will-call, make sure someone's at the Yard counter to hand it over and do the quick inspection."],
  ["It's return day", "Open the booking and click Mark returned (or Mark collected if a driver's fetching it). The deposit hold releases and the trailer frees up automatically."],
  ["A customer wants to extend", "Open the booking and use Extend. The app re-checks the trailer is still free for the new dates and re-prices it."],
  ["A customer cancels", "Open the booking and cancel it. The app applies your cancellation policy (full refund 48h+ out, 50% inside 48h, none after pickup) and always releases the deposit hold."],
  ["A driver calls in sick", "In Drivers & dispatch, mark them inactive. Their runs drop back into the dispatch queue so you can reassign them — either pick someone or hit Auto-assign all."],
  ["Two people want the same trailer", "You can't double-book — the app won't offer a trailer that's already reserved for those dates. The Calendar shows you what's genuinely free."],
  ["A customer phones instead of booking online", "You can book on their behalf from the customer side — same flow, same result. It lands on your dashboard exactly like an online booking."],
];
scen.forEach(([q, a]) => {
  body.push(new Paragraph({ spacing: { before: 130, after: 40 }, children: [new TextRun({ text: q, bold: true, size: 22, color: STEEL })] }));
  body.push(P([T(a)], { spacing: { after: 60, line: 276 } }));
});

/* --- 10. Money --- */
body.push(H1("10. How the money works"));
body.push(P([T("Customers now see the price build up "), T("as they book", { bold: true }), T(" — a running, itemized total appears on every step (rental, fees, tax, deposit hold), not just at checkout. It even shows which rate tier they're getting and how much a longer rental saves them. Transparency up front means fewer “how much is it?” calls and fewer surprised customers.")]));
body.push(H2("Rental rates by trailer"));
body.push(makeTable([2900, 1560, 1300, 1300, 1300, 1240],
  ["Trailer", "Capacity", "Day", "Week", "2 weeks", "Month"],
  [
    ["7×14 Dump (14K GVWR)", "7.3 cu yd", "$155", "$580", "$1,120", "$1,880"],
    ["7×12 Dump (9,990 GVWR)", "6 cu yd", "$130", "$490", "$950", "$1,600"],
    ["5×8 Dump (5K GVWR)", "2.5 cu yd", "$95", "$350", "$680", "$1,150"],
  ]
));
body.push(spacer(140));
body.push(H2("Fees, deposit & tax"));
body.push(makeTable([3200, 1800, 4360],
  ["Charge", "Amount", "What it's for"],
  [
    ["Deposit hold", "$500", "A refundable HOLD on the card — not a charge. Released automatically when the trailer comes back clean and undamaged."],
    ["Delivery / collection", "$40", "Charged to the customer when YOU handle a leg (deliver it out, or go collect it)."],
    ["Will-call / yard return", "$25", "Charged to the customer for the self-serve legs (they come get it, or bring it back)."],
    ["Damage waiver", "12% of rental", "Optional. The customer can add it to cap their liability if something goes wrong."],
    ["Sales tax", "7%", "Applied to the rental total at checkout."],
    ["Driver pay", "$40 / run", "What YOU pay a driver for each delivery or collection they run. Tracked per driver."],
    ["Counter handoff", "$20 / handoff", "What you pay a staff member to cover a will-call or yard return. Anything you cover yourself is $0."],
  ]
));
body.push(spacer(120));
body.push(callout("The deposit is the part customers misunderstand most", [
  [T("It is a ", {}), T("hold", { bold: true }), T(", like a hotel does — the money isn't taken, it's just reserved on the card and released the moment the trailer is back in good shape. Say it that way and you'll avoid most of the phone calls.")],
], "EAF1F4", STEEL2));

/* --- 11. Glossary --- */
body.push(H1("11. Plain-English glossary"));
const gloss = [
  ["Will-call", "The customer comes to your yard to pick up the trailer themselves. The cheaper out option."],
  ["Yard return", "The customer brings the trailer back to your yard themselves. The cheaper return option."],
  ["Delivery / Collection", "You send a driver to drop off (delivery) or pick up (collection). The customer pays more; you pay the driver."],
  ["The two legs", "The out trip and the return trip, scheduled separately so a long rental never ties up a driver."],
  ["Deposit hold", "A refundable authorization on the card, released at return. Not a charge."],
  ["COI", "Certificate of Insurance — proof of coverage, mainly for commercial customers. Tracked per booking."],
  ["Needs dispatch", "The queue of delivery/collection runs that don't have a driver assigned yet."],
  ["“No driver free”", "A status (not a fee) meaning no available driver for that run's date and time yet — you'll assign it as the date approaches."],
  ["Damage waiver", "An optional add-on that caps the customer's cost if something goes wrong. 12% of the rental."],
  ["Availability-gating", "The app won't let a customer book a slot you can't actually staff — so you never promise what you can't deliver."],
  ["Equipment (product) vs. unit", "A “product” is a kind of thing you rent (e.g. a 7×14 Dump). A “unit” is one physical one you own (7×14-A). Add equipment = new product; Add unit = one more of it."],
  ["ROI", "Return on investment — how much a unit has earned versus what you paid for it. Shown on the Insights tab."],
  ["Utilization", "How much of the time your trailers are out earning rather than sitting idle."],
];
gloss.forEach(([term, def]) => body.push(bullet([new TextRun({ text: term + " — ", bold: true, color: AMBER, size: 21 }), T(def)])));

/* --- 12. Good to know now --- */
body.push(H1("12. Good to know right now"));
body.push(P([T("An honest picture of where the platform stands today, so nothing surprises you:")]));
body.push(bullet([T("It's live and real. ", { bold: true }), T("The app is deployed and working — you can use it from any browser, now behind an owner password.")]));
body.push(bullet([T("Sample data is loaded. ", { bold: true }), T("The trailers, drivers, and bookings you see now are realistic examples so the screens aren't empty. Your real data replaces them as you go.")]));
body.push(bullet([T("Browser-only for the moment. ", { bold: true }), T("Right now the app remembers everything in the browser you use — including your logo and settings. Sharing one live set of data across phones and laptops (and never losing it) is the next big step (“Phase 2 — the shared database”).")]));
body.push(bullet([T("Sign-in is a simple gate for now. ", { bold: true }), T("One shared owner password protects the dashboard. Individual staff accounts, roles, and secure passwords come with the database phase.")]));
body.push(bullet([T("Payments and messages are staged. ", { bold: true }), T("Real card charges, booking confirmations, and driver notifications are planned phases — the workflows are built and waiting to be switched on.")]));
body.push(spacer(120));
body.push(callout("Bottom line", [
  [T("What you're holding is a working, professional rental platform. ", { bold: true }), T("The rest is turning on the plumbing — shared data, logins, real payments, and automatic messages — one phase at a time.")],
]));
body.push(new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "—  Keep this handy for training. Update it as the platform grows.  —", italics: true, size: 19, color: SUB })] }));

/* ======================= DOC ======================= */
const doc = new Document({
  creator: "Ext Professionals",
  title: "Ext Professionals — Operator's Guide",
  styles: {
    default: { document: { run: { font: "Calibri", size: 21, color: "222B30" } } },
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { run: { color: AMBER }, paragraph: { indent: { left: 380, hanging: 220 } } } }] },
      { reference: "legs", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 380, hanging: 220 } } } }] },
      { reference: "routine", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 380, hanging: 220 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1200, right: 1200 } } },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = "/tmp/claude-0/-home-user-yardhand/34493c9a-ac6d-5f0b-af34-1bc782bea07a/scratchpad/Ext-Professionals-Operators-Guide.docx";
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
});
