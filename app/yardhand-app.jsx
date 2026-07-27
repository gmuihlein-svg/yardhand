"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Truck, LayoutDashboard, CalendarDays, ClipboardList, Boxes, Settings,
  Plus, X, Check, AlertTriangle, Clock, DollarSign, ArrowRight, ArrowLeft,
  Phone, Mail, MapPin, Wrench, RotateCcw, ShieldCheck, CreditCard, Search,
  ChevronRight, CircleDot, PackageCheck, CalendarClock, Building2, User, Home
} from "lucide-react";

/* ---------------- design tokens (inline styles; no arbitrary Tailwind) --------------- */
const T = {
  paper: "#F1EEE7", panel: "#FFFFFF", ink: "#181B1F", sub: "#6C7178",
  line: "#E4E0D7", steel: "#2B3A44", steelDk: "#1E2A32",
  amber: "#F2A900", amberDk: "#C98A00", amberSoft: "#FDF3DA",
  green: "#2F8F5B", greenSoft: "#E4F2EA",
  red: "#C4462F", redSoft: "#F8E5E1",
  blue: "#2E6C8E", blueSoft: "#E5EEF3",
  gray: "#8A8F96", graySoft: "#EDEBE6",
};
const STATUS = {
  available: { label: "Available", c: T.green, bg: T.greenSoft },
  reserved:  { label: "Reserved",  c: T.amberDk, bg: T.amberSoft },
  out:       { label: "Out",       c: T.blue,  bg: T.blueSoft },
  overdue:   { label: "Overdue",   c: T.red,   bg: T.redSoft },
  maintenance:{ label: "Down",     c: T.gray,  bg: T.graySoft },
};

/* ---------------- date helpers (ISO yyyy-mm-dd) --------------- */
const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const fmt = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const fmtLong = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
const overlaps = (aS, aE, bS, bE) => aS <= bE && bS <= aE;
const genCode = () => "WY-" + Math.floor(1000 + Math.random() * 9000);

/* find a free physical unit of a size for a window, ignoring one booking (for extend swaps) */
function freeUnitFor(state, size, start, end, exceptBookingId) {
  const units = state.trailers.filter((t) => t.size === size && !t.maint);
  for (const u of units) {
    const clash = state.bookings.some((b) => b.id !== exceptBookingId && b.trailerId === u.id &&
      b.status !== "returned" && b.status !== "cancelled" && overlaps(start, end, b.start, b.end));
    if (!clash) return u;
  }
  return null;
}
/* detect overlapping bookings on the same physical unit (safety net) */
function findConflicts(state) {
  const live = state.bookings.filter((b) => b.status !== "returned" && b.status !== "cancelled");
  const out = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++)
      if (live[i].trailerId === live[j].trailerId && overlaps(live[i].start, live[i].end, live[j].start, live[j].end))
        out.push([live[i], live[j]]);
  return out;
}

const OUT_METHODS = { willcall: "Customer pickup (will-call)", delivery: "We deliver to them" };
const RETURN_METHODS = { yard: "Customer returns to yard", collect: "We collect from site" };
const outVerb = (m) => (m === "delivery" ? "Mark delivered" : "Mark picked up");
const returnVerb = (m) => (m === "collect" ? "Mark collected" : "Mark returned");

/* contractor "runs" derived from bookings: an out leg if we deliver, a return leg if we collect */
function legRuns(state) {
  const runs = [];
  (state.bookings || []).forEach((b) => {
    if (b.status === "cancelled") return;
    if (b.outMethod === "delivery") runs.push({ key: b.id + "-out", bookingId: b.id, leg: "out", label: "Deliver", date: b.start, time: b.pickupTime, by: b.outBy, paid: !!b.outPaid, name: b.name });
    if (b.returnMethod === "collect") runs.push({ key: b.id + "-return", bookingId: b.id, leg: "return", label: "Collect", date: b.end, time: b.returnTime, by: b.returnBy, paid: !!b.returnPaid, name: b.name });
  });
  return runs;
}
const activeRunCount = (state, cid) => legRuns(state).filter((r) => r.by === cid && !r.paid).length;

/* will-call pickups + yard returns = COUNTER appointments (no driver; someone staffs the handoff).
   Reuses the out/return driver fields since a leg is either a driver run OR a counter handoff, never both. */
function yardEvents(state) {
  const ev = [];
  (state.bookings || []).forEach((b) => {
    if (b.status === "cancelled") return;
    if (b.outMethod === "willcall") ev.push({ key: b.id + "-wc", bookingId: b.id, leg: "out", label: "Will-call pickup", date: b.start, time: b.pickupTime, by: b.outBy, paid: !!b.outPaid, name: b.name, status: b.status });
    if (b.returnMethod === "yard") ev.push({ key: b.id + "-yr", bookingId: b.id, leg: "return", label: "Yard return", date: b.end, time: b.returnTime || "", by: b.returnBy, paid: !!b.returnPaid, name: b.name, status: b.status });
  });
  return ev;
}

/* which active drivers are available for a given date + window and not already booked then */
function availableDrivers(state, date, window, excludeId) {
  const runs = legRuns(state);
  return (state.contractors || []).filter((c) =>
    c.active && c.id !== excludeId &&
    ((c.avail && c.avail[date]) || []).includes(window) &&
    !runs.some((r) => r.by === c.id && r.date === date && r.time === window)
  );
}
/* round-robin among AVAILABLE drivers, evened by current load */
function assignRun(state, date, window, excludeId, rot) {
  const pool = availableDrivers(state, date, window, excludeId);
  if (!pool.length) return null;
  const load = (id) => activeRunCount(state, id);
  pool.sort((a, b) => load(a.id) - load(b.id));
  const min = load(pool[0].id);
  const tied = pool.filter((p) => load(p.id) === min);
  return tied[(rot || 0) % tied.length].id;
}
/* whether a window on a date can be covered by someone (for gating customer slots) */
const windowCovered = (state, date, window) => availableDrivers(state, date, window, null).length > 0;

/* legacy fallback (any least-busy active driver, ignores availability) */
function pickContractor(state, excludeId) {
  const pool = (state.contractors || []).filter((c) => c.active && c.id !== excludeId);
  if (!pool.length) return null;
  return pool.map((c) => ({ id: c.id, n: activeRunCount(state, c.id) })).sort((a, b) => a.n - b.n)[0].id;
}

/* refund on cancellation, per the business policy */
function cancelRefund(b, biz) {
  if (b.status === "out") return { amt: 0, label: "No refund — trailer already picked up" };
  const hrs = (new Date(b.start + "T00:00:00") - new Date()) / 3600000;
  const fullHrs = biz.refundFullHrs ?? 48;
  const latePct = biz.refundLatePct ?? 0.5;
  if (hrs >= fullHrs) return { amt: b.price, label: `Full refund (cancelled ${fullHrs}h+ before pickup)` };
  return { amt: Math.round(b.price * latePct), label: `${Math.round(latePct * 100)}% refund (within ${fullHrs}h of pickup)` };
}

const WINDOWS = ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM", "4:00 PM"];
// build a driver's 14-day availability: pattern(dayOfWeek) -> array of windows (or null)
const mkAvail = (pattern) => {
  const o = {};
  for (let i = 0; i < 30; i++) {
    const d = addDays(today(), i);
    const dow = new Date(d + "T00:00:00").getDay();
    const wins = pattern(dow);
    if (wins && wins.length) o[d] = wins;
  }
  return o;
};

/* ---------------- seed data (mirrors the financial model) --------------- */
const SEED = {
  business: {
    name: "Ext Professionals",
    yard: "Charlotte, NC",
    phone: "(704) 555-0100",
    pickupHours: WINDOWS,
    deposit: 500, deliveryFee: 40, contractorFee: 40, counterFee: 20, dropFee: 25, taxRate: 0.07, waiverRate: 0.12,
    refundFullHrs: 48, refundLatePct: 0.5,
    dispatchMode: "auto", counterMode: "self", bookHorizonDays: 30, rr: 0,
    agreementText: "RENTAL AGREEMENT & LIABILITY WAIVER\n\n1. TOWING. I will tow the trailer with a properly rated vehicle, hitch, and working lights/brakes, and I accept full responsibility for safe, legal towing.\n\n2. LOAD LIMITS. I will not exceed the trailer's rated payload/GVWR. Overweight fines, tickets, and resulting damage are my responsibility.\n\n3. LAWFUL DISPOSAL. I will haul and dispose of debris only at a lawful facility. No hazardous waste, liquids, tires, or prohibited materials. I am responsible for lawful disposal.\n\n4. CONDITION & RETURN. I accept the trailer in good working condition and will return it in the same condition, reasonably clean and empty, less normal wear. A quick inspection occurs at handover and return.\n\n5. LIABILITY & INDEMNITY. I assume all liability and hold the owner harmless for any injury, death, or property damage arising from my towing, hauling, or use of the trailer.\n\n6. DEPOSIT & DAMAGE. A refundable deposit hold applies. I authorize charges for damage, overweight stress, late return, or a dirty/contaminated trailer.\n\n7. OWNERSHIP. The owner retains ownership; no subletting. Governing law: North Carolina.\n\nBy signing, I confirm I have read and agree to these terms and the posted cancellation policy.",
  },
  types: [
    { size: "7x14", name: "7×14 Dump (14K GVWR)", cuyd: "7.3 cu yd", daily: 155, weekly: 580, monthly: 1880 },
    { size: "7x12", name: "7×12 Dump (9,990 GVWR)", cuyd: "6 cu yd", daily: 130, weekly: 490, monthly: 1600 },
    { size: "5x8",  name: "5×8 Dump (5K GVWR)", cuyd: "2.5 cu yd", daily: 95, weekly: 350, monthly: 1150 },
  ],
  contractors: [
    { id: "c1", name: "Marcus Reed", phone: "704-555-0301", vehicle: "F-250", active: true,
      avail: mkAvail((dow) => dow === 0 ? null : WINDOWS) },          // Mon–Sat, all windows
    { id: "c2", name: "Tanya Brooks", phone: "704-555-0302", vehicle: "Ram 2500", active: true,
      avail: mkAvail((dow) => (dow >= 1 && dow <= 5) ? ["10:00 AM", "12:00 PM", "2:00 PM"] : null) }, // weekdays midday
  ],
  trailers: [
    { id: "t1", assetId: "7x14-A", size: "7x14", vin: "1WC7X14A", maint: false },
    { id: "t2", assetId: "7x14-B", size: "7x14", vin: "1WC7X14B", maint: false },
    { id: "t3", assetId: "7x14-C", size: "7x14", vin: "1WC7X14C", maint: false },
    { id: "t4", assetId: "7x14-D", size: "7x14", vin: "1WC7X14D", maint: false },
    { id: "t5", assetId: "7x12-A", size: "7x12", vin: "1WC7X12A", maint: false },
    { id: "t6", assetId: "7x12-B", size: "7x12", vin: "1WC7X12B", maint: false },
    { id: "t7", assetId: "7x12-C", size: "7x12", vin: "1WC7X12C", maint: false },
    { id: "t8", assetId: "5x8-A", size: "5x8", vin: "1WC5X8A", maint: false },
    { id: "t9", assetId: "5x8-B", size: "5x8", vin: "1WC5X8B", maint: false },
    { id: "t10", assetId: "5x8-C", size: "5x8", vin: "1WC5X8C", maint: false },
  ],
  bookings: [
    { id: "b1", code: "WY-1001", trailerId: "t1", size: "7x14", name: "Miller Concrete", type: "commercial", phone: "704-555-0142", email: "ops@millerconcrete.co", address: "1200 Yard St, Charlotte, NC",
      start: addDays(today(), -2), end: addDays(today(), 1), pickupTime: "8:00 AM", returnTime: "4:00 PM", status: "out", waiver: true,
      outMethod: "willcall", returnMethod: "yard",
      price: 465, deposit: 500, paid: true, coi: true, signName: "Ray Miller", signedAt: "2026-07-24T13:02:00Z", notes: "Driveway tear-out, repeat account." },
    { id: "b2", code: "WY-1002", trailerId: "t5", size: "7x12", name: "Dana Whitfield", type: "homeowner", phone: "704-555-0177", email: "dana.w@email.com", address: "4418 Sharon Rd, Charlotte, NC",
      start: addDays(today(), -6), end: addDays(today(), -1), pickupTime: "10:00 AM", returnTime: "10:00 AM", status: "out", waiver: false,
      outMethod: "delivery", returnMethod: "collect", outBy: "c1", outPaid: false, returnBy: "c2", returnPaid: false,
      price: 490, deposit: 500, paid: true, coi: false, signName: "Dana Whitfield", signedAt: "2026-07-20T09:15:00Z", notes: "Storm cleanup — brush & yard waste." },
    { id: "b3", code: "WY-1003", trailerId: "t8", size: "5x8", name: "Kade Roofing", type: "commercial", phone: "704-555-0199", email: "book@kaderoofing.com", address: "88 Steele Creek Rd, Charlotte, NC",
      start: today(), end: addDays(today(), 2), pickupTime: "8:00 AM", returnTime: "2:00 PM", status: "reserved", waiver: true,
      outMethod: "willcall", returnMethod: "yard",
      price: 285, deposit: 500, paid: true, coi: true, signName: "K. Alvarez", signedAt: "2026-07-25T16:40:00Z", notes: "Tear-off shingles." },
    { id: "b4", code: "WY-1004", trailerId: "t2", size: "7x14", name: "Prieto Remodeling", type: "commercial", phone: "704-555-0121", email: "jp@prietoremodel.com", address: "701 Central Ave, Charlotte, NC",
      start: addDays(today(), 3), end: addDays(today(), 10), pickupTime: "12:00 PM", returnTime: "12:00 PM", status: "reserved", waiver: true,
      outMethod: "delivery", returnMethod: "collect", outBy: "c2", outPaid: false, returnBy: "c1", returnPaid: false,
      price: 580, deposit: 500, paid: true, coi: true, signName: "Julio Prieto", signedAt: "2026-07-25T11:20:00Z", notes: "Kitchen gut — weekly rate." },
  ],
};

/* ---------------- pricing --------------- */
function priceFor(type, days) {
  if (!type || days < 1) return 0;
  // best-of tiered: fill 4-week blocks, then weeks, then days, using the cheaper stack
  let d = days, total = 0;
  const months = Math.floor(d / 28); total += months * type.monthly; d -= months * 28;
  const weeks = Math.floor(d / 7); total += weeks * type.weekly; d -= weeks * 7;
  total += d * type.daily;
  // guard: never charge more than next tier up
  total = Math.min(total, Math.ceil(days / 28) * type.monthly);
  if (days <= 7) total = Math.min(days * type.daily, type.weekly);
  return Math.round(total);
}

/* ---------------- storage --------------- */
const KEY = "yardhand_state_v1";
async function loadState() {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
async function saveState(s) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* best-effort */ }
}

/* =====================================================================
   APP
===================================================================== */
export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("owner"); // owner | customer | landing
  const [custStart, setCustStart] = useState("book"); // initial customer view
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);   // booking detail modal
  const [extend, setExtend] = useState(null);   // extend modal

  useEffect(() => {
    (async () => {
      const s = await loadState();
      setState(s || SEED);
      setLoading(false);
    })();
  }, []);
  useEffect(() => { if (state && !loading) saveState(state); }, [state, loading]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  if (loading || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.paper }}>
        <div className="flex items-center gap-3" style={{ color: T.steel }}>
          <Truck className="animate-pulse" size={28} />
          <span className="font-semibold tracking-wide">Loading the yard…</span>
        </div>
      </div>
    );
  }

  const typeBySize = (sz) => state.types.find((t) => t.size === sz);

  /* derive status for a trailer on a given day */
  const trailerStatus = (tr) => {
    if (tr.maint) return "maintenance";
    const bs = state.bookings.filter((b) => b.trailerId === tr.id && b.status !== "returned" && b.status !== "cancelled");
    const out = bs.find((b) => b.status === "out");
    if (out) return out.end < today() ? "overdue" : "out";
    const res = bs.find((b) => b.status === "reserved" && b.start <= today() && b.end >= today());
    if (res) return "reserved";
    return "available";
  };
  const currentBooking = (tr) =>
    state.bookings.find((b) => b.trailerId === tr.id && (b.status === "out" || (b.status === "reserved" && b.start <= today() && b.end >= today())));

  /* find an available physical unit of a size for a date range */
  const findUnit = (size, start, end) => {
    const units = state.trailers.filter((t) => t.size === size && !t.maint);
    for (const u of units) {
      const clash = state.bookings.some(
        (b) => b.trailerId === u.id && b.status !== "returned" && b.status !== "cancelled" && overlaps(start, end, b.start, b.end)
      );
      if (!clash) return u;
    }
    return null;
  };
  const countAvail = (size, start, end) =>
    state.trailers.filter((t) => t.size === size && !t.maint).filter((u) =>
      !state.bookings.some((b) => b.trailerId === u.id && b.status !== "returned" && b.status !== "cancelled" && overlaps(start, end, b.start, b.end))
    ).length;

  /* mutations */
  const update = (fn) => setState((s) => { const n = structuredClone(s); fn(n); return n; });
  const addBooking = (bk) => { update((n) => n.bookings.push(bk)); };
  const setBooking = (id, patch) => update((n) => { const b = n.bookings.find((x) => x.id === id); Object.assign(b, patch); });

  return (
    <div className="min-h-screen" style={{ background: T.paper, color: T.ink, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      {mode === "landing" ? (
        <Landing state={state} typeBySize={typeBySize} go={(v) => { setCustStart(v); setMode("customer"); }} owner={() => setMode("owner")} />
      ) : (
        <>
          <TopBar state={state} mode={mode} setMode={setMode} />
          {mode === "owner" ? (
            <div className="max-w-6xl mx-auto px-4 md:px-6 pb-24">
              <OwnerNav tab={tab} setTab={setTab} />
              {tab === "dashboard" && <Dashboard {...{ state, typeBySize, trailerStatus, currentBooking, setBooking, flash, openDetail: setDetail }} />}
              {tab === "calendar" && <CalendarBoard {...{ state, trailerStatus, openDetail: setDetail }} />}
              {tab === "bookings" && <BookingsView {...{ state, typeBySize, setBooking, flash, openDetail: setDetail, openExtend: setExtend }} />}
              {tab === "drivers" && <DriversView {...{ state, setBooking, update, flash, openDetail: setDetail }} />}
              {tab === "yard" && <YardView {...{ state, setBooking, update, flash, openDetail: setDetail }} />}
              {tab === "fleet" && <FleetView {...{ state, typeBySize, trailerStatus, currentBooking, update, flash }} />}
              {tab === "settings" && <SettingsView {...{ state, setState, flash }} />}
            </div>
          ) : (
            <CustomerArea {...{ state, typeBySize, countAvail, findUnit, addBooking, setBooking, flash, setMode, initialView: custStart }} />
          )}
        </>
      )}

      {detail && <BookingDetail b={state.bookings.find((x) => x.id === detail.id) || detail} {...{ state, typeBySize, setBooking, flash }} onExtend={setExtend} onClose={() => setDetail(null)} />}
      {extend && <ExtendModal b={extend} state={state} typeBySize={typeBySize} onClose={() => setExtend(null)}
        onConfirm={(newEnd, addl, newTrailerId) => { setBooking(extend.id, newTrailerId ? { end: newEnd, price: extend.price + addl, trailerId: newTrailerId } : { end: newEnd, price: extend.price + addl }); setExtend(null); flash(newTrailerId ? `Extended & moved to a free unit · +$${addl}.` : `Extended to ${fmt(newEnd)} · +$${addl} charged to card on file.`); }} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2"
          style={{ background: T.steelDk, color: "#fff" }}>
          <Check size={16} style={{ color: T.amber }} /> <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- LANDING (public marketing page) --------------- */
function Landing({ state, typeBySize, go, owner }) {
  const b = state.business;
  const steps = [
    { icon: Truck, t: "Pick your size", d: "Choose a 5×8, 7×12, or 7×14 dump trailer for your job." },
    { icon: CalendarDays, t: "Book online", d: "Pick dates, will-call or delivery, and pay in a minute." },
    { icon: ShieldCheck, t: "Sign & go", d: "E-sign the agreement, tow it on a normal license, haul your debris." },
    { icon: RotateCcw, t: "Return it", d: "Drop it back or we collect — quick inspection and you're done." },
  ];
  const reasons = [
    ["No CDL needed", "Every trailer tows on a normal license behind a properly rated truck."],
    ["Book in a minute", "Real-time availability, instant confirmation, no phone tag."],
    ["Delivery or will-call", "Grab it from the yard or have us drop it and collect it."],
    ["Local & straightforward", `Charlotte-based, transparent pricing, ${b.phone}.`],
  ];
  return (
    <div style={{ background: T.paper, color: T.ink }}>
      {/* header */}
      <header className="sticky top-0 z-40" style={{ background: T.steelDk }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: T.amber }}><Truck size={20} style={{ color: T.steelDk }} /></div>
            <div className="leading-tight">
              <div className="font-extrabold tracking-tight text-white">{b.name}</div>
              <div className="text-[11px] uppercase tracking-widest" style={{ color: T.amber }}>{b.yard}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => go("manage")} className="px-3 py-2 rounded-lg text-sm font-bold hidden sm:block" style={{ color: "#D8DEE2" }}>Manage booking</button>
            <button onClick={() => go("book")} className="px-4 py-2 rounded-lg text-sm font-extrabold flex items-center gap-1.5" style={{ background: T.amber, color: T.steelDk }}>Book now <ArrowRight size={15} /></button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 pt-12 pb-8 md:pt-16 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold mb-4" style={{ background: T.amberSoft, color: T.amberDk }}>
            <MapPin size={12} /> Serving {b.yard} & nearby
          </div>
          <h1 className="font-extrabold tracking-tight" style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)", lineHeight: 1.02, letterSpacing: "-0.03em" }}>
            Dump trailers,<br /><span style={{ color: T.amberDk }}>ready when you are.</span>
          </h1>
          <p className="mt-4 text-base md:text-lg" style={{ color: T.sub }}>
            Rent a dump trailer for concrete, roofing, cleanouts, or yard debris. Tow it yourself or we deliver. Book online in under a minute.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button onClick={() => go("book")} className="px-5 py-3 rounded-xl text-base font-extrabold flex items-center gap-2" style={{ background: T.amber, color: T.steelDk }}>Book a trailer <ArrowRight size={17} /></button>
            <button onClick={() => go("manage")} className="px-5 py-3 rounded-xl text-base font-bold" style={{ background: "#fff", color: T.steel, border: `1px solid ${T.line}` }}>Manage my booking</button>
          </div>
          <a href={`sms:${(b.phone || "").replace(/\D/g, "")}`} className="inline-flex items-center gap-2 mt-4 px-5 py-3 rounded-xl text-base font-bold" style={{ background: T.steelDk, color: "#fff" }}>
            <Phone size={17} style={{ color: T.amber }} /> Text to book a trailer · {b.phone}
          </a>
          <div className="flex items-center gap-2 mt-4 text-sm" style={{ color: T.sub }}>
            <span style={{ color: T.amber }}>★★★★★</span> Trusted by Charlotte contractors & homeowners
          </div>
        </div>
        {/* signature: dump-trailer illustration */}
        <div className="rounded-2xl p-6 flex items-center justify-center" style={{ background: T.steelDk }}>
          <svg viewBox="0 0 340 200" className="w-full" style={{ maxWidth: 380 }}>
            <line x1="15" y1="165" x2="325" y2="165" stroke={T.amber} strokeWidth="3" />
            <g>
              <polygon points="70,150 250,150 235,70 120,70" fill="#3A4C57" stroke={T.amber} strokeWidth="3" strokeLinejoin="round" />
              <polygon points="120,70 235,70 245,95 128,95" fill={T.amber} opacity="0.9" />
              <circle cx="150" cy="120" r="9" fill="#55666F" /><circle cx="175" cy="130" r="11" fill="#4A5A63" /><circle cx="200" cy="118" r="8" fill="#55666F" />
            </g>
            <line x1="70" y1="152" x2="18" y2="152" stroke="#3A4C57" strokeWidth="6" strokeLinecap="round" />
            <circle cx="16" cy="152" r="6" fill={T.amber} />
            <circle cx="120" cy="165" r="17" fill="#1E2A32" stroke="#55666F" strokeWidth="3" /><circle cx="120" cy="165" r="5" fill={T.amber} />
            <circle cx="200" cy="165" r="17" fill="#1E2A32" stroke="#55666F" strokeWidth="3" /><circle cx="200" cy="165" r="5" fill={T.amber} />
          </svg>
        </div>
      </section>

      {/* fleet */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-10">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-center">Pick your size</h2>
        <p className="text-center mt-2 mb-8" style={{ color: T.sub }}>Three sizes, honest pricing. Rates blend down by the week and month.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {state.types.map((t, i) => (
            <div key={t.size} className="rounded-2xl p-5 flex flex-col" style={{ background: "#fff", border: `1px solid ${i === 0 ? T.amber : T.line}` }}>
              {i === 0 && <div className="inline-block self-start text-[11px] font-bold px-2 py-0.5 rounded-full mb-2" style={{ background: T.amberSoft, color: T.amberDk }}>Most popular</div>}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: T.paper }}><Truck size={24} style={{ color: T.steel }} /></div>
              <div className="font-extrabold text-lg">{t.name}</div>
              <div className="text-xs mb-3" style={{ color: T.sub }}>{t.cuyd}</div>
              <div className="flex items-baseline gap-1"><span className="text-3xl font-extrabold tabular-nums">${t.daily}</span><span className="text-sm" style={{ color: T.sub }}>/24 hrs</span></div>
              <div className="text-xs mt-1 mb-4" style={{ color: T.sub }}>${t.weekly}/week · ${t.monthly}/4 weeks</div>
              <button onClick={() => go("book")} className="mt-auto w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5" style={{ background: i === 0 ? T.amber : T.steel, color: i === 0 ? T.steelDk : "#fff" }}>Book this size <ArrowRight size={15} /></button>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section style={{ background: "#fff" }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-12">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-center mb-8">How it works</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div key={i} className="text-center px-2">
                <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: T.paper }}>
                  <s.icon size={26} style={{ color: T.amberDk }} />
                </div>
                <div className="text-xs font-bold tabular-nums mb-1" style={{ color: T.amber }}>STEP {i + 1}</div>
                <div className="font-bold">{s.t}</div>
                <div className="text-sm mt-1" style={{ color: T.sub }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* why us */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-12">
        <div className="grid md:grid-cols-2 gap-4">
          {reasons.map(([t, d]) => (
            <div key={t} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "#fff", border: `1px solid ${T.line}` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: T.amberSoft }}><Check size={17} style={{ color: T.amberDk }} /></div>
              <div><div className="font-bold">{t}</div><div className="text-sm" style={{ color: T.sub }}>{d}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 pb-14">
        <div className="rounded-2xl p-8 md:p-10 text-center" style={{ background: T.steelDk }}>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Need a trailer this week?</h2>
          <p className="mt-2" style={{ color: "#B7C0C6" }}>Check availability and book online now — or text/call {b.phone}.</p>
          <div className="flex flex-wrap gap-3 justify-center mt-5">
            <button onClick={() => go("book")} className="px-6 py-3 rounded-xl text-base font-extrabold flex items-center gap-2" style={{ background: T.amber, color: T.steelDk }}>Book a trailer <ArrowRight size={17} /></button>
            <button onClick={() => go("manage")} className="px-6 py-3 rounded-xl text-base font-bold text-white" style={{ background: "rgba(255,255,255,0.1)" }}>Manage my booking</button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer style={{ background: T.steelDk }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm" style={{ color: "#B7C0C6" }}>{b.name} · {b.yard} · {b.phone}</div>
          <button onClick={owner} className="text-xs" style={{ color: "#6C7178" }}>Owner login</button>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- top bar --------------- */
function TopBar({ state, mode, setMode }) {
  return (
    <div style={{ background: T.steelDk }} className="sticky top-0 z-40 border-b" >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: T.amber }}>
            <Truck size={20} style={{ color: T.steelDk }} />
          </div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.01em" }}>{state.business.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }}>
          <button onClick={() => setMode("landing")} className="px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5" style={{ color: "#D8DEE2" }}>
            <Home size={15} /> <span className="hidden sm:inline">Site</span>
          </button>
          {[["owner", "Owner", LayoutDashboard], ["customer", "Book a trailer", Truck]].map(([m, label, Icon]) => (
            <button key={m} onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 transition"
              style={mode === m ? { background: T.amber, color: T.steelDk } : { color: "#D8DEE2" }}>
              <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- owner nav --------------- */
function OwnerNav({ tab, setTab }) {
  const items = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["calendar", "Calendar", CalendarDays],
    ["bookings", "Bookings", ClipboardList],
    ["drivers", "Drivers & dispatch", User],
    ["yard", "Yard counter", Building2],
    ["fleet", "Fleet", Boxes],
    ["settings", "Settings", Settings],
  ];
  return (
    <div className="flex gap-1 overflow-x-auto py-4 -mx-1 px-1">
      {items.map(([id, label, Icon]) => (
        <button key={id} onClick={() => setTab(id)}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition"
          style={tab === id ? { background: T.steel, color: "#fff" } : { background: T.panel, color: T.sub, border: `1px solid ${T.line}` }}>
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- badges & cards --------------- */
function Badge({ status }) {
  const s = STATUS[status] || STATUS.available;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
    style={{ color: s.c, background: s.bg }}><CircleDot size={10} /> {s.label}</span>;
}
function Card({ children, className = "", style = {} }) {
  return <div className={`rounded-xl ${className}`} style={{ background: T.panel, border: `1px solid ${T.line}`, ...style }}>{children}</div>;
}

/* ---------------- DASHBOARD --------------- */
function Dashboard({ state, typeBySize, trailerStatus, currentBooking, setBooking, flash, openDetail }) {
  const [kpiList, setKpiList] = useState(null); // {title, items}
  const stats = useMemo(() => {
    const s = { available: 0, out: 0, reserved: 0, overdue: 0, maintenance: 0 };
    state.trailers.forEach((t) => s[trailerStatus(t)]++);
    return s;
  }, [state]);

  const monthRev = useMemo(() => {
    const m = today().slice(0, 7);
    return state.bookings.filter((b) => b.status !== "cancelled" && b.start.slice(0, 7) === m).reduce((a, b) => a + (b.price || 0), 0);
  }, [state]);

  const outNow = state.bookings.filter((b) => b.status === "out");
  const dueToday = state.bookings.filter((b) => b.status === "out" && b.end === today());
  const overdue = state.bookings.filter((b) => b.status === "out" && b.end < today());
  const pickupsToday = state.bookings.filter((b) => b.status === "reserved" && b.start === today());
  const availUnits = state.trailers.filter((t) => trailerStatus(t) === "available");
  const upcoming = state.bookings.filter((b) => b.status === "reserved" && b.start > today()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);

  const kpis = [
    { label: "Out on rent", val: stats.out + stats.overdue, icon: Truck, c: T.blue, onClick: () => setKpiList({ title: "Out on rent — return timing", items: outNow }) },
    { label: "Available", val: stats.available, icon: PackageCheck, c: T.green, onClick: () => setKpiList({ title: "Available now", units: availUnits }) },
    { label: "Due back today", val: dueToday.length, icon: CalendarClock, c: T.amberDk, onClick: () => setKpiList({ title: "Due back today", items: dueToday }) },
    { label: "Overdue", val: overdue.length, icon: AlertTriangle, c: T.red, onClick: () => setKpiList({ title: "Overdue", items: overdue }) },
  ];

  return (
    <div className="space-y-5">
      <SectionTitle>Today at the yard</SectionTitle>
      {(() => {
        const conflicts = findConflicts(state);
        if (conflicts.length === 0) return null;
        return (
          <Card className="p-4" style={{ border: `2px solid ${T.red}`, background: T.redSoft }}>
            <div className="flex items-center gap-2 mb-2"><AlertTriangle size={18} style={{ color: T.red }} />
              <span className="font-bold text-sm" style={{ color: T.red }}>Double-booking detected · {conflicts.length}</span></div>
            <div className="space-y-2">
              {conflicts.map(([a, c], i) => {
                const unit = state.trailers.find((t) => t.id === a.trailerId);
                const alt = freeUnitFor(state, c.size, c.start, c.end, c.id);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: "#fff" }}>
                    <div className="text-xs">
                      <div className="font-bold">{unit?.assetId}: {a.name} & {c.name} overlap</div>
                      <div style={{ color: T.sub }}>{fmt(a.start)}–{fmt(a.end)} vs {fmt(c.start)}–{fmt(c.end)}</div>
                    </div>
                    {alt ? (
                      <button onClick={() => { setBooking(c.id, { trailerId: alt.id }); flash(`Moved ${c.name} to ${alt.assetId}.`); }}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-md whitespace-nowrap" style={{ background: T.steel, color: "#fff" }}>Move {c.name} → {alt.assetId}</button>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ color: T.red, background: T.redSoft }}>No free unit</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <button key={k.label} onClick={k.onClick} className="text-left rounded-xl p-4 transition hover:shadow-sm" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-extrabold tabular-nums" style={{ color: T.ink }}>{k.val}</span>
              <k.icon size={22} style={{ color: k.c }} />
            </div>
            <div className="text-xs font-semibold mt-1 uppercase tracking-wide flex items-center gap-1" style={{ color: T.sub }}>{k.label} <ChevronRight size={12} /></div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-4 lg:col-span-1" style={{ background: T.steelDk }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: T.amber }}>Revenue booked · this month</div>
          <div className="text-4xl font-extrabold text-white tabular-nums">${monthRev.toLocaleString()}</div>
          <div className="text-xs mt-2" style={{ color: "#B7C0C6" }}>+ tax collected & remitted separately</div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock size={16} style={{ color: T.steel }} />
            <h3 className="font-bold text-sm uppercase tracking-wide">Pickups & returns today</h3>
          </div>
          {pickupsToday.length === 0 && dueToday.length === 0 && overdue.length === 0 ? (
            <Empty>Nothing scheduled today. The yard's quiet.</Empty>
          ) : (
            <div className="space-y-2">
              {overdue.map((b) => <TodayRow key={b.id} b={b} kind="overdue" state={state} setBooking={setBooking} flash={flash} openDetail={openDetail} />)}
              {dueToday.map((b) => <TodayRow key={b.id} b={b} kind="return" state={state} setBooking={setBooking} flash={flash} openDetail={openDetail} />)}
              {pickupsToday.map((b) => <TodayRow key={b.id} b={b} kind="pickup" state={state} setBooking={setBooking} flash={flash} openDetail={openDetail} />)}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={16} style={{ color: T.steel }} />
          <h3 className="font-bold text-sm uppercase tracking-wide">Upcoming reservations</h3>
        </div>
        {upcoming.length === 0 ? <Empty>No upcoming reservations yet.</Empty> : (
          <div className="divide-y" style={{ borderColor: T.line }}>
            {upcoming.map((b) => {
              const tr = state.trailers.find((t) => t.id === b.trailerId);
              return (
                <button key={b.id} onClick={() => openDetail(b)} className="w-full flex items-center justify-between py-2.5 text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-1.5 h-8 rounded-full" style={{ background: T.amber }} />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{b.name} {b.type === "commercial" && <Building2 size={12} className="inline" style={{ color: T.blue }} />}</div>
                      <div className="text-xs" style={{ color: T.sub }}>{tr?.assetId} · {fmtLong(b.start)} · {b.pickupTime} · {b.outMethod === "delivery" ? "we deliver" : "will-call"}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold tabular-nums flex items-center gap-1">${b.price} <ChevronRight size={14} style={{ color: T.sub }} /></div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {kpiList && (
        <Modal title={kpiList.title} onClose={() => setKpiList(null)}>
          {kpiList.units ? (
            kpiList.units.length === 0 ? <Empty>None right now.</Empty> :
            <div className="space-y-1.5">{kpiList.units.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: T.paper }}>
                <span className="font-bold text-sm tabular-nums">{u.assetId}</span><Badge status="available" />
              </div>))}</div>
          ) : kpiList.items.length === 0 ? <Empty>None right now.</Empty> : (
            <div className="space-y-1.5">
              {kpiList.items.map((b) => {
                const tr = state.trailers.find((t) => t.id === b.trailerId);
                const late = b.end < today();
                return (
                  <button key={b.id} onClick={() => { setKpiList(null); openDetail(b); }} className="w-full text-left p-3 rounded-lg flex items-center justify-between" style={{ background: T.paper }}>
                    <div>
                      <div className="font-semibold text-sm">{b.name} · <span style={{ color: T.sub }}>{tr?.assetId}</span></div>
                      <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: late ? T.red : T.sub }}>
                        <RotateCcw size={11} /> {b.returnMethod === "collect" ? "We collect" : "Returns to yard"} · {fmtLong(b.end)}{b.returnTime ? ` · ${b.returnTime}` : ""}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: T.sub }} />
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function TodayRow({ b, kind, state, setBooking, flash, openDetail }) {
  const tr = state.trailers.find((t) => t.id === b.trailerId);
  const meta = {
    pickup: { tag: "Pickup", c: T.amberDk, bg: T.amberSoft, to: "out", action: outVerb(b.outMethod), msg: `${outVerb(b.outMethod)} — trailer is out.`, sub: OUT_METHODS[b.outMethod] + " · " + b.pickupTime },
    return: { tag: "Return due", c: T.blue, bg: T.blueSoft, to: "returned", action: returnVerb(b.returnMethod), msg: `${returnVerb(b.returnMethod)} — deposit released.`, sub: RETURN_METHODS[b.returnMethod] + (b.returnTime ? " · " + b.returnTime : "") },
    overdue: { tag: "Overdue", c: T.red, bg: T.redSoft, to: "returned", action: returnVerb(b.returnMethod), msg: `${returnVerb(b.returnMethod)} — deposit released.`, sub: RETURN_METHODS[b.returnMethod] + " · was due " + fmt(b.end) },
  }[kind];
  return (
    <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: meta.bg }}>
      <button onClick={() => openDetail(b)} className="flex items-center gap-2.5 min-w-0 text-left flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ color: "#fff", background: meta.c }}>{meta.tag}</span>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{b.name} · <span style={{ color: T.sub }}>{tr?.assetId}</span></div>
          <div className="text-xs truncate" style={{ color: T.sub }}>{meta.sub}{b.type === "commercial" && !b.coi ? " · ⚠ COI missing" : ""}</div>
        </div>
      </button>
      <button onClick={() => { setBooking(b.id, { status: meta.to }); flash(meta.msg); }}
        className="text-xs font-bold px-2.5 py-1.5 rounded-md whitespace-nowrap flex items-center gap-1 shrink-0"
        style={{ background: T.steel, color: "#fff" }}>
        {kind === "pickup" ? <Truck size={12} /> : <RotateCcw size={12} />} {meta.action}
      </button>
    </div>
  );
}

/* ---------------- CALENDAR BOARD (14-day timeline per unit) --------------- */
function CalendarBoard({ state, trailerStatus, openDetail }) {
  const start = today();
  const horizon = state.business.bookHorizonDays || 30;
  const days = Array.from({ length: horizon }, (_, i) => addDays(start, i));
  const bookingFor = (tr, day) =>
    state.bookings.find((b) => b.trailerId === tr.id && b.status !== "returned" && b.status !== "cancelled" && day >= b.start && day <= b.end);

  return (
    <div className="space-y-4">
      <SectionTitle>Availability board · next {horizon} days</SectionTitle>
      <Card className="p-3 overflow-x-auto">
        <div style={{ minWidth: 60 + horizon * 34 }}>
          <div className="grid" style={{ gridTemplateColumns: `120px repeat(${horizon}, 1fr)` }}>
            <div />
            {days.map((d, i) => (
              <div key={d} className="text-center pb-2">
                <div className="text-[10px] font-bold uppercase" style={{ color: i === 0 ? T.amberDk : T.sub }}>
                  {new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
                </div>
                <div className="text-xs font-semibold tabular-nums" style={{ color: i === 0 ? T.ink : T.sub }}>
                  {new Date(d + "T00:00:00").getDate()}
                </div>
              </div>
            ))}
          </div>
          {state.trailers.map((tr) => (
            <div key={tr.id} className="grid items-center" style={{ gridTemplateColumns: `120px repeat(${horizon}, 1fr)`, height: 34 }}>
              <div className="flex items-center gap-1.5 pr-2">
                <span className="font-bold text-xs tabular-nums">{tr.assetId}</span>
              </div>
              {days.map((d) => {
                const b = bookingFor(tr, d);
                const st = tr.maint ? STATUS.maintenance : b ? (b.status === "out" ? (b.end < today() ? STATUS.overdue : STATUS.out) : STATUS.reserved) : null;
                return (
                  <div key={d} className="h-full flex items-center px-0.5">
                    <div onClick={() => b && openDetail(b)} className="w-full rounded" style={{ height: 20, background: st ? st.c : T.graySoft, opacity: st ? 0.9 : 0.5, cursor: b ? "pointer" : "default" }}
                      title={b ? `${b.name} (${b.start}→${b.end}) — click for detail` : tr.maint ? "Down for maintenance" : "Available"} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
      <div className="flex flex-wrap gap-3 text-xs" style={{ color: T.sub }}>
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: s.c }} /> {s.label}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- BOOKINGS --------------- */
function BookingsView({ state, typeBySize, setBooking, flash, openDetail, openExtend }) {
  const [filter, setFilter] = useState("active");

  const rows = useMemo(() => {
    let bs = [...state.bookings].sort((a, b) => b.start.localeCompare(a.start));
    if (filter === "active") bs = bs.filter((b) => b.status === "out" || b.status === "reserved");
    if (filter === "overdue") bs = bs.filter((b) => b.status === "out" && b.end < today());
    if (filter === "completed") bs = bs.filter((b) => b.status === "returned");
    if (filter === "cancelled") bs = bs.filter((b) => b.status === "cancelled");
    return bs;
  }, [state, filter]);

  const filters = [["active", "Active"], ["overdue", "Overdue"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All"]];

  return (
    <div className="space-y-4">
      <SectionTitle>Bookings</SectionTitle>
      <div className="flex gap-1.5 flex-wrap">
        {filters.map(([id, l]) => (
          <button key={id} onClick={() => setFilter(id)} className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={filter === id ? { background: T.steel, color: "#fff" } : { background: T.panel, color: T.sub, border: `1px solid ${T.line}` }}>{l}</button>
        ))}
      </div>
      {rows.length === 0 ? <Card className="p-6"><Empty>No bookings in this view.</Empty></Card> : (
        <div className="space-y-2">
          {rows.map((b) => {
            const tr = state.trailers.find((t) => t.id === b.trailerId);
            const status = b.status === "out" && b.end < today() ? "overdue" : b.status === "out" ? "out" : b.status === "reserved" ? "reserved" : b.status;
            const days = daysBetween(b.start, b.end);
            const usLegs = (b.outMethod === "delivery" ? 1 : 0) + (b.returnMethod === "collect" ? 1 : 0);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <button onClick={() => openDetail(b)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{b.name}</span>
                      {b.type === "commercial" ? <Building2 size={14} style={{ color: T.blue }} /> : <User size={14} style={{ color: T.sub }} />}
                      {b.status !== "returned" && b.status !== "cancelled" && <Badge status={status} />}
                      {b.status === "returned" && <Badge status="available" />}
                      <ChevronRight size={14} style={{ color: T.sub }} />
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-3 flex-wrap" style={{ color: T.sub }}>
                      <span className="flex items-center gap-1"><Truck size={12} /> {tr?.assetId}</span>
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {fmt(b.start)} → {fmt(b.end)} ({days}d)</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {b.pickupTime}</span>
                    </div>
                    <div className="text-xs mt-1.5 flex items-center gap-2 flex-wrap">
                      <Tag on onLabel={b.outMethod === "delivery" ? "We deliver" : "Will-call out"} />
                      <Tag on onLabel={b.returnMethod === "collect" ? "We collect" : "Yard return"} />
                      {b.waiver && <Tag on onLabel="Waiver" />}
                      {b.type === "commercial" && <Tag on={b.coi} onLabel="COI" offLabel="No COI" warn={!b.coi} />}
                      {b.signName ? <Tag on onLabel="Signed" /> : <Tag on={false} offLabel="Unsigned" warn />}
                      {usLegs > 0 && <Tag on onLabel={`${usLegs} contractor run${usLegs > 1 ? "s" : ""}`} />}
                    </div>
                  </button>
                  <div className="text-right">
                    <div className="text-lg font-extrabold tabular-nums">${b.price}</div>
                    {(b.status === "out" || b.status === "reserved") && (
                      <div className="flex gap-1.5 mt-2 justify-end flex-wrap">
                        {b.status === "reserved" && <MiniBtn onClick={() => { setBooking(b.id, { status: "out" }); flash(`${outVerb(b.outMethod)}.`); }} icon={Truck}>{b.outMethod === "delivery" ? "Delivered" : "Picked up"}</MiniBtn>}
                        {b.status === "out" && <MiniBtn onClick={() => { setBooking(b.id, { status: "returned" }); flash("Returned — deposit released."); }} icon={RotateCcw}>{b.returnMethod === "collect" ? "Collected" : "Returned"}</MiniBtn>}
                        <MiniBtn onClick={() => openExtend(b)} icon={CalendarClock}>Extend</MiniBtn>
                        <MiniBtn onClick={() => { const rf = cancelRefund(b, state.business); setBooking(b.id, { status: "cancelled" }); flash(`Cancelled · $${rf.amt} refunded.`); }} icon={X} danger>Cancel</MiniBtn>
                      </div>
                    )}
                  </div>
                </div>
                {b.notes && <div className="text-xs mt-2 pt-2 border-t" style={{ color: T.sub, borderColor: T.line }}>{b.notes}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExtendModal({ b, state, typeBySize, onClose, onConfirm }) {
  const [addDaysN, setAddDaysN] = useState(2);
  const type = typeBySize(b.size);
  const newEnd = addDays(b.end, addDaysN);
  const conflict = state.bookings.some((x) => x.id !== b.id && x.trailerId === b.trailerId && x.status !== "returned" && x.status !== "cancelled" && overlaps(addDays(b.end, 1), newEnd, x.start, x.end));
  // if current unit is taken, is another same-size unit free for the whole extended window?
  const swapUnit = conflict ? freeUnitFor(state, b.size, b.start, newEnd, b.id) : null;
  const addl = priceFor(type, daysBetween(b.start, newEnd)) - priceFor(type, daysBetween(b.start, b.end));
  const curAsset = state.trailers.find((t) => t.id === b.trailerId)?.assetId;
  return (
    <Modal onClose={onClose} title="Extend rental">
      <p className="text-sm" style={{ color: T.sub }}>Extend <b style={{ color: T.ink }}>{b.name}</b>'s rental of <b style={{ color: T.ink }}>{curAsset}</b>.</p>
      <div className="my-4">
        <label className="text-xs font-bold uppercase tracking-wide" style={{ color: T.sub }}>Add days</label>
        <div className="flex items-center gap-2 mt-2">
          {[1, 2, 3, 7, 14].map((n) => (
            <button key={n} onClick={() => setAddDaysN(n)} className="px-3 py-1.5 rounded-lg text-sm font-bold"
              style={addDaysN === n ? { background: T.amber, color: T.steelDk } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>+{n}</button>
          ))}
        </div>
      </div>
      <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: T.paper }}>
        <Row l="New return date" r={fmtLong(newEnd)} />
        <Row l="Additional charge" r={`$${addl}`} bold />
        <Row l="Deposit hold" r={`extends to $${b.deposit}`} />
      </div>
      {!conflict ? (
        <button onClick={() => onConfirm(newEnd, addl, null)} className="w-full mt-4 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2"
          style={{ background: T.steel, color: "#fff" }}>
          <CreditCard size={16} /> Charge ${addl} & extend
        </button>
      ) : swapUnit ? (
        <>
          <div className="mt-3 p-3 rounded-lg text-sm flex items-start gap-2" style={{ background: T.amberSoft, color: T.amberDk }}>
            <RotateCcw size={16} className="shrink-0 mt-0.5" /> {curAsset} is booked right after. Another {b.size} ({swapUnit.assetId}) is free for the whole window — extend by moving to it.
          </div>
          <button onClick={() => onConfirm(newEnd, addl, swapUnit.id)} className="w-full mt-3 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2" style={{ background: T.steel, color: "#fff" }}>
            <CreditCard size={16} /> Move to {swapUnit.assetId} & extend
          </button>
        </>
      ) : (
        <div className="mt-3 p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: T.redSoft, color: T.red }}>
          <AlertTriangle size={16} /> {curAsset} is booked next and every other {b.size} is taken for those dates — can't extend. Hold the return date.
        </div>
      )}
    </Modal>
  );
}

/* ---------------- FLEET --------------- */
function FleetView({ state, typeBySize, trailerStatus, currentBooking, update, flash }) {
  const [adding, setAdding] = useState(false);
  const bySize = state.types.map((t) => ({ ...t, units: state.trailers.filter((tr) => tr.size === t.size) }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Fleet · {state.trailers.length} trailers</SectionTitle>
        <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5" style={{ background: T.amber, color: T.steelDk }}>
          <Plus size={16} /> Add trailer
        </button>
      </div>
      {bySize.map((grp) => (
        <Card key={grp.size} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold">{grp.name}</h3>
              <div className="text-xs" style={{ color: T.sub }}>{grp.cuyd} · ${grp.daily}/24hr · ${grp.weekly}/wk · ${grp.monthly}/4wk</div>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: T.paper, color: T.sub }}>{grp.units.length} units</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {grp.units.map((tr) => {
              const st = trailerStatus(tr);
              const cb = currentBooking(tr);
              return (
                <div key={tr.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: T.paper }}>
                  <div>
                    <div className="font-bold text-sm tabular-nums">{tr.assetId}</div>
                    <div className="text-xs" style={{ color: T.sub }}>{cb ? `${cb.name} · back ${fmt(cb.end)}` : `VIN ${tr.vin}`}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={st} />
                    <button onClick={() => { update((n) => { n.trailers.find((x) => x.id === tr.id).maint = !tr.maint; }); flash(tr.maint ? "Back in service." : "Marked down for maintenance."); }}
                      title="Toggle maintenance" className="p-1.5 rounded-md" style={{ background: tr.maint ? T.amber : "transparent", color: tr.maint ? T.steelDk : T.sub, border: `1px solid ${T.line}` }}>
                      <Wrench size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      {adding && <AddTrailerModal state={state} onClose={() => setAdding(false)}
        onAdd={(tr) => { update((n) => n.trailers.push(tr)); setAdding(false); flash(`Added ${tr.assetId}.`); }} />}
    </div>
  );
}

function AddTrailerModal({ state, onClose, onAdd }) {
  const [size, setSize] = useState(state.types[0].size);
  const [assetId, setAssetId] = useState("");
  const [vin, setVin] = useState("");
  return (
    <Modal onClose={onClose} title="Add a trailer">
      <div className="space-y-3">
        <Field label="Size">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
            {state.types.map((t) => <option key={t.size} value={t.size}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Asset ID"><input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="e.g. 7x14-E" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="VIN / serial"><input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="optional" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
      </div>
      <button disabled={!assetId} onClick={() => onAdd({ id: "t" + Date.now(), size, assetId, vin: vin || "—", maint: false })}
        className="w-full mt-4 py-2.5 rounded-lg font-bold disabled:opacity-40" style={{ background: T.steel, color: "#fff" }}>Add to fleet</button>
    </Modal>
  );
}

/* ---------------- DRIVERS & PAY --------------- */
function DriversView({ state, setBooking, update, flash, openDetail }) {
  const [adding, setAdding] = useState(false);
  const [editAvail, setEditAvail] = useState(null); // {driverId, date}
  const runs = legRuns(state);
  const fee = state.business.contractorFee;
  const owedTotal = runs.filter((r) => r.by && !r.paid).length * fee;
  const unassigned = runs.filter((r) => !r.by).sort((a, b) => a.date.localeCompare(b.date));
  const auto = state.business.dispatchMode === "auto";

  const reassign = (r, cid) => setBooking(r.bookingId, r.leg === "out" ? { outBy: cid } : { returnBy: cid });
  const markPaid = (r) => setBooking(r.bookingId, r.leg === "out" ? { outPaid: true } : { returnPaid: true });
  const setMode = (m) => update((n) => { n.business.dispatchMode = m; });

  const assignOne = (r, rot = 0) => {
    const cid = assignRun(state, r.date, r.time, null, rot);
    if (!cid) { flash("No available driver for that day/time — adjust availability or pick manually."); return; }
    reassign(r, cid);
  };
  /* out sick for ONE day: clear today's availability and auto-reassign today's runs + counter handoffs
     to the next available person (works for both driver runs and counter handoffs). Rest of their schedule is untouched. */
  const sickDay = (id, name) => {
    let s = structuredClone(state);
    const c = s.contractors.find((x) => x.id === id);
    if (c && c.avail) delete c.avail[today()]; // off for today only, so they're not re-picked
    let rot = Date.now(), moved = 0, orphan = 0;
    s.bookings.forEach((b) => {
      if (b.status === "returned" || b.status === "cancelled") return;
      if (b.outBy === id && !b.outPaid && b.start === today()) {
        const cid = assignRun(s, b.start, b.pickupTime, id, rot++);
        b.outBy = cid; cid ? moved++ : orphan++;
      }
      if (b.returnBy === id && !b.returnPaid && b.end === today()) {
        const cid = assignRun(s, b.end, b.returnTime || b.pickupTime, id, rot++);
        b.returnBy = cid; cid ? moved++ : orphan++;
      }
    });
    update((n) => { n.contractors = s.contractors; n.bookings = s.bookings; });
    flash(`${name} out today · ${moved} job${moved !== 1 ? "s" : ""} reassigned${orphan ? ` · ${orphan} need a hand (no one free)` : ""}.`);
  };
  /* longer absence: toggle inactive and, when going inactive, free their upcoming unpaid work to requeue */
  const toggleActive = (c) => update((n) => {
    const d = n.contractors.find((x) => x.id === c.id);
    d.active = !c.active;
    if (!d.active) n.bookings.forEach((b) => {
      if (b.status === "returned" || b.status === "cancelled") return;
      if (b.outBy === c.id && !b.outPaid) b.outBy = null;
      if (b.returnBy === c.id && !b.returnPaid) b.returnBy = null;
    });
  });
  const autoAssignAll = () => {
    let s = structuredClone(state);
    let rot = 0;
    legRuns(s).filter((r) => !r.by).forEach((r) => {
      const cid = assignRun(s, r.date, r.time, null, rot++);
      if (!cid) return;
      const bk = s.bookings.find((x) => x.id === r.bookingId);
      if (r.leg === "out") bk.outBy = cid; else bk.returnBy = cid;
    });
    update((n) => { n.bookings = s.bookings; });
    flash("Auto-assigned every coverable run to available drivers.");
  };

  const horizon = state.business.bookHorizonDays || 30;
  const days = Array.from({ length: horizon }, (_, i) => addDays(today(), i));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Drivers & dispatch</SectionTitle>
        <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5" style={{ background: T.amber, color: T.steelDk }}>
          <Plus size={16} /> Add driver
        </button>
      </div>

      {/* dispatch mode */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-bold">Dispatch mode</div>
            <div className="text-xs" style={{ color: T.sub }}>{auto ? "Round-robin auto-assigns each run to an available driver as bookings come in." : "New runs wait in the queue below for you to assign."}</div>
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: T.graySoft }}>
            {[["auto", "Auto (round-robin)"], ["manual", "Manual"]].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className="px-3 py-1.5 rounded-md text-xs font-bold"
                style={state.business.dispatchMode === m ? { background: "#fff", color: T.ink } : { color: T.sub }}>{l}</button>
            ))}
          </div>
        </div>
      </Card>

      {/* owed summary */}
      <Card className="p-4" style={{ background: T.steelDk }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: T.amber }}>You owe drivers</div>
            <div className="text-4xl font-extrabold text-white tabular-nums">${owedTotal}</div>
            <div className="text-xs mt-1" style={{ color: "#B7C0C6" }}>{runs.filter((r) => r.by && !r.paid).length} unpaid runs · ${fee} per run</div>
          </div>
          <div className="text-right text-xs max-w-[220px]" style={{ color: "#B7C0C6" }}>
            <CreditCard size={18} style={{ color: T.amber }} className="inline mb-1" /><br />
            Pay drivers in Stripe, then mark runs paid here to clear the balance.
          </div>
        </div>
      </Card>

      {/* NEEDS DISPATCH queue */}
      {unassigned.length > 0 && (
        <Card className="p-4" style={{ border: `1px solid ${T.amber}` }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><AlertTriangle size={16} style={{ color: T.amberDk }} />
              <span className="text-sm font-bold">Needs dispatch · {unassigned.length}</span></div>
            <button onClick={autoAssignAll} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: T.amber, color: T.steelDk }}>Auto-assign all</button>
          </div>
          <div className="space-y-1.5">
            {unassigned.map((r) => {
              const avail = availableDrivers(state, r.date, r.time, null);
              return (
                <div key={r.key} className="flex items-center justify-between gap-2 p-2 rounded-lg" style={{ background: T.paper }}>
                  <button onClick={() => openDetail(state.bookings.find((x) => x.id === r.bookingId))} className="flex items-center gap-2 min-w-0 text-left">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: "#fff", background: r.leg === "out" ? T.amberDk : T.blue }}>{r.label}</span>
                    <div className="min-w-0"><div className="text-sm font-semibold truncate">{r.name}</div>
                      <div className="text-xs" style={{ color: T.sub }}>{fmt(r.date)} · {r.time}</div></div>
                  </button>
                  {avail.length === 0 ? (
                    <span className="text-[11px] font-bold px-2 py-1 rounded shrink-0" style={{ color: T.red, background: T.redSoft }}>No driver free</span>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select defaultValue="" onChange={(e) => e.target.value && reassign(r, e.target.value)} className="text-[11px] rounded px-1 py-1" style={{ border: `1px solid ${T.line}`, color: T.sub }}>
                        <option value="">Assign…</option>
                        {avail.map((x) => <option key={x.id} value={x.id}>{x.name.split(" ")[0]}</option>)}
                      </select>
                      <button onClick={() => assignOne(r, Date.now())} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.steel, color: "#fff" }}>Auto</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* AVAILABILITY GRID (full booking horizon) */}
      <Card className="p-3 overflow-x-auto">
        <div className="text-sm font-bold mb-2 px-1">Workforce schedule · next {horizon} days <span className="font-normal text-xs" style={{ color: T.sub }}>(tap a cell to edit availability)</span></div>
        <div style={{ minWidth: 60 + horizon * 30 }}>
          <div className="grid" style={{ gridTemplateColumns: `110px repeat(${horizon}, 1fr)` }}>
            <div />
            {days.map((d, i) => (
              <div key={d} className="text-center pb-1">
                <div className="text-[10px] font-bold uppercase" style={{ color: i === 0 ? T.amberDk : T.sub }}>{new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}</div>
                <div className="text-xs font-semibold tabular-nums" style={{ color: i === 0 ? T.ink : T.sub }}>{new Date(d + "T00:00:00").getDate()}</div>
              </div>
            ))}
          </div>
          {state.contractors.map((c) => (
            <div key={c.id} className="grid items-center" style={{ gridTemplateColumns: `110px repeat(${horizon}, 1fr)`, height: 34 }}>
              <div className="text-xs font-bold truncate pr-2">{c.name.split(" ")[0]} {!c.active && <span style={{ color: T.sub }}>·off</span>}</div>
              {days.map((d) => {
                const wins = (c.avail && c.avail[d]) || [];
                const dayRuns = runs.filter((r) => r.by === c.id && r.date === d);
                const cover = wins.length;
                return (
                  <div key={d} className="h-full flex items-center px-0.5">
                    <button onClick={() => setEditAvail({ driverId: c.id, date: d })} title={`${wins.length} windows${dayRuns.length ? " · " + dayRuns.length + " run(s)" : ""}`}
                      className="w-full rounded flex items-center justify-center" style={{ height: 24, background: !c.active ? T.graySoft : cover === 0 ? "#F3EFE8" : cover >= 4 ? T.green : cover >= 2 ? "#8FBF6F" : T.amber, opacity: c.active ? 1 : 0.5 }}>
                      {dayRuns.length > 0 && <span className="text-[9px] font-bold" style={{ color: "#fff" }}>{dayRuns.length}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] mt-2 px-1" style={{ color: T.sub }}>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: T.green }} /> full day</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: T.amber }} /> limited</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#F3EFE8" }} /> off</span>
          <span>number = runs assigned</span>
        </div>
      </Card>

      {/* per-driver runs & pay */}
      {state.contractors.map((c) => {
        const cr = runs.filter((r) => r.by === c.id).sort((a, b) => a.date.localeCompare(b.date));
        const owed = cr.filter((r) => !r.paid).length * fee;
        return (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ background: c.active ? T.steel : T.graySoft, color: c.active ? "#fff" : T.sub }}>
                  {c.name.split(" ").map((w) => w[0]).join("")}
                </div>
                <div>
                  <div className="font-bold text-sm">{c.name} {!c.active && <span className="text-xs font-normal" style={{ color: T.sub }}>· inactive</span>}</div>
                  <div className="text-xs" style={{ color: T.sub }}>{c.vehicle} · {c.phone}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-extrabold tabular-nums" style={{ color: owed ? T.ink : T.sub }}>${owed} owed</div>
                <div className="flex gap-2 justify-end">
                  {c.active && <button onClick={() => sickDay(c.id, c.name.split(" ")[0])} className="text-[11px] font-bold" style={{ color: T.red }}>sick today</button>}
                  <button onClick={() => toggleActive(c)} className="text-[11px] font-bold" style={{ color: T.sub }}>{c.active ? "set inactive" : "set active"}</button>
                </div>
              </div>
            </div>
            {cr.length === 0 ? <div className="text-xs py-2" style={{ color: T.sub }}>No runs assigned.</div> : (
              <div className="space-y-1.5">
                {cr.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-2 p-2 rounded-lg" style={{ background: T.paper }}>
                    <button onClick={() => openDetail(state.bookings.find((b) => b.id === r.bookingId))} className="flex items-center gap-2 min-w-0 text-left">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: "#fff", background: r.leg === "out" ? T.amberDk : T.blue }}>{r.label}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{r.name}</div>
                        <div className="text-xs" style={{ color: T.sub }}>{fmt(r.date)}{r.time ? ` · ${r.time}` : ""}</div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.paid ? <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ color: T.green, background: T.greenSoft }}>Paid</span>
                        : <>
                          <select value={r.by} onChange={(e) => reassign(r, e.target.value)} className="text-[11px] rounded px-1 py-1" style={{ border: `1px solid ${T.line}`, color: T.sub }}>
                            {state.contractors.filter((x) => x.active || x.id === r.by).map((x) => <option key={x.id} value={x.id}>{x.name.split(" ")[0]}</option>)}
                          </select>
                          <button onClick={() => markPaid(r)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.steel, color: "#fff" }}>Mark paid ${fee}</button>
                        </>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-center" style={{ color: T.sub }}>Round-robin pulls only from drivers available that day/time and spreads jobs evenly. Switch to Manual to assign every run yourself. Collection runs are scheduled to the return date — long rentals just book a driver for a slot ~a month out.</p>

      {adding && <AddContractorModal onClose={() => setAdding(false)}
        onAdd={(c) => { update((n) => n.contractors.push(c)); setAdding(false); flash(`Added ${c.name}.`); }} />}
      {editAvail && <AvailabilityEditor {...editAvail} state={state} update={update} onClose={() => setEditAvail(null)} />}
    </div>
  );
}

function AvailabilityEditor({ driverId, date, state, update, onClose }) {
  const c = state.contractors.find((x) => x.id === driverId);
  const wins = (c.avail && c.avail[date]) || [];
  const toggle = (w) => update((n) => {
    const d = n.contractors.find((x) => x.id === driverId);
    if (!d.avail) d.avail = {};
    const cur = d.avail[date] || [];
    d.avail[date] = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w].sort((a, b) => WINDOWS.indexOf(a) - WINDOWS.indexOf(b));
    if (d.avail[date].length === 0) delete d.avail[date];
  });
  const runs = legRuns(state).filter((r) => r.by === driverId && r.date === date);
  return (
    <Modal onClose={onClose} title={`${c.name} · ${fmtLong(date)}`}>
      <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: T.sub }}>Available windows</div>
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <button key={w} onClick={() => toggle(w)} className="px-3 py-1.5 rounded-lg text-sm font-bold"
            style={wins.includes(w) ? { background: T.green, color: "#fff" } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>{w}</button>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color: T.sub }}>Green = available. Only available windows can be booked for delivery/collect, and round-robin only assigns runs a driver is available for.</p>
      {runs.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.sub }}>Assigned this day</div>
          {runs.map((r) => <div key={r.key} className="text-sm py-0.5">{r.label} · {r.name} · {r.time}</div>)}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- YARD COUNTER (will-call pickups & yard returns) --------------- */
function YardView({ state, setBooking, update, flash, openDetail }) {
  const fee = state.business.counterFee;
  const auto = state.business.counterMode === "auto";
  const events = yardEvents(state).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const staff = state.contractors.filter((c) => c.active);
  const nameOf = (id) => id === "owner" ? "You" : (state.contractors.find((c) => c.id === id)?.name.split(" ")[0] || "—");

  const owedBy = {};
  events.forEach((e) => { if (e.by && e.by !== "owner" && !e.paid) owedBy[e.by] = (owedBy[e.by] || 0) + fee; });
  const owedTotal = Object.values(owedBy).reduce((a, b) => a + b, 0);

  const setStaff = (e, id) => setBooking(e.bookingId, e.leg === "out" ? { outBy: id } : { returnBy: id });
  const markPaid = (e) => setBooking(e.bookingId, e.leg === "out" ? { outPaid: true } : { returnPaid: true });
  const setMode = (m) => update((n) => { n.business.counterMode = m; });
  const assignAuto = (e, rot = Date.now()) => {
    const cid = assignRun(state, e.date, e.time, null, rot);
    if (!cid) { flash("No staff available for that day/time — you'll cover it, or adjust availability."); return; }
    setStaff(e, cid);
  };
  const autoAssignAll = () => {
    let s = structuredClone(state); let rot = 0; let n = 0;
    yardEvents(s).filter((e) => !e.by || e.by === "owner").forEach((e) => {
      const cid = assignRun(s, e.date, e.time, null, rot++);
      if (!cid) return;
      const bk = s.bookings.find((x) => x.id === e.bookingId);
      if (e.leg === "out") bk.outBy = cid; else bk.returnBy = cid;
      n++;
    });
    update((nn) => { nn.bookings = s.bookings; });
    flash(n ? `Auto-assigned ${n} handoff${n > 1 ? "s" : ""} to available staff.` : "No coverable handoffs to assign.");
  };

  const todays = events.filter((e) => e.date === today());
  const upcoming = events.filter((e) => e.date > today() && (e.status === "reserved" || e.status === "out"));

  const EventRow = ({ e }) => {
    const avail = availableDrivers(state, e.date, e.time, null);
    return (
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: T.paper }}>
        <button onClick={() => openDetail(state.bookings.find((x) => x.id === e.bookingId))} className="flex items-center gap-2 min-w-0 text-left">
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: "#fff", background: e.leg === "out" ? T.amberDk : T.blue }}>{e.leg === "out" ? "Pickup" : "Return"}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{e.name}</div>
            <div className="text-xs" style={{ color: T.sub }}>{fmt(e.date)}{e.time ? ` · ${e.time}` : ""}</div>
          </div>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {e.paid ? <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ color: T.green, background: T.greenSoft }}>Paid</span> : <>
            <select value={e.by || "owner"} onChange={(ev) => setStaff(e, ev.target.value)} className="text-[11px] rounded px-1 py-1" style={{ border: `1px solid ${T.line}`, color: T.sub }}>
              <option value="owner">You</option>
              {staff.map((c) => <option key={c.id} value={c.id} disabled={!avail.some((a) => a.id === c.id)}>{c.name.split(" ")[0]}{avail.some((a) => a.id === c.id) ? "" : " (off)"}</option>)}
            </select>
            {(!e.by || e.by === "owner") && avail.length > 0 && <button onClick={() => assignAuto(e)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.steel, color: "#fff" }}>Auto</button>}
            {e.by && e.by !== "owner" && <button onClick={() => markPaid(e)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.steel, color: "#fff" }}>Paid ${fee}</button>}
          </>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Yard counter</SectionTitle>
      <Card className="p-4" style={{ background: T.blueSoft }}>
        <div className="text-sm" style={{ color: T.blue }}>
          <b>Will-call pickups and yard returns</b> are counter appointments — someone has to be at the yard to hand off or receive the trailer and do the inspection. Assign each to <b>You</b> or a staff member. Anyone other than you earns the ${fee} counter fee, tracked below.
        </div>
      </Card>

      {/* counter dispatch mode */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-bold">Who covers the counter?</div>
            <div className="text-xs" style={{ color: T.sub }}>{auto ? "New handoffs auto-assign (round-robin) to available staff." : "You cover handoffs by default; assign staff as needed."}</div>
          </div>
          <div className="flex items-center gap-2">
            {events.some((e) => (!e.by || e.by === "owner") && !e.paid) && <button onClick={autoAssignAll} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: T.amber, color: T.steelDk }}>Auto-assign all</button>}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: T.graySoft }}>
              {[["self", "I cover it"], ["auto", "Auto to staff"]].map(([m, l]) => (
                <button key={m} onClick={() => setMode(m)} className="px-3 py-1.5 rounded-md text-xs font-bold" style={state.business.counterMode === m ? { background: "#fff", color: T.ink } : { color: T.sub }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* owed for counter work */}
      <Card className="p-4" style={{ background: T.steelDk }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: T.amber }}>You owe (counter work)</div>
            <div className="text-4xl font-extrabold text-white tabular-nums">${owedTotal}</div>
            <div className="text-xs mt-1" style={{ color: "#B7C0C6" }}>${fee} per handoff · anything you cover yourself is $0</div>
          </div>
          <div className="text-right text-xs max-w-[220px]" style={{ color: "#B7C0C6" }}>
            <CreditCard size={18} style={{ color: T.amber }} className="inline mb-1" /><br />
            Pay staff in Stripe, then mark handoffs paid to clear the balance — same 1099 rules as drivers.
          </div>
        </div>
        {Object.keys(owedBy).length > 0 && (
          <div className="mt-3 pt-3 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            {Object.entries(owedBy).map(([id, amt]) => (
              <div key={id} className="flex justify-between text-sm text-white"><span>{nameOf(id)}</span><span className="tabular-nums font-bold">${amt}</span></div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-bold mb-2">Today at the counter · {todays.length}</div>
        {todays.length === 0 ? <Empty>No will-call pickups or yard returns today.</Empty> : (
          <div className="space-y-1.5">{todays.map((e) => <EventRow key={e.key} e={e} />)}</div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-bold mb-2">Upcoming counter appointments · {upcoming.length}</div>
        {upcoming.length === 0 ? <Empty>Nothing scheduled ahead.</Empty> : (
          <div className="space-y-1.5">{upcoming.slice(0, 20).map((e) => <EventRow key={e.key} e={e} />)}</div>
        )}
      </Card>

      <p className="text-xs text-center" style={{ color: T.sub }}>Every will-call pickup and yard return is a staffed handoff with the inspection-and-photos step. Assign who covers it; the counter fee tracks like driver pay so you always know who's owed.</p>
    </div>
  );
}

function AddContractorModal({ onClose, onAdd }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [vehicle, setVehicle] = useState("");
  return (
    <Modal onClose={onClose} title="Add a driver">
      <div className="space-y-3">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Tow vehicle"><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. F-250" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
      </div>
      <p className="text-xs mt-3" style={{ color: T.sub }}>At launch, collect a signed contractor agreement, W-9, and COI before their first run (see the guide). You'll 1099 anyone paid $600+/yr.</p>
      <button disabled={!name} onClick={() => onAdd({ id: "c" + Date.now(), name, phone, vehicle: vehicle || "—", active: true })}
        className="w-full mt-4 py-2.5 rounded-lg font-bold disabled:opacity-40" style={{ background: T.steel, color: "#fff" }}>Add driver</button>
    </Modal>
  );
}

/* ---------------- SETTINGS --------------- */
function SettingsView({ state, setState, flash }) {
  const b = state.business;
  const set = (patch) => setState((s) => ({ ...s, business: { ...s.business, ...patch } }));
  return (
    <div className="space-y-4">
      <SectionTitle>Settings</SectionTitle>
      <Card className="p-4 space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wide">Business</h3>
        <Field label="Business name"><input value={b.name} onChange={(e) => set({ name: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Yard location"><input value={b.yard} onChange={(e) => set({ yard: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Business phone (shown to customers · used for the “Text to book” button)"><input value={b.phone} onChange={(e) => set({ phone: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
      </Card>
      <Card className="p-4 space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wide">Rental policy</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Security deposit hold ($)"><NumInput v={b.deposit} on={(v) => set({ deposit: v })} /></Field>
          <Field label="We-handle-a-leg fee ($) · delivery/collect"><NumInput v={b.deliveryFee} on={(v) => set({ deliveryFee: v })} /></Field>
          <Field label="Counter/handoff fee ($) · you pay staff"><NumInput v={b.counterFee} on={(v) => set({ counterFee: v })} /></Field>
          <Field label="Self-serve leg fee ($) · will-call/yard drop"><NumInput v={b.dropFee} on={(v) => set({ dropFee: v })} /></Field>
          <Field label="Damage waiver (% of rental)"><NumInput v={Math.round(b.waiverRate * 100)} on={(v) => set({ waiverRate: v / 100 })} /></Field>
          <Field label="Sales tax (%)"><NumInput v={Math.round(b.taxRate * 100)} on={(v) => set({ taxRate: v / 100 })} /></Field>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>These feed the customer booking summary. Sales tax is shown to the customer and remitted to NCDOR — it isn't your revenue.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wide">Cancellation & refund policy</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full refund if cancelled (hrs before pickup)"><NumInput v={b.refundFullHrs} on={(v) => set({ refundFullHrs: v })} /></Field>
          <Field label="Late-cancel refund (% of rental)"><NumInput v={Math.round(b.refundLatePct * 100)} on={(v) => set({ refundLatePct: v / 100 })} /></Field>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Cancel {b.refundFullHrs}h+ before pickup → full refund. Inside {b.refundFullHrs}h → {Math.round(b.refundLatePct * 100)}% back. After pickup → no refund. The deposit hold is always released. Shown to the customer before they confirm a cancellation.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wide">Rental agreement & waiver</h3>
        <p className="text-xs" style={{ color: T.sub }}>Customers read and e-sign this before paying. Their typed signature + timestamp is saved to the booking; you can view or download it from any booking. Edit the text to fit your attorney-reviewed agreement.</p>
        <textarea value={b.agreementText} onChange={(e) => set({ agreementText: e.target.value })} rows={8}
          className="w-full p-2.5 rounded-lg text-xs" style={{ border: `1px solid ${T.line}`, fontFamily: "ui-monospace, monospace" }} />
        <p className="text-[11px]" style={{ color: T.sub }}>Prototype note: this captures a signature record. A production e-sign service (DocuSign, Dropbox Sign, SignWell) adds a tamper-evident audit trail and secure storage when you go live.</p>
      </Card>
      <Card className="p-4">
        <h3 className="font-bold text-sm uppercase tracking-wide mb-1">Reset demo data</h3>
        <p className="text-xs mb-3" style={{ color: T.sub }}>Wipe all trailers and bookings and reload the sample yard.</p>
        <button onClick={() => { setState(structuredClone(SEED)); flash("Reset to sample data."); }}
          className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: T.redSoft, color: T.red }}>Reset everything</button>
      </Card>
      <p className="text-xs text-center pt-2" style={{ color: T.sub }}>
        Prototype · data saves to this browser. Payments, texts, and customer logins get wired up when this goes live on the web.
      </p>
    </div>
  );
}

/* ---------------- CUSTOMER AREA (book + manage sub-nav) --------------- */
function CustomerArea({ state, typeBySize, countAvail, findUnit, addBooking, setBooking, flash, setMode, initialView }) {
  const [view, setView] = useState(initialView || "book"); // book | manage
  return (
    <div>
      <div className="max-w-2xl mx-auto px-4 md:px-6 pt-4">
        <div className="flex gap-1 p-1 rounded-lg w-fit mx-auto" style={{ background: T.graySoft }}>
          {[["book", "Book a trailer", Truck], ["manage", "Manage my booking", ClipboardList]].map(([v, l, Icon]) => (
            <button key={v} onClick={() => setView(v)} className="px-3.5 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5"
              style={view === v ? { background: "#fff", color: T.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: T.sub }}>
              <Icon size={15} /> {l}
            </button>
          ))}
        </div>
      </div>
      {view === "book"
        ? <CustomerBooking {...{ state, typeBySize, countAvail, findUnit, addBooking, flash, setMode }} />
        : <CustomerManage {...{ state, typeBySize, findUnit, setBooking, flash, setMode }} />}
    </div>
  );
}

/* ---------------- CUSTOMER MANAGE (self-service dashboard) --------------- */
function CustomerManage({ state, typeBySize, findUnit, setBooking, flash, setMode }) {
  const b0 = state.business;
  const [code, setCode] = useState("");
  const [contact, setContact] = useState("");
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState(null); // 'extend' | 'logistics' | 'cancel'

  const digits = (s) => (s || "").replace(/\D/g, "");
  const lookupBooking = () => {
    setErr("");
    const c = code.trim().toLowerCase();
    const q = contact.trim().toLowerCase();
    if (!c || !q) { setErr("Enter both your confirmation code and the phone or email on the booking."); return; }
    const match = state.bookings.find((b) =>
      (b.status === "reserved" || b.status === "out") &&
      (b.code || "").toLowerCase() === c &&
      ((b.email || "").toLowerCase() === q || (digits(b.phone) && digits(b.phone) === digits(q)))
    );
    if (!match) { setErr("No booking matches that code and contact. Check your confirmation text or email."); return; }
    setPicked(match.id);
  };

  const b = picked ? state.bookings.find((x) => x.id === picked) : null;
  const tr = b && state.trailers.find((t) => t.id === b.trailerId);
  const type = b && typeBySize(b.size);

  // if not looked up yet
  if (!b) {
    return (
      <div className="max-w-lg mx-auto px-4 md:px-6 pb-24">
        <div className="text-center py-8">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Manage your booking</h1>
          <p className="mt-2" style={{ color: T.sub }}>Enter your confirmation code to extend, change delivery, or cancel.</p>
        </div>
        <Card className="p-5 space-y-3">
          <Field label="Confirmation code">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. WY-1042"
              className="w-full p-2.5 rounded-lg text-sm tabular-nums" style={{ border: `1px solid ${T.line}` }} />
          </Field>
          <Field label="Phone or email on the booking">
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="704-555-0142 or you@email.com"
              className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
          </Field>
          {err && <div className="text-xs p-2.5 rounded-lg flex items-center gap-2" style={{ background: T.redSoft, color: T.red }}><AlertTriangle size={14} /> {err}</div>}
          <button onClick={lookupBooking} className="w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2" style={{ background: T.steel, color: "#fff" }}>
            <Search size={16} /> Find my booking
          </button>
          <div className="text-xs p-2.5 rounded-lg" style={{ background: T.blueSoft, color: T.blue }}>
            You only reach your own reservation — the code plus a matching phone or email is required, so no one can open someone else's. Demo: try <b>WY-1001</b> with <b>704-555-0142</b>.
          </div>
        </Card>
        <div className="text-center mt-4"><button onClick={() => setMode("owner")} className="text-xs" style={{ color: T.sub }}>(owner view)</button></div>
      </div>
    );
  }

  const days = daysBetween(b.start, b.end);
  const usLegs = (b.outMethod === "delivery" ? 1 : 0) + (b.returnMethod === "collect" ? 1 : 0);

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 pb-24">
      <div className="flex items-center justify-between py-6">
        <button onClick={() => { setPicked(null); setPanel(null); }} className="text-sm font-bold flex items-center gap-1" style={{ color: T.steel }}><ArrowLeft size={15} /> All bookings</button>
        <Badge status={b.status === "out" && b.end < today() ? "overdue" : b.status === "out" ? "out" : "reserved"} />
      </div>

      <Card className="p-5">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: T.amberDk }}>Your reservation · {b.code}</div>
        <h2 className="text-2xl font-extrabold mt-1">{type.name}</h2>
        <div className="text-sm" style={{ color: T.sub }}>{b.name} · unit {tr?.assetId}</div>

        <div className="rounded-xl p-4 mt-4 space-y-1" style={{ background: T.paper }}>
          <Row l={b.outMethod === "delivery" ? "Delivery" : "Pickup"} r={`${fmtLong(b.start)} · ${b.pickupTime}`} />
          <Row l="Return by" r={`${fmtLong(b.end)}${b.returnTime ? " · " + b.returnTime : ""}`} />
          <div className="border-t my-1.5" style={{ borderColor: T.line }} />
          <Row l="Getting it out" r={OUT_METHODS[b.outMethod]} />
          <Row l="Getting it back" r={RETURN_METHODS[b.returnMethod]} />
          <div className="border-t my-1.5" style={{ borderColor: T.line }} />
          <Row l="Rental paid" r={`$${b.price}`} bold />
          <Row l="Deposit hold" r={`$${b.deposit} (refundable)`} />
        </div>

        {/* self-service actions */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <button onClick={() => setPanel("extend")} className="py-2.5 rounded-lg text-sm font-bold flex flex-col items-center gap-1" style={{ background: panel === "extend" ? T.amber : T.paper, color: panel === "extend" ? T.steelDk : T.steel, border: `1px solid ${panel === "extend" ? T.amber : T.line}` }}>
            <CalendarClock size={17} /> Extend
          </button>
          <button onClick={() => setPanel("logistics")} className="py-2.5 rounded-lg text-sm font-bold flex flex-col items-center gap-1" style={{ background: panel === "logistics" ? T.amber : T.paper, color: panel === "logistics" ? T.steelDk : T.steel, border: `1px solid ${panel === "logistics" ? T.amber : T.line}` }}>
            <Truck size={17} /> Delivery
          </button>
          <button onClick={() => setPanel("cancel")} className="py-2.5 rounded-lg text-sm font-bold flex flex-col items-center gap-1" style={{ background: panel === "cancel" ? T.redSoft : T.paper, color: T.red, border: `1px solid ${panel === "cancel" ? T.red : T.line}` }}>
            <X size={17} /> Cancel
          </button>
        </div>

        {panel === "extend" && <CustExtend b={b} state={state} type={type} setBooking={setBooking} flash={flash} done={() => setPanel(null)} />}
        {panel === "logistics" && <CustLogistics b={b} state={state} setBooking={setBooking} flash={flash} done={() => setPanel(null)} />}
        {panel === "cancel" && (() => {
          const rf = cancelRefund(b, state.business);
          return (
            <div className="mt-4 p-4 rounded-xl" style={{ background: T.redSoft }}>
              <div className="text-sm font-bold" style={{ color: T.red }}>Cancel this reservation?</div>
              <div className="rounded-lg p-3 my-3 text-sm" style={{ background: "#fff" }}>
                <Row l="Refund to your card" r={`$${rf.amt}`} bold />
                <div className="text-xs mt-1" style={{ color: T.sub }}>{rf.label}. Your ${b.deposit} deposit hold is released.</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setBooking(b.id, { status: "cancelled" }); flash(`Cancelled · $${rf.amt} refunded.`); setPicked(null); setPanel(null); }} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: T.red, color: "#fff" }}>Cancel & refund ${rf.amt}</button>
                <button onClick={() => setPanel(null)} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: "#fff", color: T.sub, border: `1px solid ${T.line}` }}>Keep it</button>
              </div>
            </div>
          );
        })()}
      </Card>
      <p className="text-xs text-center mt-3" style={{ color: T.sub }}>Changes update your reservation instantly and adjust the charge on your card on file.</p>
      <div className="text-center mt-2"><button onClick={() => setMode("owner")} className="text-xs" style={{ color: T.sub }}>(owner view)</button></div>
    </div>
  );
}

function CustExtend({ b, state, type, setBooking, flash, done }) {
  const [addN, setAddN] = useState(2);
  const newEnd = addDays(b.end, addN);
  const conflict = state.bookings.some((x) => x.id !== b.id && x.trailerId === b.trailerId && x.status !== "returned" && x.status !== "cancelled" && overlaps(addDays(b.end, 1), newEnd, x.start, x.end));
  const swapUnit = conflict ? freeUnitFor(state, b.size, b.start, newEnd, b.id) : null;
  const addl = priceFor(type, daysBetween(b.start, newEnd)) - priceFor(type, daysBetween(b.start, b.end));
  const canExtend = !conflict || swapUnit;
  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: T.paper }}>
      <div className="text-sm font-bold mb-2">Add more days</div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 7, 14].map((n) => (
          <button key={n} onClick={() => setAddN(n)} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={addN === n ? { background: T.amber, color: T.steelDk } : { background: "#fff", color: T.sub, border: `1px solid ${T.line}` }}>+{n}</button>
        ))}
      </div>
      {!canExtend ? (
        <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: T.redSoft, color: T.red }}>
          <AlertTriangle size={16} /> Sorry, all trailers this size are booked right after yours. Try fewer days or contact us.
        </div>
      ) : (
        <>
          <div className="rounded-lg p-3 text-sm space-y-1 mb-3" style={{ background: "#fff" }}>
            <Row l="New return date" r={fmtLong(newEnd)} />
            <Row l="Extra charge" r={`$${addl}`} bold />
          </div>
          {swapUnit && <div className="text-[11px] mb-2" style={{ color: T.sub }}>You'll be moved to another {b.size} of the same type — no change to you.</div>}
          <button onClick={() => { setBooking(b.id, swapUnit ? { end: newEnd, price: b.price + addl, trailerId: swapUnit.id } : { end: newEnd, price: b.price + addl }); flash(`Extended to ${fmt(newEnd)} · $${addl} charged.`); done(); }}
            className="w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2" style={{ background: T.steel, color: "#fff" }}>
            <CreditCard size={16} /> Pay ${addl} & extend
          </button>
        </>
      )}
    </div>
  );
}

function CustLogistics({ b, state, setBooking, flash, done }) {
  const dfee = state.business.deliveryFee, sfee = state.business.dropFee;
  const [out, setOut] = useState(b.outMethod);
  const [ret, setRet] = useState(b.returnMethod);
  const legFee = (outM, retM) => (outM === "delivery" ? dfee : sfee) + (retM === "collect" ? dfee : sfee);
  const diff = legFee(out, ret) - legFee(b.outMethod, b.returnMethod);
  const apply = () => {
    const patch = { outMethod: out, returnMethod: ret, price: b.price + diff };
    if (out === "delivery" && !b.outBy) patch.outBy = pickContractor(state, null);
    if (out !== "delivery") { patch.outBy = null; patch.outPaid = false; }
    if (ret === "collect" && !b.returnBy) patch.returnBy = pickContractor(state, patch.outBy || b.outBy);
    if (ret !== "collect") { patch.returnBy = null; patch.returnPaid = false; }
    setBooking(b.id, patch);
    flash(diff === 0 ? "Delivery options updated." : diff > 0 ? `Updated · $${diff} added.` : `Updated · $${-diff} refunded.`);
    done();
  };
  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: T.paper }}>
      <div className="text-sm font-bold mb-1">Getting the trailer</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[["willcall", "I'll pick up", `+$${sfee}`], ["delivery", "Deliver to me", `+$${dfee}`]].map(([v, l, s]) => (
          <button key={v} onClick={() => setOut(v)} className="p-2.5 rounded-lg text-left" style={out === v ? { background: T.amberSoft, border: `2px solid ${T.amber}` } : { background: "#fff", border: `1px solid ${T.line}` }}>
            <div className="text-sm font-bold">{l}</div><div className="text-xs" style={{ color: T.sub }}>{s}</div>
          </button>
        ))}
      </div>
      <div className="text-sm font-bold mb-1">Returning it</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[["yard", "I'll drop off", `+$${sfee}`], ["collect", "Come get it", `+$${dfee}`]].map(([v, l, s]) => (
          <button key={v} onClick={() => setRet(v)} className="p-2.5 rounded-lg text-left" style={ret === v ? { background: T.amberSoft, border: `2px solid ${T.amber}` } : { background: "#fff", border: `1px solid ${T.line}` }}>
            <div className="text-sm font-bold">{l}</div><div className="text-xs" style={{ color: T.sub }}>{s}</div>
          </button>
        ))}
      </div>
      <div className="rounded-lg p-3 text-sm mb-3" style={{ background: "#fff" }}>
        <Row l={diff > 0 ? "Additional charge" : diff < 0 ? "Refund" : "No change"} r={diff === 0 ? "$0" : `$${Math.abs(diff)}`} bold />
      </div>
      <button onClick={apply} className="w-full py-2.5 rounded-lg font-bold" style={{ background: T.steel, color: "#fff" }}>Update delivery options</button>
    </div>
  );
}


function CustomerBooking({ state, typeBySize, countAvail, findUnit, addBooking, flash, setMode }) {
  const [stepN, setStepN] = useState(0);
  const [lastCode, setLastCode] = useState("");
  const b = state.business;
  const [form, setForm] = useState({
    size: null, start: addDays(today(), 1), days: 3, pickupTime: b.pickupHours[0], returnTime: b.pickupHours[0],
    name: "", phone: "", email: "", address: "", ctype: "homeowner", waiver: true,
    outMethod: "willcall", returnMethod: "yard", notes: "", coi: false, signName: "", agree: false,
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const end = addDays(form.start, form.days - 1);
  const type = form.size ? typeBySize(form.size) : null;
  const base = type ? priceFor(type, form.days) : 0;
  const waiverAmt = form.waiver ? Math.round(base * b.waiverRate) : 0;
  const outFee = form.outMethod === "delivery" ? b.deliveryFee : b.dropFee;   // $40 we deliver, $25 will-call
  const returnFee = form.returnMethod === "collect" ? b.deliveryFee : b.dropFee; // $40 we collect, $25 yard drop
  const legFees = outFee + returnFee;
  const usLegs = (form.outMethod === "delivery" ? 1 : 0) + (form.returnMethod === "collect" ? 1 : 0);
  const sub = base + waiverAmt + legFees;
  const tax = Math.round(sub * b.taxRate);
  const total = sub + tax;

  const steps = ["Trailer", "Dates", "Details", "Review"];

  const submit = () => {
    const unit = findUnit(form.size, form.start, end);
    if (!unit) { flash("Sorry — that trailer just got booked. Try other dates."); return; }
    const auto = b.dispatchMode === "auto";
    const counterAuto = b.counterMode === "auto";
    const collectWindow = WINDOWS.find((h) => windowCovered(state, end, h)) || WINDOWS[0];
    const rot = state.bookings.length;
    // OUT leg: delivery -> driver (auto); will-call -> counter staff (only if counterMode auto, else You)
    const outBy = form.outMethod === "delivery"
      ? (auto ? assignRun(state, form.start, form.pickupTime, null, rot) : null)
      : (counterAuto ? assignRun(state, form.start, form.pickupTime, null, rot) : null);
    // RETURN leg: collect -> driver (auto); yard-return -> counter staff (only if counterMode auto, else You)
    const returnBy = form.returnMethod === "collect"
      ? (auto ? assignRun(state, end, collectWindow, outBy, rot + 1) : null)
      : (counterAuto ? assignRun(state, end, form.pickupTime, outBy, rot + 1) : null);
    const newCode = genCode();
    setLastCode(newCode);
    addBooking({
      id: "b" + Date.now(), code: newCode, trailerId: unit.id, size: form.size, name: form.name || "Guest", type: form.ctype,
      phone: form.phone, email: form.email, address: form.address, start: form.start, end,
      pickupTime: form.pickupTime, returnTime: form.returnMethod === "collect" ? collectWindow : form.pickupTime,
      status: "reserved", waiver: form.waiver, outMethod: form.outMethod, returnMethod: form.returnMethod,
      outBy, outPaid: false, returnBy, returnPaid: false,
      price: base + legFees, deposit: b.deposit, paid: true, coi: form.coi, notes: form.notes, dropFee: b.dropFee,
      signName: form.signName, signedAt: new Date().toISOString(), agreementText: b.agreementText,
    });
    setStepN(4);
  };

  if (stepN === 4) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4" style={{ background: T.greenSoft }}>
          <Check size={32} style={{ color: T.green }} />
        </div>
        <h2 className="text-2xl font-extrabold">You're booked!</h2>
        <p className="mt-2" style={{ color: T.sub }}>A {type.name} is reserved for {fmtLong(form.start)} at {form.pickupTime}{form.outMethod === "delivery" ? ", delivered to you" : " for pickup"}. We texted a confirmation with the towing checklist and the rental agreement to sign.</p>
        <div className="mt-5 rounded-xl p-4" style={{ background: T.amberSoft, border: `1px solid ${T.amber}` }}>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: T.amberDk }}>Your confirmation code</div>
          <div className="text-3xl font-extrabold tabular-nums mt-1" style={{ color: T.ink }}>{lastCode}</div>
          <div className="text-xs mt-1" style={{ color: T.sub }}>Keep this to manage your booking. You'll need it + your phone or email.</div>
        </div>
        <Card className="p-4 mt-4 text-left">
          <Row l={form.outMethod === "delivery" ? "Delivery" : "Pickup"} r={`${fmtLong(form.start)} · ${form.pickupTime}`} />
          <Row l="Return by" r={fmtLong(end)} />
          <Row l="Total paid" r={`$${total}`} bold />
          <Row l="Deposit hold" r={`$${b.deposit} (released at return)`} />
        </Card>
        <button onClick={() => { setStepN(0); set({ size: null, name: "", phone: "", email: "" }); }} className="mt-6 text-sm font-bold" style={{ color: T.steel }}>Book another →</button>
        <div className="mt-2"><button onClick={() => setMode("owner")} className="text-xs" style={{ color: T.sub }}>(back to owner view)</button></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 pb-24">
      {/* hero */}
      <div className="text-center py-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Rent a dump trailer</h1>
        <p className="mt-2" style={{ color: T.sub }}>{b.name} · {b.yard} · book in under a minute</p>
      </div>
      {/* stepper */}
      <div className="flex items-center justify-center gap-1.5 mb-6">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
              style={i <= stepN ? { background: T.steel, color: "#fff" } : { background: T.panel, color: T.sub, border: `1px solid ${T.line}` }}>
              <span className="tabular-nums">{i + 1}</span> <span className="hidden sm:inline">{s}</span>
            </div>
            {i < 3 && <ChevronRight size={14} style={{ color: T.line }} />}
          </div>
        ))}
      </div>

      <Card className="p-5 md:p-6">
        {/* step 0: trailer */}
        {stepN === 0 && (
          <div className="space-y-3">
            <StepHead icon={Truck} title="Pick your trailer size" sub="All tow on a normal license behind a properly rated truck." />
            {state.types.map((t) => {
              const avail = countAvail(t.size, form.start, end);
              const active = form.size === t.size;
              return (
                <button key={t.size} disabled={avail === 0} onClick={() => set({ size: t.size })}
                  className="w-full text-left p-4 rounded-xl transition disabled:opacity-50 flex items-center justify-between"
                  style={{ border: `2px solid ${active ? T.amber : T.line}`, background: active ? T.amberSoft : "#fff" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: active ? T.amber : T.paper }}>
                      <Truck size={22} style={{ color: active ? T.steelDk : T.steel }} />
                    </div>
                    <div>
                      <div className="font-bold">{t.name}</div>
                      <div className="text-xs" style={{ color: T.sub }}>{t.cuyd} · from ${t.daily}/24hr</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold" style={{ color: avail > 0 ? T.green : T.red }}>{avail > 0 ? `${avail} available` : "None free"}</div>
                    {active && <Check size={16} className="inline mt-1" style={{ color: T.amberDk }} />}
                  </div>
                </button>
              );
            })}
            <NavBtns onNext={() => setStepN(1)} nextOk={!!form.size} />
          </div>
        )}

        {/* step 1: dates */}
        {stepN === 1 && (
          <div className="space-y-4">
            <StepHead icon={CalendarDays} title="When do you need it?" sub="Pick your day, how long, and whether you'll grab it or we deliver. Booking is open for the next 2 weeks." />
            <Field label="Start date">
              <input type="date" min={today()} max={addDays(today(), b.bookHorizonDays)} value={form.start} onChange={(e) => set({ start: e.target.value })}
                className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
            </Field>
            <Field label="How long?">
              <div className="grid grid-cols-4 gap-2">
                {[[1, "24 hrs"], [3, "3 days"], [7, "1 week"], [28, "4 weeks"]].map(([d, l]) => (
                  <button key={d} onClick={() => set({ days: d })} className="py-2 rounded-lg text-sm font-bold"
                    style={form.days === d ? { background: T.steel, color: "#fff" } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>{l}</button>
                ))}
              </div>
              <input type="range" min="1" max="60" value={form.days} onChange={(e) => set({ days: +e.target.value })} className="w-full mt-3" style={{ accentColor: T.amber }} />
              <div className="text-xs text-center" style={{ color: T.sub }}>{form.days} day{form.days > 1 ? "s" : ""} · return by {fmtLong(end)}</div>
            </Field>
            <Field label="How do you want it?">
              <div className="grid grid-cols-2 gap-2">
                {[["willcall", "I'll pick up", `+$${b.dropFee} · at the yard`], ["delivery", "Deliver to me", `+$${b.deliveryFee}`]].map(([v, l, s]) => (
                  <button key={v} onClick={() => set({ outMethod: v })} className="p-2.5 rounded-lg text-left"
                    style={form.outMethod === v ? { background: T.amberSoft, border: `2px solid ${T.amber}` } : { background: T.paper, border: `1px solid ${T.line}` }}>
                    <div className="text-sm font-bold">{l}</div><div className="text-xs" style={{ color: T.sub }}>{s}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label={form.outMethod === "delivery" ? "Delivery time (driver availability)" : "Pickup time"}>
              {(() => {
                const slots = form.outMethod === "delivery"
                  ? b.pickupHours.filter((h) => windowCovered(state, form.start, h))
                  : b.pickupHours;
                if (form.outMethod === "delivery" && slots.length === 0) {
                  return <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: T.redSoft, color: T.red }}>
                    <AlertTriangle size={16} /> No driver is available to deliver that day — pick another date, or choose will-call.
                  </div>;
                }
                return (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((h) => (
                      <button key={h} onClick={() => set({ pickupTime: h })} className="px-3 py-1.5 rounded-lg text-sm font-bold"
                        style={form.pickupTime === h ? { background: T.amber, color: T.steelDk } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>{h}</button>
                    ))}
                  </div>
                );
              })()}
            </Field>
            {countAvail(form.size, form.start, end) === 0 && (
              <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: T.redSoft, color: T.red }}>
                <AlertTriangle size={16} /> No {form.size} free for those dates — try a different day or size.
              </div>
            )}
            <NavBtns onBack={() => setStepN(0)} onNext={() => setStepN(2)}
              nextOk={countAvail(form.size, form.start, end) > 0 && (form.outMethod !== "delivery" || windowCovered(state, form.start, form.pickupTime))} />
          </div>
        )}

        {/* step 2: details */}
        {stepN === 2 && (
          <div className="space-y-3">
            <StepHead icon={ClipboardList} title="Your details" sub="So we can confirm and send the agreement." />
            <div className="flex gap-2">
              {[["homeowner", "Homeowner", User], ["commercial", "Business", Building2]].map(([v, l, Icon]) => (
                <button key={v} onClick={() => set({ ctype: v })} className="flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
                  style={form.ctype === v ? { background: T.steel, color: "#fff" } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>
                  <Icon size={15} /> {l}
                </button>
              ))}
            </div>
            <Field label={form.ctype === "commercial" ? "Company name" : "Your name"}><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Phone"><input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
              <Field label="Email"><input value={form.email} onChange={(e) => set({ email: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
            </div>
            <Field label={form.outMethod === "delivery" || form.returnMethod === "collect" ? "Delivery / job address (required)" : "Service address"}>
              <input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street, city, ZIP"
                className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${(form.outMethod === "delivery" || form.returnMethod === "collect") && !form.address ? T.red : T.line}` }} />
            </Field>
            {form.ctype === "commercial" && (
              <label className="flex items-center gap-2 text-sm p-2.5 rounded-lg cursor-pointer" style={{ background: T.blueSoft }}>
                <input type="checkbox" checked={form.coi} onChange={(e) => set({ coi: e.target.checked })} style={{ accentColor: T.blue }} />
                <ShieldCheck size={15} style={{ color: T.blue }} /> I'll upload a Certificate of Insurance (required for business rentals)
              </label>
            )}
            <Toggle label="Add damage waiver" sub={`Caps your cost if something goes wrong · $${Math.round(base * b.waiverRate)}`} on={form.waiver} set={(v) => set({ waiver: v })} />

            <div>
              <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: T.sub }}>Returning the trailer</div>
              <div className="grid grid-cols-2 gap-2">
                {[["yard", "I'll drop it off", `+$${b.dropFee} · back to the yard`], ["collect", "Come get it", `+$${b.deliveryFee}`]].map(([v, l, s]) => (
                  <button key={v} onClick={() => set({ returnMethod: v })} className="p-2.5 rounded-lg text-left"
                    style={form.returnMethod === v ? { background: T.amberSoft, border: `2px solid ${T.amber}` } : { background: T.paper, border: `1px solid ${T.line}` }}>
                    <div className="text-sm font-bold">{l}</div><div className="text-xs" style={{ color: T.sub }}>{s}</div>
                  </button>
                ))}
              </div>
              {form.returnMethod === "collect" && <div className="text-[11px] mt-1.5" style={{ color: T.sub }}>We'll schedule a driver to collect it on your return date ({fmtLong(end)}).</div>}
            </div>
            <Field label="Anything we should know? (optional)"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder="Job type, what you're hauling…" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
            <NavBtns onBack={() => setStepN(1)} onNext={() => setStepN(3)} nextOk={form.name && form.phone && (!(form.outMethod === "delivery" || form.returnMethod === "collect") || form.address)} />
          </div>
        )}

        {/* step 3: review */}
        {stepN === 3 && (
          <div className="space-y-4">
            <StepHead icon={CreditCard} title="Review & pay" sub="Card holds your deposit; you're charged the rental now." />
            <div className="rounded-xl p-4" style={{ background: T.paper }}>
              <Row l={`${type.name} × ${form.days}d`} r={`$${base}`} />
              {form.waiver && <Row l="Damage waiver" r={`$${waiverAmt}`} />}
              <Row l={form.outMethod === "delivery" ? "Delivery (we bring it)" : "Yard pickup (will-call)"} r={`$${outFee}`} />
              <Row l={form.returnMethod === "collect" ? "Collection (we get it)" : "Yard drop-off (you return it)"} r={`$${returnFee}`} />
              <Row l="Sales tax (NC)" r={`$${tax}`} />
              <div className="border-t my-2" style={{ borderColor: T.line }} />
              <Row l="Total today" r={`$${total}`} bold big />
              <Row l="Refundable deposit hold" r={`$${b.deposit}`} />
            </div>
            {/* SIGN the agreement & waiver */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: T.steelDk }}>
                <ShieldCheck size={16} style={{ color: T.amber }} />
                <span className="text-sm font-bold text-white">Sign the rental agreement & waiver</span>
              </div>
              <div className="p-3">
                <div className="rounded-lg p-3 text-xs whitespace-pre-line overflow-y-auto" style={{ background: T.paper, color: T.ink, maxHeight: 150, border: `1px solid ${T.line}` }}>
                  {b.agreementText}
                </div>
                <div className="mt-3">
                  <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: T.sub }}>Type your full name to sign</label>
                  <input value={form.signName} onChange={(e) => set({ signName: e.target.value })} placeholder="Your full legal name"
                    className="w-full p-2.5 rounded-lg text-lg" style={{ border: `1px solid ${form.signName ? T.amber : T.line}`, fontFamily: "cursive" }} />
                </div>
                <label className="flex items-start gap-2 mt-2.5 text-xs cursor-pointer" style={{ color: T.ink }}>
                  <input type="checkbox" checked={form.agree} onChange={(e) => set({ agree: e.target.checked })} style={{ accentColor: T.amber, marginTop: 2 }} />
                  <span>I have read and agree to the rental agreement, liability waiver, and cancellation policy. I understand this is my electronic signature, dated {fmtLong(today())}.</span>
                </label>
              </div>
            </div>
            {/* fake stripe card */}
            <div className="rounded-lg p-3" style={{ border: `1px solid ${T.line}` }}>
              <div className="flex items-center gap-2 text-sm" style={{ color: T.sub }}>
                <CreditCard size={16} /> <span className="tabular-nums">4242 4242 4242 4242</span> <span className="ml-auto">12/28 · 123</span>
              </div>
              <div className="text-[11px] mt-1" style={{ color: T.sub }}>Demo card · real Stripe checkout goes here when live</div>
            </div>
            <button onClick={submit} disabled={!form.signName || !form.agree}
              className="w-full py-3 rounded-xl font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: T.amber, color: T.steelDk }}>
              {!form.signName || !form.agree ? "Sign above to continue" : `Pay $${total} & reserve`}
            </button>
            <button onClick={() => setStepN(2)} className="w-full text-sm font-bold" style={{ color: T.sub }}>← back</button>
          </div>
        )}
      </Card>
      <div className="text-center mt-4"><button onClick={() => setMode("owner")} className="text-xs" style={{ color: T.sub }}>(owner view)</button></div>
    </div>
  );
}

/* ---------------- small UI bits --------------- */
function SectionTitle({ children }) { return <h2 className="text-lg font-extrabold tracking-tight" style={{ letterSpacing: "-0.01em" }}>{children}</h2>; }
function Empty({ children }) { return <div className="text-sm py-6 text-center" style={{ color: T.sub }}>{children}</div>; }
function StepHead({ icon: Icon, title, sub }) {
  return (<div className="mb-2"><div className="flex items-center gap-2"><Icon size={18} style={{ color: T.amberDk }} /><h3 className="font-extrabold text-lg">{title}</h3></div><p className="text-sm mt-0.5" style={{ color: T.sub }}>{sub}</p></div>);
}
function Field({ label, children }) { return (<div><label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: T.sub }}>{label}</label>{children}</div>); }
function Row({ l, r, bold, big }) {
  return (<div className="flex items-center justify-between py-0.5"><span className="text-sm" style={{ color: bold ? T.ink : T.sub, fontWeight: bold ? 700 : 400 }}>{l}</span><span className={`tabular-nums ${big ? "text-lg" : "text-sm"}`} style={{ fontWeight: bold ? 800 : 600 }}>{r}</span></div>);
}
function Tag({ on, onLabel, offLabel, warn }) {
  const c = warn ? T.red : on ? T.green : T.sub; const bg = warn ? T.redSoft : on ? T.greenSoft : T.graySoft;
  return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ color: c, background: bg }}>{on ? onLabel : (offLabel || onLabel)}</span>;
}
function MiniBtn({ children, onClick, icon: Icon, danger }) {
  return <button onClick={onClick} className="text-xs font-bold px-2 py-1.5 rounded-md flex items-center gap-1"
    style={danger ? { background: T.redSoft, color: T.red } : { background: T.paper, color: T.steel, border: `1px solid ${T.line}` }}>
    {Icon && <Icon size={12} />}{children}</button>;
}
function NavBtns({ onBack, onNext, nextOk }) {
  return (<div className="flex gap-2 pt-2">
    {onBack && <button onClick={onBack} className="px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1.5" style={{ background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}><ArrowLeft size={15} /> Back</button>}
    <button onClick={onNext} disabled={!nextOk} className="flex-1 py-2.5 rounded-lg text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: T.steel, color: "#fff" }}>Continue <ArrowRight size={15} /></button>
  </div>);
}
function Toggle({ label, sub, on, set }) {
  return (<label className="flex items-center justify-between gap-2 p-3 rounded-lg cursor-pointer" style={{ background: on ? T.amberSoft : T.paper, border: `1px solid ${on ? T.amber : T.line}` }}>
    <div><div className="text-sm font-bold">{label}</div><div className="text-xs" style={{ color: T.sub }}>{sub}</div></div>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ accentColor: T.amber, width: 18, height: 18 }} />
  </label>);
}
function NumInput({ v, on }) { return <input type="number" value={v} onChange={(e) => on(+e.target.value)} className="w-full p-2.5 rounded-lg text-sm tabular-nums" style={{ border: `1px solid ${T.line}` }} />; }
function Modal({ title, children, onClose }) {
  return (<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(24,27,31,0.5)" }} onClick={onClose}>
    <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: T.panel }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3"><h3 className="font-extrabold text-lg">{title}</h3><button onClick={onClose} className="p-1 rounded-md" style={{ color: T.sub }}><X size={20} /></button></div>
      {children}
    </div>
  </div>);
}

/* Logistics line: shows how it leaves and how it comes back */
function LogisticsRow({ icon: Icon, tag, method, methodMap, time }) {
  const isUs = method === "delivery" || method === "collect";
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-lg" style={{ background: isUs ? T.blueSoft : T.paper }}>
      <Icon size={16} style={{ color: isUs ? T.blue : T.sub }} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: T.sub }}>{tag}</div>
        <div className="text-sm font-semibold">{methodMap[method]}</div>
      </div>
      {time && <div className="text-xs font-bold tabular-nums" style={{ color: T.ink }}>{time}</div>}
    </div>
  );
}

/* generate + download the signed agreement as a text file for records */
function downloadSigned(b, state) {
  const tr = state.trailers.find((t) => t.id === b.trailerId);
  const biz = state.business;
  const doc =
`${biz.name.toUpperCase()} — SIGNED RENTAL AGREEMENT & WAIVER
================================================================

Booking:        ${b.id}
Customer:       ${b.name}${b.type === "commercial" ? "  (commercial)" : ""}
Phone / email:  ${b.phone}${b.email ? "  /  " + b.email : ""}
Address:        ${b.address || "—"}

Trailer:        ${tr ? tr.assetId : ""}  (${b.size})
Rental window:  ${b.start} to ${b.end}
Out method:     ${OUT_METHODS[b.outMethod] || b.outMethod}  @ ${b.pickupTime || "—"}
Return method:  ${RETURN_METHODS[b.returnMethod] || b.returnMethod}  @ ${b.returnTime || "—"}
Rental total:   $${b.price}
Deposit hold:   $${b.deposit}

----------------------------------------------------------------
${b.agreementText || biz.agreementText || ""}
----------------------------------------------------------------

ELECTRONICALLY SIGNED BY: ${b.signName}
DATE/TIME:                ${b.signedAt ? new Date(b.signedAt).toLocaleString() : ""}

(Prototype record. A production e-sign service adds a tamper-evident
audit trail and secure long-term storage.)`;
  try {
    const blob = new Blob([doc], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agreement-${b.name.replace(/[^a-z0-9]/gi, "_")}-${b.start}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) { /* best-effort in sandbox */ }
}

/* Full booking detail — opens when you click any booking or a KPI item */
function BookingDetail({ b, state, typeBySize, onClose, setBooking, flash, onExtend }) {
  const [showDoc, setShowDoc] = useState(false);
  const tr = state.trailers.find((t) => t.id === b.trailerId);
  const type = typeBySize(b.size);
  const days = daysBetween(b.start, b.end);
  const status = b.status === "out" && b.end < today() ? "overdue" : b.status === "out" ? "out" : b.status;
  return (
    <Modal onClose={onClose} title={b.name}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {b.type === "commercial" ? <Building2 size={15} style={{ color: T.blue }} /> : <User size={15} style={{ color: T.sub }} />}
        <Badge status={status === "returned" ? "available" : status} />
        <span className="text-sm font-bold ml-auto tabular-nums">{tr?.assetId} · {b.size}</span>
      </div>
      {b.code && <div className="text-[11px] mb-2" style={{ color: T.sub }}>Confirmation {b.code}</div>}

      {/* rental window */}
      <div className="rounded-lg p-3 mb-3" style={{ background: T.paper }}>
        <Row l="Rental window" r={`${fmt(b.start)} → ${fmt(b.end)} (${days}d)`} bold />
        <Row l="Rental total" r={`$${b.price}`} />
        <Row l="Deposit hold" r={`$${b.deposit}`} />
      </div>

      {/* THE LOGISTICS — how it goes out, how it comes back */}
      <div className="space-y-2 mb-3">
        <LogisticsRow icon={Truck} tag="Getting it out" method={b.outMethod} methodMap={OUT_METHODS} time={`${fmtLong(b.start)} · ${b.pickupTime}`} />
        <LogisticsRow icon={RotateCcw} tag="Getting it back" method={b.returnMethod} methodMap={RETURN_METHODS} time={`${fmtLong(b.end)} · ${b.returnTime || "—"}`} />
      </div>

      {/* contact + tags */}
      <div className="text-xs flex items-center gap-3 flex-wrap mb-2" style={{ color: T.sub }}>
        <a href={`tel:${b.phone}`} className="flex items-center gap-1"><Phone size={12} /> {b.phone}</a>
        {b.email && <span className="flex items-center gap-1"><Mail size={12} /> {b.email}</span>}
        {b.address && <span className="flex items-center gap-1"><MapPin size={12} /> {b.address}</span>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <Tag on={b.paid} onLabel="Paid" offLabel="Unpaid" />
        {b.waiver && <Tag on onLabel="Damage waiver" />}
        {b.type === "commercial" && <Tag on={b.coi} onLabel="COI on file" offLabel="COI missing" warn={!b.coi} />}
      </div>
      {b.notes && <div className="text-xs p-2.5 rounded-lg mb-3" style={{ background: T.paper, color: T.sub }}>{b.notes}</div>}

      {/* SIGNED AGREEMENT record */}
      {b.signName ? (
        <div className="rounded-lg mb-3 overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: T.greenSoft }}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} style={{ color: T.green }} />
              <div>
                <div className="text-xs font-bold" style={{ color: T.green }}>Agreement & waiver signed</div>
                <div className="text-[11px]" style={{ color: T.sub }}>{b.signName} · {b.signedAt ? new Date(b.signedAt).toLocaleString() : ""}</div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setShowDoc((v) => !v)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: "#fff", color: T.steel, border: `1px solid ${T.line}` }}>{showDoc ? "Hide" : "View"}</button>
              <button onClick={() => downloadSigned(b, state)} className="text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1" style={{ background: T.steel, color: "#fff" }}>Download</button>
            </div>
          </div>
          {showDoc && (
            <div className="p-3 text-xs whitespace-pre-line" style={{ background: "#fff", color: T.ink, maxHeight: 220, overflowY: "auto" }}>
              {b.agreementText || state.business.agreementText}
              {"\n\n"}— Signed by {b.signName} on {b.signedAt ? new Date(b.signedAt).toLocaleString() : ""}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg mb-3 px-3 py-2 text-xs flex items-center gap-2" style={{ background: T.amberSoft, color: T.amberDk }}>
          <AlertTriangle size={14} /> No signed agreement on file for this booking.
        </div>
      )}

      {/* INSPECTION & PHOTOS log */}
      <div className="rounded-lg mb-3 overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: T.paper }}>
          <CircleDot size={14} style={{ color: T.steel }} />
          <span className="text-xs font-bold">Inspection & photos</span>
        </div>
        <div className="p-3 space-y-2">
          {[["out", "Checkout (at pickup)", b.inspectOutAt], ["in", "Return (at drop-off)", b.inspectInAt]].map(([leg, label, at]) => (
            <div key={leg} className="flex items-center justify-between gap-2">
              <div className="text-xs">
                <div className="font-semibold">{label}</div>
                <div style={{ color: at ? T.green : T.sub }}>{at ? `Logged ${new Date(at).toLocaleString()}` : "Not logged yet"}</div>
              </div>
              {at ? <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ color: T.green, background: T.greenSoft }}>Photos on file</span>
                : <button onClick={() => setBooking(b.id, leg === "out" ? { inspectOutAt: new Date().toISOString() } : { inspectInAt: new Date().toISOString() })}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded" style={{ background: T.steel, color: "#fff" }}>Log photos taken</button>}
            </div>
          ))}
          <div className="text-[11px]" style={{ color: T.sub }}>Take timestamped photos from the same angles at pickup and return (tires, lights, cylinder, bed/sides, hitch, empty & clean). In the live app these upload and attach to the booking; here you log that they were taken.</div>
        </div>
      </div>

      {/* actions */}
      {(b.status === "reserved" || b.status === "out") && (
        <div className="flex gap-2 flex-wrap">
          {b.status === "reserved" && (
            <button onClick={() => { setBooking(b.id, { status: "out" }); flash(`${outVerb(b.outMethod)} — trailer is out.`); onClose(); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: T.steel, color: "#fff" }}>
              <Truck size={15} /> {outVerb(b.outMethod)}
            </button>
          )}
          {b.status === "out" && (
            <button onClick={() => { setBooking(b.id, { status: "returned" }); flash(`${returnVerb(b.returnMethod)} — deposit released.`); onClose(); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: T.steel, color: "#fff" }}>
              <RotateCcw size={15} /> {returnVerb(b.returnMethod)}
            </button>
          )}
          <button onClick={() => { onExtend(b); onClose(); }} className="px-3 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1.5" style={{ background: T.paper, color: T.steel, border: `1px solid ${T.line}` }}>
            <CalendarClock size={15} /> Extend
          </button>
        </div>
      )}
      <p className="text-[11px] text-center mt-3" style={{ color: T.sub }}>A quick inspection happens with the customer present at both handover and return.</p>
    </Modal>
  );
}

