"use client";

import React, { useState, useEffect, useMemo } from "react";
import { loadWorkspace, saveWorkspace, subscribeWorkspace, cloudEnabled } from "./db";
import {
  Truck, LayoutDashboard, CalendarDays, ClipboardList, Boxes, Settings,
  Plus, X, Check, AlertTriangle, Clock, DollarSign, ArrowRight, ArrowLeft,
  Phone, Mail, MapPin, Wrench, RotateCcw, ShieldCheck, CreditCard, Search,
  ChevronRight, CircleDot, PackageCheck, CalendarClock, Building2, User, Home,
  BarChart3, TrendingUp, TrendingDown, Percent, Image as ImageIcon, Sparkles, Trash2,
  LogOut, Lock, Users, FileText, Info
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

/* ---------------- brand theme (white-label logo + colors) --------------- */
const DEFAULT_THEME = { accent: "#F2A900", dark: "#2B3A44" };
const isHex = (h) => /^#[0-9a-fA-F]{6}$/.test(h || "");
const _hex2rgb = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const _rgb2hex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const _mix = (hex, t, amt) => { const [r, g, b] = _hex2rgb(hex); return _rgb2hex(r + (t[0] - r) * amt, g + (t[1] - g) * amt, b + (t[2] - b) * amt); };
const darken = (hex, amt) => _mix(hex, [0, 0, 0], amt);
const tint = (hex, amt) => _mix(hex, [255, 255, 255], amt);
/* mutate the shared token object so every component recolors on next render */
function applyTheme(biz) {
  const th = (biz && biz.theme) || DEFAULT_THEME;
  const accent = isHex(th.accent) ? th.accent : DEFAULT_THEME.accent;
  const dark = isHex(th.dark) ? th.dark : DEFAULT_THEME.dark;
  T.amber = accent; T.amberDk = darken(accent, 0.18); T.amberSoft = tint(accent, 0.84);
  T.steel = dark; T.steelDk = darken(dark, 0.16);
  STATUS.reserved.c = T.amberDk; STATUS.reserved.bg = T.amberSoft;
}

/* ---------------- date helpers (ISO yyyy-mm-dd) --------------- */
// The business's time zone drives what counts as "today" (set from Settings via setAppTz,
// same mutate-a-module-global pattern as the theme). Default: US Eastern.
let APP_TZ = "America/New_York";
function setAppTz(tz) { if (tz) APP_TZ = tz; }
const iso = (d) => d.toISOString().slice(0, 10);
const today = () => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch (e) { return iso(new Date()); }
};
// friendly US time-zone options for Settings
const TIMEZONES = [
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Arizona (no DST)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
];
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
    if (b.outMethod === "delivery") runs.push({ key: b.id + "-out", bookingId: b.id, leg: "out", label: "Deliver", date: b.start, time: b.pickupTime, by: b.outBy, paid: !!b.outPaid, name: b.name, status: b.status });
    if (b.returnMethod === "collect") runs.push({ key: b.id + "-return", bookingId: b.id, leg: "return", label: "Collect", date: b.end, time: b.returnTime, by: b.returnBy, paid: !!b.returnPaid, name: b.name, status: b.status });
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

/* which active drivers are available for a given date + window, not already booked, and
   keeping the owner's between-jobs buffer clear (so back-to-back jobs have travel time) */
function availableDrivers(state, date, window, excludeId) {
  const runs = legRuns(state);
  const bufWin = Math.ceil(((state.business && state.business.bufferMins) || 0) / 60); // buffer expressed in whole hour-slots
  const wi = WINDOWS.indexOf(window);
  const tooClose = (rTime) => {
    if (rTime === window) return true;                 // exact clash always blocks
    if (bufWin <= 0 || wi < 0) return false;
    const ri = WINDOWS.indexOf(rTime);
    return ri >= 0 && Math.abs(ri - wi) <= bufWin;      // within the buffer of an existing job
  };
  return (state.contractors || []).filter((c) =>
    c.active && c.id !== excludeId &&
    ((c.avail && c.avail[date]) || []).includes(window) &&
    !runs.some((r) => r.by === c.id && r.date === date && tooClose(r.time))
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

const WINDOWS = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];
/* turn a window label ("8:00 AM") on an ISO date into a Date, for lead-time checks */
const slotDateTime = (dateISO, label) => {
  const d = new Date(dateISO + "T00:00:00");
  const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(label || "");
  if (m) { let h = (+m[1]) % 12; if (/pm/i.test(m[3])) h += 12; d.setHours(h, +m[2], 0, 0); }
  return d;
};
/* friendly lead-time label: 24 -> "1 day", 2 -> "2 hours" */
const leadLabel = (h) => (h > 0 && h % 24 === 0) ? `${h / 24} day${h / 24 > 1 ? "s" : ""}` : `${h} hour${h === 1 ? "" : "s"}`;
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

/* Sample rental history (returned bookings across the past ~12 months) so the
   Insights tab shows realistic revenue / utilization / ROI out of the box.
   All are status:"returned", self-serve legs, and in the past — so they never
   affect availability, dispatch, the yard queue, or conflict checks. */
function mkHistory() {
  const units = { "7x14": ["t1", "t2", "t3", "t4"], "7x12": ["t5", "t6", "t7"], "5x8": ["t8", "t9", "t10"] };
  const dayRate = { "7x14": 155, "7x12": 130, "5x8": 95 };
  const wkRate = { "7x14": 580, "7x12": 490, "5x8": 350 };
  const names = ["Piedmont Builders", "Queen City Roofing", "Novant Grounds", "Hearth & Patio Co", "Carolina Demo", "Sardis Landscaping", "BlueLine Contracting", "Ridgeway Homes", "Metrolina Cleanup", "Elm Street Reno", "Waxhaw Excavating", "Union Fence Co", "Catawba Grading", "Steele Creek Pools", "Dilworth Decks", "Ballantyne Builders"];
  const sizes = ["7x14", "7x12", "5x8"];
  const out = [];
  let seq = 2000, ni = 0;
  for (let m = 1; m <= 12; m++) {              // months back from now
    const count = 2 + ((m * 7) % 3);           // 2–4 rentals per month
    for (let k = 0; k < count; k++) {
      const size = sizes[(m + k) % 3];
      // skew toward some units renting more than others (creates ROI spread)
      const pool = units[size];
      const trailerId = pool[(m + k * 2) % pool.length];
      const dur = [2, 3, 3, 5, 7, 4][(m + k) % 6];
      const startOffset = -(m * 30) - (k * 6) - 3;
      const start = addDays(today(), startOffset);
      const end = addDays(start, dur);
      const price = dur >= 7 ? wkRate[size] + (dur - 7) * dayRate[size]
        : Math.min(dur * dayRate[size], wkRate[size]);
      seq += 1; ni += 1;
      out.push({
        id: "h" + seq, code: "WY-" + seq, trailerId, size,
        name: names[ni % names.length], type: (m + k) % 2 ? "commercial" : "homeowner",
        phone: "704-555-0" + (100 + ni), email: "", address: "Charlotte, NC",
        start, end, pickupTime: "8:00 AM", returnTime: "8:00 AM", status: "returned",
        waiver: (m + k) % 2 === 0, outMethod: "willcall", returnMethod: "yard",
        outBy: null, returnBy: null,
        price, deposit: 500, paid: true, coi: false, signName: names[ni % names.length], notes: "",
      });
    }
  }
  return out;
}

/* ---------------- seed data (mirrors the financial model) --------------- */
const SEED = {
  business: {
    name: "Ext Professionals",
    yard: "Charlotte, NC",
    phone: "(704) 555-0100",
    logo: "", theme: { accent: "#F2A900", dark: "#2B3A44" }, ownerPass: "admin", teamPass: "team", timezone: "America/New_York",
    pickupHours: WINDOWS,
    deposit: 500, deliveryFee: 40, contractorFee: 40, counterFee: 20, dropFee: 25, taxRate: 0.07, waiverRate: 0.12,
    refundFullHrs: 48, refundLatePct: 0.5,
    dispatchMode: "auto", counterMode: "self", bookHorizonDays: 30, rr: 0,
    leadDeliveryHours: 12, leadCounterHours: 2,
    bufferMins: 30, firstJobDriveMins: 30,
    notifyChannel: "both", notifyConfirm: true, notifyWaiver: true, notifyReminders: [48, 24],
    agreementText: "RENTAL AGREEMENT & LIABILITY WAIVER\n\n1. TOWING. I will tow the trailer with a properly rated vehicle, hitch, and working lights/brakes, and I accept full responsibility for safe, legal towing.\n\n2. LOAD LIMITS. I will not exceed the trailer's rated payload/GVWR. Overweight fines, tickets, and resulting damage are my responsibility.\n\n3. LAWFUL DISPOSAL. I will haul and dispose of debris only at a lawful facility. No hazardous waste, liquids, tires, or prohibited materials. I am responsible for lawful disposal.\n\n4. CONDITION & RETURN. I accept the trailer in good working condition and will return it in the same condition, reasonably clean and empty, less normal wear. A quick inspection occurs at handover and return.\n\n5. LIABILITY & INDEMNITY. I assume all liability and hold the owner harmless for any injury, death, or property damage arising from my towing, hauling, or use of the trailer.\n\n6. DEPOSIT & DAMAGE. A refundable deposit hold applies. I authorize charges for damage, overweight stress, late return, or a dirty/contaminated trailer.\n\n7. OWNERSHIP. The owner retains ownership; no subletting. Governing law: North Carolina.\n\nBy signing, I confirm I have read and agree to these terms and the posted cancellation policy.",
  },
  types: [
    { size: "7x14", name: "7×14 Dump (14K GVWR)", cuyd: "7.3 cu yd", daily: 155, weekly: 580, biweekly: 1120, monthly: 1880, image: "",
      desc: "Our biggest hauler. 14,000 lb GVWR, dual 7K axles, and 24\" sides that hold 7.3 cubic yards — the right pick for concrete tear-outs, roofing tear-offs, and heavy demo. Ramps and a full-height rear gate included.",
      reqLabel: "You'll need to tow this", tow: "Needs a ¾-ton or larger truck (F-250 / Ram 2500 class). 2-5/16\" ball on a Class IV+ hitch rated for 14,000 lb, a 7-pin connector, and a working trailer-brake controller. Not for half-ton trucks when loaded." },
    { size: "7x12", name: "7×12 Dump (9,990 GVWR)", cuyd: "6 cu yd", daily: 130, weekly: 490, biweekly: 950, monthly: 1600, image: "",
      desc: "The everyday workhorse. Under 10K GVWR so it tows easy, yet still swallows 6 cubic yards of debris, brush, or dirt. The most popular size for renovations and cleanouts.",
      reqLabel: "You'll need to tow this", tow: "Tows behind a capable ½-ton (heavy-duty) or ¾-ton truck. 2-5/16\" ball on a Class IV hitch rated ~10,000 lb, a 7-pin connector, and a trailer-brake controller." },
    { size: "5x8",  name: "5×8 Dump (5K GVWR)", cuyd: "2.5 cu yd", daily: 95, weekly: 350, biweekly: 680, monthly: 1150, image: "",
      desc: "Compact and light. 2.5 cubic yards, tows behind a half-ton truck or SUV — ideal for small landscaping jobs, garage cleanouts, and tight driveways.",
      reqLabel: "You'll need to tow this", tow: "Tows behind most ½-ton trucks and larger SUVs. 2\" ball on a Class III hitch rated ~5,000 lb, a 7-pin connector, and a trailer-brake controller." },
  ],
  contractors: [
    { id: "c1", name: "Marcus Reed", phone: "704-555-0301", email: "marcus@extpro.com", vehicle: "F-250", active: true,
      avail: mkAvail((dow) => dow === 0 ? null : WINDOWS) },          // Mon–Sat, all windows
    { id: "c2", name: "Tanya Brooks", phone: "704-555-0302", email: "tanya@extpro.com", vehicle: "Ram 2500", active: true,
      avail: mkAvail((dow) => (dow >= 1 && dow <= 5) ? ["10:00 AM", "12:00 PM", "2:00 PM"] : null) }, // weekdays midday
  ],
  trailers: [
    { id: "t1", assetId: "7x14-A", size: "7x14", vin: "1WC7X14A", maint: false, cost: 13200 },
    { id: "t2", assetId: "7x14-B", size: "7x14", vin: "1WC7X14B", maint: false, cost: 13200 },
    { id: "t3", assetId: "7x14-C", size: "7x14", vin: "1WC7X14C", maint: false, cost: 12800 },
    { id: "t4", assetId: "7x14-D", size: "7x14", vin: "1WC7X14D", maint: false, cost: 13500 },
    { id: "t5", assetId: "7x12-A", size: "7x12", vin: "1WC7X12A", maint: false, cost: 10400 },
    { id: "t6", assetId: "7x12-B", size: "7x12", vin: "1WC7X12B", maint: false, cost: 10400 },
    { id: "t7", assetId: "7x12-C", size: "7x12", vin: "1WC7X12C", maint: false, cost: 10900 },
    { id: "t8", assetId: "5x8-A", size: "5x8", vin: "1WC5X8A", maint: false, cost: 6200 },
    { id: "t9", assetId: "5x8-B", size: "5x8", vin: "1WC5X8B", maint: false, cost: 6200 },
    { id: "t10", assetId: "5x8-C", size: "5x8", vin: "1WC5X8C", maint: false, cost: 5900 },
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
    ...mkHistory(),
  ],
};

/* ---------------- pricing --------------- */
function priceFor(type, days) {
  if (!type || days < 1) return 0;
  const biweekly = type.biweekly ?? type.weekly * 2; // fallback for older saved data
  // best-of tiered: fill 4-week blocks, then 2-week blocks, then weeks, then days
  let d = days, total = 0;
  const months = Math.floor(d / 28); total += months * type.monthly; d -= months * 28;
  const biweeks = Math.floor(d / 14); total += biweeks * biweekly; d -= biweeks * 14;
  const weeks = Math.floor(d / 7); total += weeks * type.weekly; d -= weeks * 7;
  total += d * type.daily;
  // guards: never charge more than the next tier up
  total = Math.min(total, Math.ceil(days / 28) * type.monthly);
  if (days <= 7) total = Math.min(days * type.daily, type.weekly);
  else if (days <= 14) total = Math.min(total, biweekly);
  return Math.round(total);
}
/* explain the price to the customer: which tier they land on + what longer rentals save */
function priceExplain(type, days) {
  if (!type) return { total: 0, saved: 0, perDay: 0, tierLabel: "daily rate" };
  const total = priceFor(type, days);
  const saved = Math.max(0, days * type.daily - total);
  const perDay = days > 0 ? Math.round(total / days) : 0;
  const tierLabel = days >= 28 ? "4-week rate" : days >= 14 ? "2-week rate" : days >= 7 ? "weekly rate" : "daily rate";
  return { total, saved, perDay, tierLabel };
}

/* ---------------- storage (cloud sync with localStorage fallback — see app/db.js) --------------- */

/* =====================================================================
   APP
===================================================================== */
export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("owner"); // owner | customer | landing | employee
  const [custStart, setCustStart] = useState("book"); // initial customer view
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);   // booking detail modal
  const [extend, setExtend] = useState(null);   // extend modal
  const [authed, setAuthed] = useState(false);  // owner signed in this browser session
  const [employeeId, setEmployeeId] = useState(null); // team member signed in this browser session

  useEffect(() => {
    (async () => {
      const s = await loadWorkspace();
      setState(s || structuredClone(SEED));
      setLoading(false);
    })();
    try { if (typeof window !== "undefined" && sessionStorage.getItem("yardhand_owner") === "1") setAuthed(true); } catch (e) { /* ignore */ }
    try { if (typeof window !== "undefined") { const eid = sessionStorage.getItem("yardhand_emp"); if (eid) setEmployeeId(eid); } } catch (e) { /* ignore */ }
    // realtime: pick up changes made on another device (ignore our own echoes)
    return subscribeWorkspace((incoming) => {
      setState((prev) => JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming);
    });
  }, []);
  useEffect(() => { if (state && !loading) saveWorkspace(state); }, [state, loading]);

  // flash a toast; pass undoable=true to offer a one-tap Undo that restores the pre-action state.
  // (When called right after a mutation in the same handler, `state` here is still the pre-action snapshot.)
  const flash = (m, undoable = false) => { setToast({ m, undo: undoable ? state : null }); setTimeout(() => setToast(null), undoable ? 6000 : 2600); };

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

  applyTheme(state.business); // recolor tokens from saved brand theme before children render
  setAppTz(state.business.timezone); // "today" follows the business's time zone

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
        <Landing state={state} typeBySize={typeBySize} go={(v) => { setCustStart(v); setMode("customer"); }} owner={() => setMode("owner")} team={() => setMode("employee")} />
      ) : mode === "owner" && !authed ? (
        <OwnerLogin state={state} onBack={() => setMode("landing")}
          onAuthed={() => { setAuthed(true); try { sessionStorage.setItem("yardhand_owner", "1"); } catch (e) {} }} />
      ) : mode === "employee" && !employeeId ? (
        <EmployeeLogin state={state} onBack={() => setMode("landing")}
          onAuthed={(id) => { setEmployeeId(id); try { sessionStorage.setItem("yardhand_emp", id); } catch (e) {} }} />
      ) : (
        <>
          <TopBar state={state} mode={mode} setMode={setMode}
            signOut={() => { setAuthed(false); setEmployeeId(null); try { sessionStorage.removeItem("yardhand_owner"); sessionStorage.removeItem("yardhand_emp"); } catch (e) {} setMode("landing"); }} />
          {mode === "employee" ? (
            <EmployeePortal {...{ state, employeeId, setBooking, update, flash, signOut: () => { setEmployeeId(null); try { sessionStorage.removeItem("yardhand_emp"); } catch (e) {} setMode("landing"); } }} />
          ) : mode === "owner" ? (
            <div className="max-w-6xl mx-auto px-4 md:px-6 pb-24">
              <OwnerNav tab={tab} setTab={setTab} />
              {tab === "dashboard" && <Dashboard {...{ state, typeBySize, trailerStatus, currentBooking, setBooking, flash, openDetail: setDetail }} />}
              {tab === "insights" && <InsightsView {...{ state }} />}
              {tab === "calendar" && <CalendarBoard {...{ state, trailerStatus, openDetail: setDetail }} />}
              {tab === "bookings" && <BookingsView {...{ state, typeBySize, setBooking, flash, openDetail: setDetail, openExtend: setExtend }} />}
              {tab === "customers" && <CustomersView {...{ state, openDetail: setDetail }} />}
              {tab === "team" && <TeamView {...{ state, setBooking, update, flash, openDetail: setDetail }} />}
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
        onConfirm={(newEnd, addl, newTrailerId) => { setBooking(extend.id, newTrailerId ? { end: newEnd, price: extend.price + addl, trailerId: newTrailerId } : { end: newEnd, price: extend.price + addl }); setExtend(null); flash(newTrailerId ? `Extended & moved to a free unit · +$${addl}.` : `Extended to ${fmt(newEnd)} · +$${addl} charged to card on file.`, true); }} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3"
          style={{ background: T.steelDk, color: "#fff" }}>
          <Check size={16} style={{ color: T.amber }} /> <span className="text-sm font-medium">{toast.m}</span>
          {toast.undo && (
            <button onClick={() => { setState(toast.undo); setToast(null); }}
              className="text-sm font-bold px-2.5 py-1 rounded flex items-center gap-1 shrink-0" style={{ background: T.amber, color: T.steelDk }}>
              <RotateCcw size={13} /> Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- LANDING (public marketing page) --------------- */
function Landing({ state, typeBySize, go, owner, team }) {
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
            <BrandMark logo={b.logo} size={36} />
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
              <div className="text-xs mb-3" style={{ color: T.sub }}>{t.cuyd || " "}</div>
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
          <div className="flex items-center gap-4">
            {team && <button onClick={team} className="text-xs" style={{ color: "#6C7178" }}>Team sign-in</button>}
            <button onClick={owner} className="text-xs" style={{ color: "#6C7178" }}>Owner login</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- top bar --------------- */
function BrandMark({ logo, size = 36 }) {
  if (logo) return <img src={logo} alt="logo" className="rounded-md object-contain shrink-0" style={{ width: size, height: size, background: "#fff", padding: 2 }} />;
  return <div className="rounded-md flex items-center justify-center shrink-0" style={{ width: size, height: size, background: T.amber }}><Truck size={Math.round(size * 0.56)} style={{ color: T.steelDk }} /></div>;
}

function TopBar({ state, mode, setMode, signOut }) {
  return (
    <div style={{ background: T.steelDk }} className="sticky top-0 z-40 border-b" >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark logo={state.business.logo} size={36} />
          <div className="leading-tight min-w-0">
            <div className="font-extrabold tracking-tight text-white truncate" style={{ letterSpacing: "-0.01em" }}>{state.business.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }}>
            <button onClick={() => setMode("landing")} className="px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5" style={{ color: "#D8DEE2" }}>
              <Home size={15} /> <span className="hidden sm:inline">Site</span>
            </button>
            {[["owner", "Owner", LayoutDashboard], ["employee", "Team", Users], ["customer", "Book a trailer", Truck]].map(([m, label, Icon]) => (
              <button key={m} onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 transition"
                style={mode === m ? { background: T.amber, color: T.steelDk } : { color: "#D8DEE2" }}>
                <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {(mode === "owner" || mode === "employee") && signOut && (
            <button onClick={signOut} title="Sign out" className="px-2.5 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5" style={{ color: "#D8DEE2", border: "1px solid rgba(255,255,255,0.15)" }}>
              <LogOut size={15} /> <span className="hidden md:inline">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerLogin({ state, onAuthed, onBack }) {
  const b = state.business;
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const expected = b.ownerPass || "admin";
  const submit = () => { if (pass === expected) onAuthed(); else setErr(true); };
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: T.steelDk }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <BrandMark logo={b.logo} size={56} />
          <div className="mt-3 text-xl font-extrabold text-white">{b.name}</div>
          <div className="text-sm" style={{ color: "#B7C0C6" }}>Owner dashboard</div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: T.panel }}>
          <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: T.sub }}>Password</label>
          <input type="password" value={pass} autoFocus placeholder="Enter your password"
            onChange={(e) => { setPass(e.target.value); setErr(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${err ? T.red : T.line}` }} />
          {err && <div className="text-xs mt-1.5 font-semibold" style={{ color: T.red }}>Incorrect password — try again.</div>}
          <button onClick={submit} className="w-full mt-3 py-2.5 rounded-lg font-extrabold" style={{ background: T.amber, color: T.steelDk }}>Sign in</button>
          {expected === "admin" && <div className="text-[11px] mt-3 p-2 rounded-lg text-center" style={{ background: T.amberSoft, color: T.amberDk }}>Prototype demo · default password is <b>admin</b> — change it in Settings → Owner access.</div>}
        </div>
        <button onClick={onBack} className="w-full mt-4 text-xs font-semibold" style={{ color: "#B7C0C6" }}>← Back to public site</button>
        <p className="text-[11px] text-center mt-3" style={{ color: "#6C7178" }}>Prototype sign-in. Real accounts, roles, and secure passwords get wired up when this goes live.</p>
      </div>
    </div>
  );
}

/* ---------------- EMPLOYEE (team member) sign-in + portal --------------- */
function EmployeeLogin({ state, onAuthed, onBack }) {
  const b = state.business;
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const expected = b.teamPass || "team";
  const digits = (s) => (s || "").replace(/\D/g, "");
  const submit = () => {
    const q = id.trim().toLowerCase();
    if (!q || !code.trim() || code.trim() !== expected) { setErr(true); return; }
    const me = (state.contractors || []).find((c) => c.active && ((c.email || "").toLowerCase() === q || (digits(c.phone) && digits(c.phone) === digits(q))));
    if (!me) { setErr(true); return; }
    onAuthed(me.id);
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: T.steelDk }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <BrandMark logo={b.logo} size={56} />
          <div className="mt-3 text-xl font-extrabold text-white">{b.name}</div>
          <div className="text-sm" style={{ color: "#B7C0C6" }}>Team sign-in</div>
        </div>
        <div className="rounded-2xl p-5 space-y-3" style={{ background: T.panel }}>
          <Field label="Your phone or email"><input value={id} autoFocus onChange={(e) => { setId(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="704-555-0301 or you@company.com" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${err ? T.red : T.line}` }} /></Field>
          <Field label="Team code"><input value={code} onChange={(e) => { setCode(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Ask your manager" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${err ? T.red : T.line}` }} /></Field>
          {err && <div className="text-xs font-semibold" style={{ color: T.red }}>Check your phone/email and the team code, then try again.</div>}
          <button onClick={submit} className="w-full py-2.5 rounded-lg font-extrabold" style={{ background: T.amber, color: T.steelDk }}>Sign in</button>
          {expected === "team" && <div className="text-[11px] p-2 rounded-lg text-center" style={{ background: T.amberSoft, color: T.amberDk }}>Demo · team code is <b>team</b> (owner sets it in Settings). Try <b>704-555-0301</b>.</div>}
        </div>
        <button onClick={onBack} className="w-full mt-4 text-xs font-semibold" style={{ color: "#B7C0C6" }}>← Back to public site</button>
        <p className="text-[11px] text-center mt-3" style={{ color: "#6C7178" }}>Prototype sign-in. Individual secure logins get wired up when this goes live.</p>
      </div>
    </div>
  );
}

function EmployeePortal({ state, employeeId, setBooking, update, flash, signOut }) {
  const me = (state.contractors || []).find((c) => c.id === employeeId);
  const [editAvail, setEditAvail] = useState(null);
  const [tab, setTab] = useState("jobs"); // jobs | hours | pay
  if (!me) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-sm" style={{ color: T.sub }}>You've been signed out.</div>
        <button onClick={signOut} className="mt-3 px-4 py-2 rounded-lg font-bold" style={{ background: T.amber, color: T.steelDk }}>Back to sign-in</button>
      </div>
    );
  }
  const biz = state.business;
  const first = me.name.split(" ")[0];
  const digits = (s) => (s || "").replace(/\D/g, "");
  const mine = [
    ...legRuns(state).filter((r) => r.by === employeeId).map((r) => ({ ...r, kind: "road", fee: biz.contractorFee })),
    ...yardEvents(state).filter((e) => e.by === employeeId).map((e) => ({ ...e, kind: "yard", fee: biz.counterFee, label: e.leg === "out" ? "Pickup" : "Return" })),
  ].map((j) => ({ ...j, bk: state.bookings.find((x) => x.id === j.bookingId) })).filter((j) => j.bk);
  const active = mine.filter((j) => j.bk.status === "reserved" || j.bk.status === "out").sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const todayJobs = active.filter((j) => j.date <= today());
  const upcoming = active.filter((j) => j.date > today());
  const doneJob = (j) => j.date && j.date < today();
  const owedJobs = mine.filter((j) => !j.paid && doneJob(j));
  const owedTotal = owedJobs.reduce((s, j) => s + j.fee, 0);
  const paidJobs = mine.filter((j) => j.paid).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 10);

  const addPhotos = async (bk, leg, files) => {
    if (!files || !files.length) return;
    const urls = [];
    for (const f of Array.from(files)) { const u = await fileToResizedDataURL(f); if (u) urls.push(u); }
    if (!urls.length) return;
    update((n) => {
      const x = n.bookings.find((y) => y.id === bk.id);
      const key = leg === "out" ? "inspectOutPhotos" : "inspectInPhotos";
      x[key] = [...(x[key] || []), ...urls].slice(0, 8);
      x[leg === "out" ? "inspectOutAt" : "inspectInAt"] = new Date().toISOString();
    });
    flash("Photos added to the job.");
  };

  const JobCard = ({ j }) => {
    const bk = j.bk, isOut = j.leg === "out";
    const what = isOut
      ? (j.kind === "road" ? "Deliver to the customer" : "Hand off at the yard (customer pickup)")
      : (j.kind === "road" ? "Collect from the customer" : "Receive at the yard (customer return)");
    const actLabel = isOut ? (j.kind === "road" ? "Mark delivered" : "Mark handed over") : (j.kind === "road" ? "Mark collected" : "Mark received");
    const canAct = isOut ? bk.status === "reserved" : bk.status === "out";
    const waitOut = !isOut && bk.status === "reserved";
    const overdue = bk.status === "out" && bk.end < today();
    const photos = (isOut ? bk.inspectOutPhotos : bk.inspectInPhotos) || [];
    const addr = bk.address;
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ color: "#fff", background: isOut ? T.amberDk : T.blue }}>{j.label}</span>
            <div className="min-w-0">
              <div className="font-bold truncate">{bk.name}</div>
              <div className="text-xs" style={{ color: T.sub }}>{fmtLong(j.date)}{j.time ? ` · ${j.time}` : ""}</div>
            </div>
          </div>
          {overdue ? <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: T.red, background: T.redSoft }}>OVERDUE</span>
            : bk.status === "out" ? <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: T.blue, background: T.blueSoft }}>OUT</span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: T.amberDk, background: T.amberSoft }}>RESERVED</span>}
        </div>
        <div className="text-sm mt-2 font-semibold">{what}</div>
        {addr && <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: T.sub }}><MapPin size={12} /> {addr}</div>}
        <div className="flex gap-2 mt-3 flex-wrap">
          {bk.phone && <a href={`tel:${digits(bk.phone)}`} className="text-xs font-bold px-2.5 py-1.5 rounded flex items-center gap-1" style={{ background: T.paper, color: T.steel, border: `1px solid ${T.line}` }}><Phone size={13} /> Call</a>}
          {addr && <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="text-xs font-bold px-2.5 py-1.5 rounded flex items-center gap-1" style={{ background: T.paper, color: T.steel, border: `1px solid ${T.line}` }}><MapPin size={13} /> Directions</a>}
          <label className="text-xs font-bold px-2.5 py-1.5 rounded flex items-center gap-1 cursor-pointer" style={{ background: T.paper, color: T.steel, border: `1px solid ${T.line}` }}>
            <ImageIcon size={13} /> {photos.length ? `Photos (${photos.length})` : "Add photos"}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addPhotos(bk, j.leg, e.target.files)} />
          </label>
        </div>
        {photos.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {photos.map((p, i) => <img key={i} src={p} alt="" onClick={() => openStoredFile(p)} className="w-12 h-12 rounded object-cover cursor-pointer" style={{ border: `1px solid ${T.line}` }} />)}
          </div>
        )}
        {canAct ? (
          <button onClick={() => { setBooking(bk.id, { status: isOut ? "out" : "returned" }); flash(isOut ? "Marked out — nice work." : "Marked returned — thank you!", true); }}
            className="w-full mt-3 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2" style={{ background: T.steel, color: "#fff" }}>
            {isOut ? <Truck size={16} /> : <RotateCcw size={16} />} {actLabel}
          </button>
        ) : waitOut ? (
          <div className="mt-3 text-xs p-2 rounded-lg text-center" style={{ background: T.paper, color: T.sub }}>Waiting on pickup — you'll mark it returned once it's gone out.</div>
        ) : (
          <div className="mt-3 text-xs p-2 rounded-lg text-center flex items-center justify-center gap-1" style={{ background: T.greenSoft, color: T.green }}><Check size={13} /> Done</div>
        )}
      </Card>
    );
  };

  const horizon = biz.bookHorizonDays || 30;
  const days = Array.from({ length: horizon }, (_, i) => addDays(today(), i));

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 pb-24">
      <div className="py-5">
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.amberDk }}>Team</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Hi, {first} 👋</h1>
        <p className="text-sm" style={{ color: T.sub }}>{todayJobs.length ? `You have ${todayJobs.length} job${todayJobs.length > 1 ? "s" : ""} to handle today.` : "No jobs for today — you're clear."}</p>
      </div>

      <div className="flex gap-1 p-1 rounded-lg mb-4" style={{ background: T.graySoft }}>
        {[["jobs", "My jobs", Truck], ["hours", "My hours", CalendarClock], ["pay", "My pay", DollarSign]].map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className="flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-1.5" style={tab === v ? { background: "#fff", color: T.ink, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: T.sub }}><Icon size={15} /> {l}</button>
        ))}
      </div>

      {tab === "jobs" && (
        <div className="space-y-5">
          <div>
            <div className="text-sm font-bold mb-2">Today &amp; overdue</div>
            {todayJobs.length === 0 ? <Empty>Nothing to do today.</Empty> : <div className="space-y-3">{todayJobs.map((j) => <JobCard key={j.key} j={j} />)}</div>}
          </div>
          <div>
            <div className="text-sm font-bold mb-2">Coming up</div>
            {upcoming.length === 0 ? <Empty>No upcoming jobs assigned to you.</Empty> : <div className="space-y-3">{upcoming.map((j) => <JobCard key={j.key} j={j} />)}</div>}
          </div>
        </div>
      )}

      {tab === "hours" && (
        <Card className="p-4">
          <div className="text-sm font-bold">Set when you can work</div>
          <div className="text-xs mt-1 mb-3" style={{ color: T.sub }}>Tap a day to choose your hours. You can only be booked for times you mark free. <b style={{ color: T.green }}>Green</b> = free, blank = off. This updates the schedule your manager sees instantly.</div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const wins = (me.avail && me.avail[d]) || [];
              const cover = wins.length;
              const dd = new Date(d + "T00:00:00");
              return (
                <button key={d} onClick={() => setEditAvail({ driverId: me.id, date: d })} className="rounded-lg p-1.5 text-center" style={{ background: cover === 0 ? T.paper : cover >= 4 ? T.green : cover >= 2 ? "#8FBF6F" : T.amber, border: `1px solid ${T.line}` }}>
                  <div className="text-[9px] font-bold uppercase" style={{ color: cover ? "#fff" : T.sub }}>{dd.toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className="text-xs font-bold tabular-nums" style={{ color: cover ? "#fff" : T.ink }}>{dd.getDate()}</div>
                  <div className="text-[8px]" style={{ color: cover ? "rgba(255,255,255,0.85)" : T.sub }}>{cover ? `${cover}h` : "—"}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "pay" && (
        <div className="space-y-4">
          <Card className="p-4" style={{ background: T.steelDk }}>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: T.amber }}>Owed to you</div>
            <div className="text-4xl font-extrabold text-white tabular-nums">${owedTotal}</div>
            <div className="text-xs mt-1" style={{ color: "#B7C0C6" }}>{owedJobs.length} finished job{owedJobs.length === 1 ? "" : "s"} not paid yet · your manager pays and marks these off</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-bold mb-2">Recently paid</div>
            {paidJobs.length === 0 ? <Empty>No paid jobs yet.</Empty> : (
              <div className="space-y-1.5">
                {paidJobs.map((j) => (
                  <div key={j.key} className="flex items-center justify-between text-sm p-2 rounded-lg" style={{ background: T.paper }}>
                    <div className="min-w-0 truncate"><span className="font-semibold">{j.label}</span> · {j.bk.name} <span className="text-xs" style={{ color: T.sub }}>· {fmt(j.date)}</span></div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded shrink-0" style={{ color: T.green, background: T.greenSoft }}>Paid ${j.fee}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="text-center mt-8">
        <button onClick={signOut} className="text-xs font-bold flex items-center gap-1 mx-auto" style={{ color: T.sub }}><LogOut size={13} /> Sign out</button>
      </div>

      {editAvail && <AvailabilityEditor {...editAvail} state={state} update={update} onClose={() => setEditAvail(null)} />}
    </div>
  );
}

/* ---------------- owner nav --------------- */
function OwnerNav({ tab, setTab }) {
  const items = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["insights", "Insights", BarChart3],
    ["calendar", "Calendar", CalendarDays],
    ["bookings", "Bookings", ClipboardList],
    ["customers", "Customers", Users],
    ["team", "Team & dispatch", User],
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
  return <div className={`rounded-2xl ${className}`} style={{ background: T.panel, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(24,27,31,0.04)", ...style }}>{children}</div>;
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
    { label: "Out on rent", val: stats.out + stats.overdue, icon: Truck, c: T.blue, bg: T.blueSoft, onClick: () => setKpiList({ title: "Out on rent — return timing", items: outNow }) },
    { label: "Available", val: stats.available, icon: PackageCheck, c: T.green, bg: T.greenSoft, onClick: () => setKpiList({ title: "Available now", units: availUnits }) },
    { label: "Due back today", val: dueToday.length, icon: CalendarClock, c: T.amberDk, bg: T.amberSoft, onClick: () => setKpiList({ title: "Due back today", items: dueToday }) },
    { label: "Overdue", val: overdue.length, icon: AlertTriangle, c: T.red, bg: T.redSoft, onClick: () => setKpiList({ title: "Overdue", items: overdue }) },
  ];

  // ── "what needs me today" checklist ──
  const conflictCount = findConflicts(state).length;
  const needDriver = state.bookings.reduce((n, b) => {
    if (b.status === "cancelled" || b.status === "returned") return n;
    if (b.outMethod === "delivery" && !b.outBy) n++;
    if (b.returnMethod === "collect" && !b.returnBy) n++;
    return n;
  }, 0);
  const toPay = state.bookings.reduce((n, b) => {
    if (b.status === "cancelled") return n;
    if (b.outBy && b.outBy !== "owner" && !b.outPaid && b.start < today()) n++;
    if (b.returnBy && b.returnBy !== "owner" && !b.returnPaid && b.end < today()) n++;
    return n;
  }, 0);
  const plural = (n) => (n === 1 ? "" : "s");
  const dailyChecks = [
    conflictCount > 0 && { level: "red", text: `Fix ${conflictCount} double-booking${plural(conflictCount)}`, hint: "see the red box just below" },
    overdue.length > 0 && { level: "red", text: `${overdue.length} trailer${plural(overdue.length)} overdue`, hint: "chase the customer, then mark returned when it's back" },
    pickupsToday.length > 0 && { level: "amber", text: `${pickupsToday.length} trailer${plural(pickupsToday.length)} going out today`, hint: "mark “Picked up / Delivered” when they leave (in Pickups & returns below)" },
    dueToday.length > 0 && { level: "amber", text: `${dueToday.length} trailer${plural(dueToday.length)} due back today`, hint: "mark “Returned / Collected” when it arrives (below)" },
    needDriver > 0 && { level: "amber", text: `${needDriver} job${plural(needDriver)} still needs a driver`, hint: "assign someone in Team & dispatch" },
    toPay > 0 && { level: "blue", text: `${toPay} finished job${plural(toPay)} to pay`, hint: "pay your crew, then mark paid in Team & dispatch → To pay" },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: T.amberDk }}>Today at the yard</div>
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            {new Date(today() + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: T.greenSoft, color: T.green }}>
          <span className="w-2 h-2 rounded-full" style={{ background: T.green }} /> {stats.available} of {state.trailers.length} trailers free
        </div>
      </div>

      {/* Start-here daily checklist — what needs the owner today */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: dailyChecks.length ? T.amberSoft : T.greenSoft }}>
            <ClipboardList size={16} style={{ color: dailyChecks.length ? T.amberDk : T.green }} />
          </span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Start here · what needs you today</h3>
        </div>
        {dailyChecks.length === 0 ? (
          <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: T.greenSoft }}>
            <Check size={16} style={{ color: T.green }} />
            <span className="text-sm font-semibold" style={{ color: T.green }}>You're all caught up — nothing needs you right now.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {dailyChecks.map((c, i) => {
              const col = c.level === "red" ? T.red : c.level === "amber" ? T.amberDk : T.blue;
              const bg = c.level === "red" ? T.redSoft : c.level === "amber" ? T.amberSoft : T.blueSoft;
              const Icon = c.level === "red" ? AlertTriangle : c.level === "blue" ? DollarSign : CalendarClock;
              return (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: bg }}>
                  <Icon size={15} className="shrink-0 mt-0.5" style={{ color: col }} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold" style={{ color: col }}>{c.text}</div>
                    <div className="text-xs" style={{ color: T.sub }}>{c.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
                      <button onClick={() => { setBooking(c.id, { trailerId: alt.id }); flash(`Moved ${c.name} to ${alt.assetId}.`, true); }}
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
          <button key={k.label} onClick={k.onClick}
            className="group text-left rounded-2xl p-4 transition hover:-translate-y-0.5"
            style={{ background: T.panel, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(24,27,31,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: k.bg }}>
                <k.icon size={20} style={{ color: k.c }} />
              </span>
              <ChevronRight size={16} style={{ color: T.gray }} />
            </div>
            <div className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: T.ink }}>{k.val}</div>
            <div className="text-[11px] font-bold mt-1.5 uppercase tracking-wide" style={{ color: T.sub }}>{k.label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl p-5 lg:col-span-1 flex flex-col justify-between" style={{ background: T.steelDk, boxShadow: "0 1px 2px rgba(24,27,31,0.06)" }}>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.amber }}>Revenue booked · this month</div>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(242,169,0,0.15)" }}><DollarSign size={16} style={{ color: T.amber }} /></span>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-white tabular-nums mt-4">${monthRev.toLocaleString()}</div>
            <div className="text-xs mt-2" style={{ color: "#B7C0C6" }}>+ tax collected &amp; remitted separately</div>
          </div>
        </div>

        <div className="rounded-2xl p-5 lg:col-span-2" style={{ background: T.panel, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(24,27,31,0.04)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.amberSoft }}><CalendarClock size={16} style={{ color: T.amberDk }} /></span>
              <h3 className="font-bold text-sm uppercase tracking-wide">Pickups &amp; returns today</h3>
            </div>
            {(overdue.length + dueToday.length + pickupsToday.length) > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: T.paper, color: T.sub }}>{overdue.length + dueToday.length + pickupsToday.length}</span>
            )}
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
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.blueSoft }}><CalendarDays size={16} style={{ color: T.blue }} /></span>
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
    <div className="space-y-6">
      <SectionTitle>Availability board · next {horizon} days</SectionTitle>
      <Card className="p-3 overflow-x-auto">
        <div style={{ minWidth: 60 + horizon * 34 }}>
          <div className="grid" style={{ gridTemplateColumns: `120px repeat(${horizon}, 1fr)` }}>
            <div />
            {days.map((d, i) => (
              <div key={d} className="text-center pb-2">
                {i === 0 ? (
                  <div className="inline-flex flex-col items-center rounded-md px-1 pt-0.5 pb-1" style={{ background: T.amber }}>
                    <div className="text-[8px] font-extrabold uppercase tracking-wide" style={{ color: T.steelDk }}>Today</div>
                    <div className="text-xs font-extrabold tabular-nums leading-none" style={{ color: T.steelDk }}>{new Date(d + "T00:00:00").getDate()}</div>
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] font-bold uppercase" style={{ color: T.sub }}>
                      {new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
                    </div>
                    <div className="text-xs font-semibold tabular-nums" style={{ color: T.sub }}>
                      {new Date(d + "T00:00:00").getDate()}
                    </div>
                  </>
                )}
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
                const isToday = d === start;
                const isReturnDay = b && d === b.end;   // last day of a rental = trailer due back
                const st = tr.maint ? STATUS.maintenance : b ? (b.status === "out" ? (b.end < today() ? STATUS.overdue : STATUS.out) : STATUS.reserved) : null;
                return (
                  <div key={d} className="h-full flex items-center px-0.5" style={{ background: isToday ? "rgba(242,169,0,0.14)" : undefined }}>
                    <div onClick={() => b && openDetail(b)} className="w-full rounded flex items-center justify-end" style={{ height: 20, background: st ? st.c : T.graySoft, opacity: st ? 0.9 : 0.5, cursor: b ? "pointer" : "default", boxShadow: isReturnDay ? `inset -4px 0 0 ${T.steelDk}` : undefined }}
                      title={b ? (isReturnDay ? `${b.name} — DUE BACK ${fmt(b.end)}` : `${b.name} (${b.start}→${b.end}) — click for detail`) : tr.maint ? "Down for maintenance" : "Available"}>
                      {isReturnDay && <RotateCcw size={10} strokeWidth={3} style={{ color: "#fff", marginRight: 1 }} />}
                    </div>
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
    <div className="space-y-6">
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
                        {b.status === "reserved" && <MiniBtn onClick={() => { setBooking(b.id, { status: "out" }); flash(`${outVerb(b.outMethod)}.`, true); }} icon={Truck}>{b.outMethod === "delivery" ? "Delivered" : "Picked up"}</MiniBtn>}
                        {b.status === "out" && <MiniBtn onClick={() => { setBooking(b.id, { status: "returned" }); flash("Returned — deposit released.", true); }} icon={RotateCcw}>{b.returnMethod === "collect" ? "Collected" : "Returned"}</MiniBtn>}
                        <MiniBtn onClick={() => openExtend(b)} icon={CalendarClock}>Extend</MiniBtn>
                        <MiniBtn onClick={() => { const rf = cancelRefund(b, state.business); setBooking(b.id, { status: "cancelled" }); flash(`Cancelled · $${rf.amt} refunded.`, true); }} icon={X} danger>Cancel</MiniBtn>
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
  const [addingType, setAddingType] = useState(false);
  const [unitSize, setUnitSize] = useState(null);
  const bySize = state.types.map((t) => ({ ...t, units: state.trailers.filter((tr) => tr.size === t.size) }));
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionTitle>Fleet · {state.trailers.length} units</SectionTitle>
          <p className="text-xs mt-1" style={{ color: T.sub }}><b>Add equipment</b> = a brand-new product or rental. <b>Add unit</b> = another physical one of a product you already offer.</p>
        </div>
        <button onClick={() => setAddingType(true)} className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0" style={{ background: T.amber, color: T.steelDk }}>
          <Plus size={16} /> Add equipment
        </button>
      </div>
      {bySize.map((grp) => (
        <Card key={grp.size} className="p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h3 className="font-bold truncate">{grp.name}</h3>
              <div className="text-xs" style={{ color: T.sub }}>{grp.cuyd ? grp.cuyd + " · " : ""}${grp.daily}/day · ${grp.weekly}/wk · ${grp.monthly}/4wk</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: T.paper, color: T.sub }}>{grp.units.length} unit{grp.units.length !== 1 ? "s" : ""}</span>
              <button onClick={() => setUnitSize(grp.size)} className="text-xs font-bold px-2 py-1 rounded flex items-center gap-1" style={{ background: T.steel, color: "#fff" }}><Plus size={12} /> Add unit</button>
            </div>
          </div>
          {grp.units.length === 0 && <div className="text-xs text-center py-3 rounded-lg" style={{ color: T.sub, background: T.paper }}>No units yet — click “Add unit” to add your first one.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {grp.units.map((tr) => {
              const st = trailerStatus(tr);
              const cb = currentBooking(tr);
              return (
                <div key={tr.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: T.paper }}>
                  <div>
                    <div className="font-bold text-sm tabular-nums">{tr.assetId}</div>
                    <div className="text-xs" style={{ color: T.sub }}>{cb ? `${cb.name} · back ${fmt(cb.end)}` : `VIN ${tr.vin}`}</div>
                    <div className="text-[11px] flex items-center gap-1 mt-1" style={{ color: T.sub }}>
                      <span>Purchase $</span>
                      <input type="number" value={tr.cost || 0} onChange={(e) => update((n) => { n.trailers.find((x) => x.id === tr.id).cost = +e.target.value; })}
                        className="w-20 px-1.5 py-0.5 rounded tabular-nums" style={{ border: `1px solid ${T.line}`, background: "#fff" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={st} />
                    <button onClick={() => { update((n) => { n.trailers.find((x) => x.id === tr.id).maint = !tr.maint; }); flash(tr.maint ? "Back in service." : "Marked down for maintenance.", true); }}
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
      {addingType && <AddTypeModal existing={state.types} onPhoto={fileToScaledDataURL} onClose={() => setAddingType(false)}
        onAdd={(t) => { update((n) => n.types.push(t)); setAddingType(false); flash(`Added ${t.name}.`, true); }} />}
      {unitSize && <AddTrailerModal state={state} initialSize={unitSize} onClose={() => setUnitSize(null)}
        onAdd={(tr) => { update((n) => n.trailers.push(tr)); setUnitSize(null); flash(`Added ${tr.assetId}.`, true); }} />}
    </div>
  );
}

function AddTrailerModal({ state, onClose, onAdd, initialSize }) {
  const [size, setSize] = useState(initialSize || state.types[0].size);
  const [assetId, setAssetId] = useState("");
  const [vin, setVin] = useState("");
  const [cost, setCost] = useState(0);
  return (
    <Modal onClose={onClose} title="Add a unit">
      <div className="space-y-3">
        <Field label="Equipment type">
          <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
            {state.types.map((t) => <option key={t.size} value={t.size}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Asset ID"><input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="e.g. 7x14-E" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="VIN / serial"><input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="optional" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
          <Field label="Purchase price ($)"><NumInput v={cost} on={setCost} /></Field>
        </div>
        <p className="text-[11px]" style={{ color: T.sub }}>Purchase price powers the ROI numbers on the Insights tab.</p>
      </div>
      <button disabled={!assetId} onClick={() => onAdd({ id: "t" + Date.now(), size, assetId, vin: vin || "—", maint: false, cost })}
        className="w-full mt-4 py-2.5 rounded-lg font-bold disabled:opacity-40" style={{ background: T.steel, color: "#fff" }}>Add to fleet</button>
    </Modal>
  );
}

/* ---------------- INSIGHTS (fleet analytics) --------------- */
const CHART_COLORS = [T.green, T.blue, T.amber, T.red, T.steel, "#7C5CBF", "#2FA8A8", T.gray];
const money = (v) => "$" + Math.round(v || 0).toLocaleString();
const pct1 = (v) => (v || 0).toFixed(1) + "%";
const monthKey = (isoStr) => (isoStr || "").slice(0, 7);
const monthLabel = (key) => { const [y, m] = key.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-US", { month: "short" }); };
const REV_OK = (b) => b.status === "reserved" || b.status === "out" || b.status === "returned";

/* downscale an uploaded image to a small JPEG data URL so it fits in browser storage */
function fileToScaledDataURL(file, maxW = 900, mime = "image/jpeg", quality = 0.82) {
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { res(c.toDataURL(mime, quality)); } catch (e) { res(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

/* read a file (image or PDF) as a raw data URL — for COIs */
function fileToDataURL(file) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(file); });
}
/* like fileToDataURL but downscales photos (canvas → JPEG) so many job photos don't bloat the cloud blob */
async function fileToResizedDataURL(file, maxDim = 1280, quality = 0.72) {
  const dataUrl = await fileToDataURL(file);
  if (!dataUrl || !/^data:image\//.test(dataUrl)) return dataUrl; // non-image (e.g. PDF) → keep as-is
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1) return dataUrl;
    const cw = Math.round(img.width * scale), ch = Math.round(img.height * scale);
    const canvas = document.createElement("canvas"); canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
    return canvas.toDataURL("image/jpeg", quality);
  } catch (e) { return dataUrl; }
}
/* open a stored data-URL document in a new tab */
async function openStoredFile(dataUrl) {
  try { const blob = await (await fetch(dataUrl)).blob(); window.open(URL.createObjectURL(blob), "_blank"); }
  catch (e) { try { window.open(dataUrl, "_blank"); } catch (e2) {} }
}
/* download a stored data-URL document to the device */
function downloadStoredFile(dataUrl, filename) {
  try {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename || "download";
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { openStoredFile(dataUrl); }
}

/* Certificate-of-Insurance requirement: a per-equipment policy combined with who's renting.
   policy: "none" (never) · "commercial" (business customers only, default) · "all" (everyone). */
const COI_POLICIES = [["commercial", "Business customers only"], ["all", "All customers"], ["none", "Not required"]];
const COI_POLICY_LABEL = { commercial: "Business customers only", all: "All customers", none: "Not required" };
function coiRequired(type, ctype) {
  const p = (type && type.coiPolicy) || "commercial";
  if (p === "none") return false;
  if (p === "all") return true;
  return ctype === "commercial";
}
/* the name that should appear as additionally insured on a COI (legal/LLC name if set, else brand) */
const insuredName = (biz) => (biz && (biz.legalName || biz.name)) || "";
/* the most recent still-valid COI a customer already has on file (matched by phone/email), for reuse */
function latestValidCoi(state, phone, email) {
  const dg = (s) => (s || "").replace(/\D/g, "");
  const ph = dg(phone), em = (email || "").trim().toLowerCase();
  if (!ph && !em) return null;
  const t0 = today();
  const matches = (state.bookings || []).filter((b) => b.coiFile && b.status !== "cancelled" &&
    ((em && (b.email || "").trim().toLowerCase() === em) || (ph && dg(b.phone) && dg(b.phone) === ph)) &&
    (!b.coiExpiry || b.coiExpiry >= t0));
  matches.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  return matches[0] ? { coiFile: matches[0].coiFile, coiName: matches[0].coiName, coiExpiry: matches[0].coiExpiry || "" } : null;
}

/* channel label for customer notifications */
const channelLabel = (ch) => ch === "text" ? "text" : ch === "email" ? "email" : "text & email";
/* build the notification schedule for a booking from the business's notify settings.
   Delivery/sending is simulated until Phase 5 wires up an email/SMS provider + scheduler. */
function notifyTimeline(state, b) {
  const biz = state.business || {};
  const now = Date.now();
  const bookedAt = b.signedAt ? new Date(b.signedAt).getTime() : null;
  const pickup = slotDateTime(b.start, b.pickupTime).getTime();
  const items = [];
  if (biz.notifyConfirm !== false) items.push({ label: "Booking confirmation", at: bookedAt, kind: "confirm" });
  if (biz.notifyWaiver !== false && b.signName) items.push({ label: "Copy of signed agreement & waiver", at: bookedAt, kind: "waiver" });
  (biz.notifyReminders || []).slice().sort((a, c) => c - a).forEach((h) => {
    items.push({ label: `Reminder · ${leadLabel(h)} before pickup`, at: pickup - h * 3600000, kind: "reminder", hours: h });
  });
  const type = (state.types || []).find((t) => t.size === b.size);
  if (coiRequired(type, b.type) && !b.coiFile) {
    const h = (biz.notifyReminders && biz.notifyReminders.length) ? Math.min(...biz.notifyReminders) : 24;
    items.push({ label: "Reminder · upload Certificate of Insurance", at: pickup - h * 3600000, kind: "coi" });
  }
  return items.map((it) => ({ ...it, sent: it.at != null && it.at <= now }));
}

/* roll every booking up into a per-customer record (keyed by name) with full history */
function computeCustomers(state) {
  const map = new Map();
  (state.bookings || []).forEach((b) => {
    const key = (b.name || "—").trim().toLowerCase();
    if (!map.has(key)) map.set(key, { key, name: b.name || "—", type: b.type, phone: "", email: "", address: "", bookings: [], spent: 0, rentals: 0, coiCount: 0, waiverCount: 0 });
    const c = map.get(key);
    c.bookings.push(b);
    if (b.phone) c.phone = b.phone;
    if (b.email) c.email = b.email;
    if (b.address) c.address = b.address;
    if (b.type) c.type = b.type;
    if (b.status !== "cancelled") { c.spent += (b.price || 0); c.rentals += 1; }
    if (b.coi || b.coiFile) c.coiCount += 1;
    if (b.signName) c.waiverCount += 1;
  });
  const list = [...map.values()].map((c) => {
    c.bookings.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    c.lastRental = c.bookings[0] ? c.bookings[0].start : "";
    return c;
  });
  list.sort((a, b) => b.spent - a.spent);
  return list;
}

function computeInsights(state) {
  const trailers = state.trailers || [];
  const types = state.types || [];
  const bookings = (state.bookings || []).filter(REV_OK);
  const totalCost = trailers.reduce((a, t) => a + (t.cost || 0), 0);
  const totalRev = bookings.reduce((a, b) => a + (b.price || 0), 0);
  const fleetROI = totalCost ? (totalRev / totalCost) * 100 : 0;

  const revByType = types.map((t, i) => ({
    label: t.size, name: t.name, color: CHART_COLORS[i % CHART_COLORS.length],
    value: bookings.filter((b) => b.size === t.size).reduce((a, b) => a + (b.price || 0), 0),
  }));
  const costByType = types.map((t, i) => ({
    label: t.size, name: t.name, color: CHART_COLORS[i % CHART_COLORS.length],
    value: trailers.filter((tr) => tr.size === t.size).reduce((a, tr) => a + (tr.cost || 0), 0),
  }));

  const months = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  const revByMonth = months.map((k) => ({ label: monthLabel(k), value: bookings.filter((b) => monthKey(b.start) === k).reduce((a, b) => a + (b.price || 0), 0) }));

  const winDays = 90, winStart = addDays(today(), -winDays);
  const perAsset = trailers.map((tr) => {
    const bk = bookings.filter((b) => b.trailerId === tr.id);
    const rev = bk.reduce((a, b) => a + (b.price || 0), 0);
    let days = 0;
    bk.forEach((b) => { if (b.end >= winStart) { const s = b.start < winStart ? winStart : b.start; days += Math.max(0, daysBetween(s, b.end) + 1); } });
    const util = Math.min(100, (days / winDays) * 100);
    const roi = tr.cost ? (rev / tr.cost) * 100 : 0;
    const type = types.find((t) => t.size === tr.size);
    return { tr, name: tr.assetId, typeName: type ? type.name : tr.size, rev, days, util, roi, cost: tr.cost || 0 };
  });
  const utilWeighted = trailers.length ? (perAsset.reduce((a, p) => a + p.days, 0) / (trailers.length * winDays)) * 100 : 0;
  const worst = [...perAsset].sort((a, b) => a.roi - b.roi || a.rev - b.rev).slice(0, 8);
  const top = [...perAsset].sort((a, b) => b.roi - a.roi).slice(0, 5);

  return { totalCost, totalRev, fleetROI, revByType, costByType, revByMonth, perAsset, utilWeighted, worst, top, rentals: bookings.length, winDays };
}

/* --- tiny dependency-free charts --- */
function BarChart({ data, height = 150, color = T.green, money: isMoney }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0 h-full">
            {d.value > 0 && <div className="text-[9px] tabular-nums mb-0.5 whitespace-nowrap" style={{ color: T.sub }}>{isMoney ? money(d.value) : Math.round(d.value)}</div>}
            <div className="w-full rounded-t" style={{ height: `${(d.value / max) * 84}%`, background: d.color || color, minHeight: d.value > 0 ? 3 : 0 }} title={`${d.name || d.label}: ${isMoney ? money(d.value) : d.value}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d, i) => <div key={i} className="flex-1 text-center text-[10px] truncate min-w-0" style={{ color: T.sub }}>{d.label}</div>)}
      </div>
    </div>
  );
}
function LineChart({ data, height = 150, color = T.blue }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const xy = data.map((d, i) => [n > 1 ? (i / (n - 1)) * 100 : 50, 100 - (d.value / max) * 88 - 6]);
  const line = xy.map((p) => p.join(",")).join(" ");
  const area = `0,100 ${line} 100,100`;
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height }}>
        {[6, 28, 50, 72, 94].map((g) => <line key={g} x1="0" y1={g} x2="100" y2={g} stroke={T.line} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />)}
        <polygon points={area} fill={color} opacity="0.10" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex mt-1.5">
        {data.map((d, i) => <div key={i} className="flex-1 text-center text-[10px] truncate" style={{ color: T.sub }}>{d.label}</div>)}
      </div>
    </div>
  );
}
function Donut({ data, size = 128 }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  return (
    <svg viewBox="0 0 36 36" style={{ width: size, height: size }}>
      <circle cx="18" cy="18" r="15.9" fill="none" stroke={T.line} strokeWidth="3.4" />
      {data.filter((d) => d.value > 0).map((d, i) => {
        const p = (d.value / total) * 100;
        const el = <circle key={i} cx="18" cy="18" r="15.9" fill="none" stroke={d.color} strokeWidth="3.4" pathLength="100" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={25 - acc} strokeLinecap="butt" />;
        acc += p; return el;
      })}
    </svg>
  );
}
function StatTile({ label, value, sub, accent = T.steel, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: T.sub }}>{label}</div>
        {Icon && <Icon size={15} style={{ color: accent }} />}
      </div>
      <div className="text-3xl font-extrabold tabular-nums" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: T.sub }}>{sub}</div>}
    </Card>
  );
}
function ChartCard({ title, period, children }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">{title}</h3>
        {period && <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1" style={{ background: T.paper, color: T.sub }}><Clock size={10} /> {period}</span>}
      </div>
      {children}
    </Card>
  );
}

function InsightsView({ state }) {
  const d = useMemo(() => computeInsights(state), [state]);
  const cust = useMemo(() => computeCustomers(state), [state]);
  const repeatRate = cust.length ? (cust.filter((c) => c.rentals > 1).length / cust.length) * 100 : 0;
  const commercialRate = cust.length ? (cust.filter((c) => c.type === "commercial").length / cust.length) * 100 : 0;
  const avgBooking = d.rentals ? d.totalRev / d.rentals : 0;
  const topCust = cust.slice(0, 6).map((c) => ({ label: c.name.split(" ")[0], name: c.name, value: c.spent }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Insights</SectionTitle>
        <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.amberSoft, color: T.amberDk }}>Sample data</span>
      </div>
      <p className="text-sm -mt-2" style={{ color: T.sub }}>How your fleet is performing — revenue, utilization, and return on each asset. Numbers come straight from your bookings.</p>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Fleet ROI" value={pct1(d.fleetROI)} sub="revenue ÷ purchase cost" accent={T.green} icon={TrendingUp} />
        <StatTile label="Weighted utilization" value={pct1(d.utilWeighted)} sub={`last ${d.winDays} days`} accent={T.blue} icon={Percent} />
        <StatTile label="Revenue" value={money(d.totalRev)} sub="all recorded rentals" accent={T.steel} icon={DollarSign} />
        <StatTile label="Rentals" value={d.rentals} sub={`across ${state.trailers.length} units`} accent={T.amberDk} icon={ClipboardList} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Revenue by month" period="Last 8 months"><LineChart data={d.revByMonth} color={T.blue} /></ChartCard>
        <ChartCard title="Revenue by equipment type" period="All time"><BarChart data={d.revByType} color={T.green} money /></ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Fleet value by category" period="Purchase cost">
          <div className="flex items-center gap-4">
            <Donut data={d.costByType} />
            <div className="space-y-1.5 min-w-0">
              {d.costByType.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: c.color }} />
                  <span className="font-semibold truncate">{c.name}</span>
                  <span className="tabular-nums ml-auto" style={{ color: T.sub }}>{money(c.value)}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs pt-1 border-t" style={{ borderColor: T.line }}>
                <span className="font-bold">Total invested</span>
                <span className="tabular-nums ml-auto font-bold">{money(d.totalCost)}</span>
              </div>
            </div>
          </div>
        </ChartCard>
        <ChartCard title="Top performers by ROI" period="All time">
          <div className="space-y-1.5">
            {d.top.map((p) => (
              <div key={p.tr.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: T.paper }}>
                <span className="font-bold text-sm tabular-nums w-16 shrink-0">{p.name}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: T.line }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.roi / (d.top[0].roi || 1)) * 100)}%`, background: T.green }} />
                </div>
                <span className="text-xs font-bold tabular-nums w-14 text-right" style={{ color: T.green }}>{pct1(p.roi)}</span>
                <span className="text-xs tabular-nums w-16 text-right" style={{ color: T.sub }}>{money(p.rev)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Worst ROI — "trash to cash" */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} style={{ color: T.red }} />
            <h3 className="font-bold text-sm">Underperformers — lowest ROI</h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: T.paper, color: T.sub }}>Idle or low-earning assets</span>
        </div>
        <p className="text-xs mb-3" style={{ color: T.sub }}>The units earning least against what you paid — candidates to push harder on, relocate, or sell.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide" style={{ color: T.sub }}>
                <th className="text-left font-bold py-1.5">Asset</th>
                <th className="text-left font-bold py-1.5">Type</th>
                <th className="text-right font-bold py-1.5">Purchase</th>
                <th className="text-right font-bold py-1.5">Revenue</th>
                <th className="text-right font-bold py-1.5">ROI</th>
              </tr>
            </thead>
            <tbody>
              {d.worst.map((p) => (
                <tr key={p.tr.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td className="py-2 font-bold tabular-nums">{p.name}</td>
                  <td className="py-2 truncate" style={{ color: T.sub }}>{p.typeName}</td>
                  <td className="py-2 text-right tabular-nums">{money(p.cost)}</td>
                  <td className="py-2 text-right tabular-nums">{money(p.rev)}</td>
                  <td className="py-2 text-right tabular-nums font-bold" style={{ color: p.roi < 20 ? T.red : T.ink }}>{pct1(p.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Customers */}
      <div className="flex items-center gap-2 pt-2">
        <Users size={18} style={{ color: T.steel }} />
        <h2 className="text-lg font-extrabold tracking-tight">Customers</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Customers" value={cust.length} sub="unique renters" accent={T.steel} icon={Users} />
        <StatTile label="Repeat rate" value={pct1(repeatRate)} sub="rented more than once" accent={T.green} icon={RotateCcw} />
        <StatTile label="Avg booking" value={money(avgBooking)} sub="per rental" accent={T.amberDk} icon={DollarSign} />
        <StatTile label="Commercial" value={pct1(commercialRate)} sub="vs. homeowner" accent={T.blue} icon={Building2} />
      </div>
      <ChartCard title="Top customers by revenue" period="All time">
        {topCust.length ? <BarChart data={topCust} color={T.steel} money /> : <Empty>No customer revenue yet.</Empty>}
      </ChartCard>

      {/* AI assistant teaser */}
      <Card className="p-4" style={{ border: `1px dashed ${T.amber}` }}>
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: T.amberSoft }}><Sparkles size={18} style={{ color: T.amberDk }} /></span>
          <div>
            <div className="font-bold text-sm flex items-center gap-2">Ask-in-plain-English dashboards <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: T.amber, color: T.steelDk }}>COMING SOON</span></div>
            <p className="text-xs mt-1" style={{ color: T.sub }}>Soon you'll type “show me revenue by customer this quarter” or “which trailers sat idle last month” and this page builds the chart for you. Turned on when we wire up the AI backend.</p>
          </div>
        </div>
      </Card>
      <p className="text-xs text-center pt-1" style={{ color: T.sub }}>Utilization is booked days ÷ available days over the last {d.winDays} days. ROI is lifetime revenue ÷ purchase price.</p>
    </div>
  );
}

/* ---------------- CUSTOMERS (database + history + search) --------------- */
const STATUS_PILL = {
  reserved: ["Reserved", T.amberDk, T.amberSoft], out: ["Out", T.blue, T.blueSoft],
  overdue: ["Overdue", T.red, T.redSoft], returned: ["Completed", T.green, T.greenSoft],
  cancelled: ["Cancelled", T.sub, T.graySoft],
};
function StatusPill({ b }) {
  const k = b.status === "out" && b.end < today() ? "overdue" : b.status;
  const [label, c, bg] = STATUS_PILL[k] || ["—", T.sub, T.graySoft];
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: c, background: bg }}>{label}</span>;
}
function CustomersView({ state, openDetail }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const customers = useMemo(() => computeCustomers(state), [state]);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? customers.filter((c) =>
    c.name.toLowerCase().includes(ql) ||
    (c.phone || "").toLowerCase().includes(ql) ||
    (c.email || "").toLowerCase().includes(ql) ||
    c.bookings.some((b) => (b.code || "").toLowerCase().includes(ql))
  ) : customers;
  return (
    <div className="space-y-4">
      <SectionTitle>Customers · {customers.length}</SectionTitle>
      <p className="text-sm -mt-2" style={{ color: T.sub }}>Everyone who's rented, with their full history, signed waivers, and COIs. Search by name, phone, email, or confirmation number.</p>
      <div className="relative">
        <Search size={16} style={{ color: T.sub, position: "absolute", left: 12, top: 13 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or confirmation # (e.g. Miller, or WY-1001)…"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
      </div>
      {filtered.length === 0 && <Empty>No customers match “{q}”.</Empty>}
      {filtered.map((c) => {
        const expanded = open === c.key;
        return (
          <Card key={c.key} className="p-0 overflow-hidden">
            <button onClick={() => setOpen(expanded ? null : c.key)} className="w-full text-left p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold" style={{ background: c.type === "commercial" ? T.blue : T.steel }}>{c.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="font-bold truncate flex items-center gap-1.5">{c.name} {c.rentals > 1 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: T.greenSoft, color: T.green }}>Repeat</span>}</div>
                  <div className="text-xs truncate" style={{ color: T.sub }}>{c.type === "commercial" ? "Business" : "Homeowner"} · {c.phone || c.email || "—"}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold tabular-nums">{money(c.spent)}</div>
                <div className="text-xs" style={{ color: T.sub }}>{c.rentals} rental{c.rentals !== 1 ? "s" : ""} · last {fmt(c.lastRental)}</div>
              </div>
            </button>
            {expanded && (
              <div className="px-4 pb-4 space-y-2" style={{ borderTop: `1px solid ${T.line}` }}>
                <div className="flex items-center gap-3 text-xs pt-3 flex-wrap" style={{ color: T.sub }}>
                  {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1"><Phone size={12} />{c.phone}</a>}
                  {c.email && <span className="flex items-center gap-1"><Mail size={12} />{c.email}</span>}
                  {c.address && <span className="flex items-center gap-1"><MapPin size={12} />{c.address}</span>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.greenSoft, color: T.green }}>{c.waiverCount} signed waiver{c.waiverCount !== 1 ? "s" : ""}</span>
                  <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: c.coiCount ? T.blueSoft : T.graySoft, color: c.coiCount ? T.blue : T.sub }}>{c.coiCount} COI{c.coiCount !== 1 ? "s" : ""} on file</span>
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wide pt-1" style={{ color: T.sub }}>Rental history</div>
                {c.bookings.map((b) => (
                  <button key={b.id} onClick={() => openDetail(b)} className="w-full text-left flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: T.paper }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{b.code} · {b.size} <span className="font-normal" style={{ color: T.sub }}>· {fmt(b.start)}–{fmt(b.end)}</span></div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusPill b={b} />
                        {b.signName && <span className="text-[10px] font-bold px-1 py-0.5 rounded" style={{ background: T.greenSoft, color: T.green }}>Waiver</span>}
                        {(b.coiFile || b.coi) && <span className="text-[10px] font-bold px-1 py-0.5 rounded" style={{ background: T.blueSoft, color: T.blue }}>COI</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold tabular-nums">{money(b.price)}</div>
                      <div className="text-[11px]" style={{ color: T.sub }}>view →</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- DRIVERS & PAY --------------- */
function TeamView({ state, setBooking, update, flash, openDetail }) {
  const [adding, setAdding] = useState(false);
  const [editAvail, setEditAvail] = useState(null); // {driverId, date}
  const runs = legRuns(state);
  const fee = state.business.contractorFee;
  const yardFee = state.business.counterFee;
  const events = yardEvents(state).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const auto = state.business.dispatchMode === "auto";
  const counterAuto = state.business.counterMode === "auto";
  const personName = (id) => id === "owner" ? "You" : (state.contractors.find((c) => c.id === id)?.name.split(" ")[0] || "—");

  const reassign = (r, cid) => setBooking(r.bookingId, r.leg === "out" ? { outBy: cid } : { returnBy: cid });
  const markPaidJob = (r, jobFee) => { setBooking(r.bookingId, r.leg === "out" ? { outPaid: true } : { returnPaid: true }); flash(`Marked paid $${jobFee}.`, true); };
  const setMode = (m) => update((n) => { n.business.dispatchMode = m; });
  const setCounterMode = (m) => update((n) => { n.business.counterMode = m; });

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
    flash(`${name} out today · ${moved} job${moved !== 1 ? "s" : ""} reassigned${orphan ? ` · ${orphan} need a hand (no one free)` : ""}.`, true);
  };
  /* longer absence: toggle inactive and, when going inactive, free their upcoming unpaid work to requeue */
  const toggleActive = (c) => {
    update((n) => {
      const d = n.contractors.find((x) => x.id === c.id);
      d.active = !c.active;
      if (!d.active) n.bookings.forEach((b) => {
        if (b.status === "returned" || b.status === "cancelled") return;
        if (b.outBy === c.id && !b.outPaid) b.outBy = null;
        if (b.returnBy === c.id && !b.returnPaid) b.returnBy = null;
      });
    });
    flash(c.active ? `${c.name.split(" ")[0]} set inactive · their runs freed up.` : `${c.name.split(" ")[0]} set active.`, true);
  };
  const horizon = state.business.bookHorizonDays || 30;
  const days = Array.from({ length: horizon }, (_, i) => addDays(today(), i));

  // ── ONE flat list of every job (delivery runs + yard handoffs) so each job appears exactly once ──
  const allJobs = [
    ...runs.map((r) => ({ ...r, kind: "road", jobFee: fee })),
    ...events.map((e) => ({ ...e, kind: "yard", jobFee: yardFee, label: e.leg === "out" ? "Pickup" : "Return" })),
  ];
  const jobActive = (j) => j.status === "reserved" || j.status === "out"; // a live/upcoming rental, not a finished one
  const jobNeedsDriver = (j) => j.kind === "road" && !j.by && jobActive(j); // yard handoffs default to You, so only road runs can be truly unassigned
  const jobDone = (j) => !!j.date && j.date < today();                      // the leg's day has passed → the work already happened
  const needCount = allJobs.filter(jobNeedsDriver).length;
  // SECTION 1 (coverage): jobs still needing someone, plus everything coming up (today or later)
  const coverJobs = allJobs
    .filter((j) => jobNeedsDriver(j) || (jobActive(j) && !jobDone(j)))
    .sort((a, b) => {
      const ua = jobNeedsDriver(a) ? 0 : 1, ub = jobNeedsDriver(b) ? 0 : 1;
      if (ua !== ub) return ua - ub;               // jobs still needing a driver float to the top
      return (a.date || "").localeCompare(b.date || "");
    });
  // SECTION 2 (pay): finished jobs assigned to a real person that you haven't paid yet
  const payJobs = allJobs
    .filter((j) => j.by && j.by !== "owner" && !j.paid && jobDone(j))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  // "you owe" = the finished, still-unpaid work (future assigned jobs aren't owed until they happen)
  const owedBy = {};
  payJobs.forEach((j) => { owedBy[j.by] = (owedBy[j.by] || 0) + j.jobFee; });
  const owedRoad = payJobs.filter((j) => j.kind === "road").reduce((s, j) => s + j.jobFee, 0);
  const owedYardTotal = payJobs.filter((j) => j.kind === "yard").reduce((s, j) => s + j.jobFee, 0);
  const owedTotal = owedRoad + owedYardTotal;
  const autoOne = (j) => { const cid = assignRun(state, j.date, j.time, null, Date.now()); if (!cid) { flash("No one's free then — set their hours or pick someone manually."); return; } reassign(j, cid); };
  const autoAssignEverything = () => {
    let s = structuredClone(state); let rot = 0; let n = 0;
    [...legRuns(s).filter((r) => !r.by), ...yardEvents(s).filter((e) => !e.by || e.by === "owner")].forEach((j) => {
      const cid = assignRun(s, j.date, j.time, null, rot++); if (!cid) return;
      const bk = s.bookings.find((x) => x.id === j.bookingId); if (!bk) return;
      if (j.leg === "out") bk.outBy = cid; else bk.returnBy = cid; n++;
    });
    update((nn) => { nn.bookings = s.bookings; });
    flash(n ? `Auto-assigned ${n} job${n > 1 ? "s" : ""} to available people.` : "No jobs could be auto-assigned right now.", !!n);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle>Team & dispatch</SectionTitle>
        <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5" style={{ background: T.amber, color: T.steelDk }}>
          <Plus size={16} /> Add employee
        </button>
      </div>

      <Card className="p-4" style={{ background: T.blueSoft }}>
        <div className="text-sm" style={{ color: T.blue }}>
          This page is your crew and their work, in order: <b>1)</b> who's covering each upcoming job, <b>2)</b> who you need to pay for finished jobs, <b>3)</b> your people, <b>4)</b> the hours they can work, <b>5)</b> auto-assign settings. A rental has two kinds of jobs — a <b>delivery run</b> someone drives out, and a <b>yard handoff</b> when the customer comes to your yard. The same people do both.
        </div>
      </Card>

      {/* ─────────── 1) COVERAGE — upcoming jobs & who's on each ─────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-sm font-bold">1 · Jobs coming up — who's covering each</div>
          {needCount > 0 && <button onClick={autoAssignEverything} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: T.amber, color: T.steelDk }}>Auto-assign all</button>}
        </div>
        <div className="text-xs mb-3 leading-snug" style={{ color: T.sub }}>
          Every job from today forward. {needCount > 0
            ? <><b style={{ color: T.amberDk }}>{needCount} still need{needCount === 1 ? "s" : ""} a driver</b> (highlighted at top) — pick a name or tap Auto.</>
            : "Everyone's covered."} Use the dropdown to change who's on a job. <span style={{ color: T.sub }}>Paying people happens in the next section, once a job is done.</span>
        </div>
        {coverJobs.length === 0 ? <Empty>Nothing scheduled. New bookings land here automatically.</Empty> : (
          <div className="space-y-1.5">
            {coverJobs.map((j) => {
              const need = jobNeedsDriver(j);
              return (
                <div key={j.key} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: need ? T.amberSoft : T.paper, border: need ? `1px solid ${T.amber}` : "1px solid transparent" }}>
                  <button onClick={() => openDetail(state.bookings.find((x) => x.id === j.bookingId))} className="flex items-center gap-2 min-w-0 text-left">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ color: "#fff", background: j.leg === "out" ? T.amberDk : T.blue }}>{j.label}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{j.name}</div>
                      <div className="text-xs" style={{ color: T.sub }}>{fmt(j.date)}{j.time ? ` · ${j.time}` : ""} · {j.kind === "road" ? "delivery run" : "yard handoff"}</div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select value={j.by || (j.kind === "yard" ? "owner" : "")} onChange={(e) => reassign(j, e.target.value)} className="text-[11px] rounded px-1 py-1" style={{ border: `1px solid ${need ? T.amber : T.line}`, color: T.sub }}>
                      {j.kind === "road" && !j.by && <option value="">Assign…</option>}
                      {j.kind === "yard" && <option value="owner">You</option>}
                      {state.contractors.filter((x) => x.active || x.id === j.by).map((x) => <option key={x.id} value={x.id}>{x.name.split(" ")[0]}</option>)}
                    </select>
                    {need && <button onClick={() => autoOne(j)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.steel, color: "#fff" }}>Auto</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─────────── 2) PAY — finished jobs you still owe someone for ─────────── */}
      <Card className="p-4">
        <div className="text-sm font-bold mb-1">2 · To pay <span className="font-normal" style={{ color: T.sub }}>· ${owedTotal} owed</span></div>
        <div className="text-xs mb-3 leading-snug" style={{ color: T.sub }}>
          Finished jobs you haven't paid yet ({owedTotal > 0 ? <><b>${owedRoad}</b> delivery runs · <b>${owedYardTotal}</b> yard handoffs</> : "nothing right now"}). Anything you covered yourself is free. Pay the person in Stripe, then tap <b>Mark paid</b> here to clear it.
        </div>
        {payJobs.length === 0 ? <Empty>All caught up — nobody's owed right now.</Empty> : (
          <div className="space-y-1.5">
            {payJobs.map((j) => (
              <div key={j.key} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: T.paper }}>
                <button onClick={() => openDetail(state.bookings.find((x) => x.id === j.bookingId))} className="flex items-center gap-2 min-w-0 text-left">
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ color: "#fff", background: j.leg === "out" ? T.amberDk : T.blue }}>{j.label}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{personName(j.by)} · {j.name}</div>
                    <div className="text-xs" style={{ color: T.sub }}>{fmt(j.date)} · {j.kind === "road" ? "delivery run" : "yard handoff"}</div>
                  </div>
                </button>
                <button onClick={() => markPaidJob(j, j.jobFee)} className="text-[11px] font-bold px-2.5 py-1.5 rounded shrink-0" style={{ background: T.steel, color: "#fff" }}>Mark paid ${j.jobFee}</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─────────── 3) THE PEOPLE — roster ─────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-bold">3 · Your team</div>
          <button onClick={() => setAdding(true)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1" style={{ background: T.amber, color: T.steelDk }}><Plus size={14} /> Add employee</button>
        </div>
        <div className="text-xs mb-3 leading-snug" style={{ color: T.sub }}>
          Everyone who works for you. Add a new person, or use sick / inactive to take someone off the schedule.
        </div>
        <div className="space-y-2">
          {state.contractors.map((c) => {
            const open = allJobs.filter((j) => j.by === c.id && !j.paid && jobActive(j)).length;
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: T.paper }}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0" style={{ background: c.active ? T.steel : T.graySoft, color: c.active ? "#fff" : T.sub }}>{c.name.split(" ").map((w) => w[0]).join("")}</div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{c.name} {!c.active && <span className="text-xs font-normal" style={{ color: T.sub }}>· inactive</span>}</div>
                    <div className="text-xs truncate" style={{ color: T.sub }}>{c.vehicle} · {c.phone}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px]" style={{ color: T.sub }}>{open === 0 ? "no jobs booked" : `${open} job${open === 1 ? "" : "s"} booked`}</div>
                  <div className="flex gap-2 justify-end mt-0.5">
                    {c.active && <button onClick={() => sickDay(c.id, c.name.split(" ")[0])} className="text-[11px] font-bold" style={{ color: T.red }}>sick today</button>}
                    <button onClick={() => toggleActive(c)} className="text-[11px] font-bold" style={{ color: T.sub }}>{c.active ? "set inactive" : "set active"}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: T.sub }}><b>sick today</b> frees just today's jobs and hands them to someone else; <b>set inactive</b> takes a person off the schedule for a while and frees their upcoming jobs.</p>
      </Card>

      {/* ─────────── 3) THE HOURS — availability calendar ─────────── */}
      <Card className="p-3 overflow-x-auto">
        <div className="px-1 mb-3">
          <div className="text-sm font-bold">4 · When each person works — next {horizon} days</div>
          <div className="text-xs mt-1 leading-snug" style={{ color: T.sub }}>
            Each row is a person; each column is a day. The color shows how much of that day they can work — <b style={{ color: T.green }}>green</b> = free most of the day, <b style={{ color: T.amberDk }}>amber</b> = only an hour or two, <b>blank</b> = not working. A number in a square means that many jobs are already booked on them that day. <b>Tap any square to set that person's hours.</b> Customers can only pick a delivery or pickup time when someone is marked free — so keep this current.
          </div>
        </div>
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
                const dayRuns = [...runs, ...events].filter((r) => r.by === c.id && r.date === d);
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
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: T.green }} /> free most of the day</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#8FBF6F" }} /> part of the day</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: T.amber }} /> just an hour or two</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#F3EFE8" }} /> not working</span>
          <span><b>1</b> = jobs booked that day</span>
        </div>
      </Card>

      {/* ─────────── 4) AUTOMATION — how new bookings get assigned ─────────── */}
      <Card className="p-4 space-y-3">
        <div>
          <div className="text-sm font-bold">5 · Auto-assign settings</div>
          <div className="text-xs mt-1" style={{ color: T.sub }}>Set once. This decides who picks up each new booking automatically — you can always change any single job in the list above.</div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <div>
            <div className="text-sm font-bold">Delivery &amp; collection runs</div>
            <div className="text-xs" style={{ color: T.sub }}>{auto ? "Auto: shared out evenly to whoever's free that day." : "Manual: new runs wait in the list above for you to assign."}</div>
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: T.graySoft }}>
            {[["auto", "Auto"], ["manual", "Manual"]].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className="px-3 py-1.5 rounded-md text-xs font-bold"
                style={state.business.dispatchMode === m ? { background: "#fff", color: T.ink } : { color: T.sub }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
          <div>
            <div className="text-sm font-bold">Will-call &amp; yard handoffs</div>
            <div className="text-xs" style={{ color: T.sub }}>{counterAuto ? "Auto: shared out to whoever's free at the yard." : "You cover these yourself unless you assign someone in the list above."}</div>
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: T.graySoft }}>
            {[["self", "I cover it"], ["auto", "Auto to staff"]].map(([m, l]) => (
              <button key={m} onClick={() => setCounterMode(m)} className="px-3 py-1.5 rounded-md text-xs font-bold"
                style={state.business.counterMode === m ? { background: "#fff", color: T.ink } : { color: T.sub }}>{l}</button>
            ))}
          </div>
        </div>
      </Card>

      {adding && <AddContractorModal onClose={() => setAdding(false)}
        onAdd={(c) => { update((n) => n.contractors.push(c)); setAdding(false); flash(`Added ${c.name}.`, true); }} />}
      {editAvail && <AvailabilityEditor {...editAvail} state={state} update={update} onClose={() => setEditAvail(null)} />}
    </div>
  );
}

function AvailabilityEditor({ driverId, date, state, update, onClose }) {
  const c = state.contractors.find((x) => x.id === driverId);
  const wins = (c.avail && c.avail[date]) || [];
  const idxs = wins.map((w) => WINDOWS.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b);
  const from = idxs.length ? idxs[0] : null;      // start-of-shift window index (null = off)
  const to = idxs.length ? idxs[idxs.length - 1] : null;
  const working = from != null;
  const setRange = (f, t) => update((n) => {
    const d = n.contractors.find((x) => x.id === driverId);
    if (!d.avail) d.avail = {};
    if (f == null || t == null || t < f) { delete d.avail[date]; return; }
    d.avail[date] = WINDOWS.slice(f, t + 1); // a continuous range of hours they can work
  });
  const clearDay = () => update((n) => { const d = n.contractors.find((x) => x.id === driverId); if (d.avail) delete d.avail[date]; });
  const noon = WINDOWS.indexOf("12:00 PM");
  const presets = [["Morning", 0, noon], ["Afternoon", noon, WINDOWS.length - 1], ["All day", 0, WINDOWS.length - 1]];
  const jobs = [...legRuns(state), ...yardEvents(state)].filter((r) => r.by === driverId && r.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  return (
    <Modal onClose={onClose} title={`${c.name.split(" ")[0]} · ${fmtLong(date)}`}>
      <p className="text-sm mb-3" style={{ color: T.ink }}>Set the hours {c.name.split(" ")[0]} can work this day as a <b>range</b>. Customers then book a single start time inside these hours.</p>
      <div className="flex gap-2 mb-3">
        <button onClick={() => { if (!working) setRange(0, WINDOWS.length - 1); }} className="flex-1 py-2 rounded-lg text-sm font-bold" style={working ? { background: T.green, color: "#fff" } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>Working this day</button>
        <button onClick={clearDay} className="flex-1 py-2 rounded-lg text-sm font-bold" style={!working ? { background: T.steel, color: "#fff" } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>Off</button>
      </div>
      {working && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: T.sub }}>Starts</label>
              <select value={from} onChange={(e) => setRange(+e.target.value, Math.max(to, +e.target.value))} className="w-full p-2.5 rounded-lg text-sm mt-1" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
                {WINDOWS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: T.sub }}>Until</label>
              <select value={to} onChange={(e) => setRange(Math.min(from, +e.target.value), +e.target.value)} className="w-full p-2.5 rounded-lg text-sm mt-1" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
                {WINDOWS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {presets.map(([label, f, t]) => (
              <button key={label} onClick={() => setRange(f, t)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: T.paper, color: T.steel, border: `1px solid ${T.line}` }}>{label}</button>
            ))}
          </div>
          <div className="mt-3 text-sm p-2.5 rounded-lg text-center font-semibold" style={{ background: T.greenSoft, color: T.green }}>Free {WINDOWS[from]} – {WINDOWS[to]}</div>
        </>
      )}
      {jobs.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: T.sub }}>Already booked on {c.name.split(" ")[0]} this day</div>
          {jobs.map((r) => <div key={r.key} className="text-sm py-0.5">{r.label} · {r.name}{r.time ? ` · ${r.time}` : ""}</div>)}
        </div>
      )}
    </Modal>
  );
}

function AddContractorModal({ onClose, onAdd }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [vehicle, setVehicle] = useState("");
  return (
    <Modal onClose={onClose} title="Add employee">
      <div className="space-y-3">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
          <Field label="Tow vehicle (if they drive)"><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. F-250 · leave blank for yard-only" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        </div>
        <Field label="Email (for job alerts & their portal login)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@yourcompany.com" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
      </div>
      <p className="text-xs mt-3" style={{ color: T.sub }}>The same person can drive delivery/collection runs and staff yard handoffs — assign them to either from Team &amp; dispatch. At launch, collect a signed agreement, W-9, and COI before their first job (see the guide). You'll 1099 anyone paid $600+/yr.</p>
      <button disabled={!name} onClick={() => onAdd({ id: "c" + Date.now(), name, phone, email, vehicle: vehicle || "—", active: true })}
        className="w-full mt-4 py-2.5 rounded-lg font-bold disabled:opacity-40" style={{ background: T.steel, color: "#fff" }}>Add employee</button>
    </Modal>
  );
}

/* ---------------- SETTINGS --------------- */
function SettingsView({ state, setState, flash }) {
  const b = state.business;
  const [addingType, setAddingType] = useState(false);
  const [confirm, setConfirm] = useState(null); // {title, body, confirmLabel, onYes}
  const [newRem, setNewRem] = useState(24); // hours for a new reminder
  const set = (patch) => setState((s) => ({ ...s, business: { ...s.business, ...patch } }));
  const setType = (size, patch) => setState((s) => ({ ...s, types: s.types.map((t) => t.size === size ? { ...t, ...patch } : t) }));
  const addType = (t) => { setState((s) => ({ ...s, types: [...s.types, t] })); setAddingType(false); flash(`Added ${t.name}.`, true); };
  const removeType = (size) => { if (state.trailers.some((tr) => tr.size === size)) { flash("Remove its units first."); return; } setState((s) => ({ ...s, types: s.types.filter((t) => t.size !== size) })); flash("Equipment type removed.", true); };
  const onPhoto = async (size, file) => { if (!file) return; const url = await fileToScaledDataURL(file); if (url) { setType(size, { image: url }); flash("Photo updated."); } else flash("Couldn't read that image."); };
  const onLogo = async (file) => { if (!file) return; const url = await fileToScaledDataURL(file, 400, "image/png"); if (url) { set({ logo: url }); flash("Logo updated."); } else flash("Couldn't read that image."); };
  return (
    <div className="space-y-6">
      <SectionTitle>Settings</SectionTitle>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.amberSoft }}><Building2 size={16} style={{ color: T.amberDk }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Business</h3>
        </div>
        <Field label="Business name (shown to customers · your DBA/brand)"><input value={b.name} onChange={(e) => set({ name: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Legal / insured name for COIs (if different — e.g. your LLC)"><input value={b.legalName || ""} onChange={(e) => set({ legalName: e.target.value })} placeholder="Leave blank to use your business name" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Yard location"><input value={b.yard} onChange={(e) => set({ yard: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Business phone (shown to customers · used for the “Text to book” button)"><input value={b.phone} onChange={(e) => set({ phone: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Time zone (sets your “today”, due-dates & schedule)">
          <select value={b.timezone || "America/New_York"} onChange={(e) => set({ timezone: e.target.value })} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
            {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
        </Field>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.amberSoft }}><ImageIcon size={16} style={{ color: T.amberDk }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Branding · logo & colors</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Your logo and colors apply everywhere — the top bar, your public site, and the customer booking pages. Changes preview instantly.</p>
        <Field label="Logo (top-left, and throughout)">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: T.steelDk }}>
              <BrandMark logo={b.logo} size={32} />
              <span className="text-sm font-bold text-white">{b.name}</span>
            </div>
            <label className="text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer" style={{ background: T.steel, color: "#fff" }}>
              {b.logo ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            </label>
            {b.logo && <button onClick={() => { set({ logo: "" }); flash("Logo removed.", true); }} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: T.redSoft, color: T.red }}>Remove</button>}
          </div>
          <p className="text-[11px] mt-1" style={{ color: T.sub }}>A transparent PNG looks best. Auto-shrunk to fit; saved to this browser (moves to cloud storage when you go live).</p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Accent color (buttons & highlights)">
            <div className="flex items-center gap-2">
              <input type="color" value={isHex(b.theme?.accent) ? b.theme.accent : DEFAULT_THEME.accent} onChange={(e) => set({ theme: { ...(b.theme || DEFAULT_THEME), accent: e.target.value } })} style={{ width: 46, height: 36, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", cursor: "pointer" }} />
              <span className="text-xs tabular-nums" style={{ color: T.sub }}>{(b.theme?.accent || DEFAULT_THEME.accent).toUpperCase()}</span>
            </div>
          </Field>
          <Field label="Header color (top bar)">
            <div className="flex items-center gap-2">
              <input type="color" value={isHex(b.theme?.dark) ? b.theme.dark : DEFAULT_THEME.dark} onChange={(e) => set({ theme: { ...(b.theme || DEFAULT_THEME), dark: e.target.value } })} style={{ width: 46, height: 36, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", cursor: "pointer" }} />
              <span className="text-xs tabular-nums" style={{ color: T.sub }}>{(b.theme?.dark || DEFAULT_THEME.dark).toUpperCase()}</span>
            </div>
          </Field>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: T.sub }}>Live preview</div>
          <div className="rounded-lg p-3 flex flex-wrap items-center gap-2" style={{ background: T.paper }}>
            <button className="px-3 py-1.5 rounded-lg text-sm font-extrabold" style={{ background: T.amber, color: T.steelDk }}>Book now</button>
            <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.amberSoft, color: T.amberDk }}>Reserved</span>
            <span className="px-3 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: T.steel }}>Top bar</span>
          </div>
        </div>
        <button onClick={() => { set({ theme: { ...DEFAULT_THEME } }); flash("Colors reset to default.", true); }} className="text-xs font-bold" style={{ color: T.steel }}>Reset to default colors</button>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.steel }}><Lock size={16} style={{ color: "#fff" }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Owner access</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>The password you use to sign in to this dashboard. Anyone with it can see your bookings and finances — keep it private.</p>
        <Field label="Dashboard password"><input type="text" value={b.ownerPass || ""} onChange={(e) => set({ ownerPass: e.target.value })} placeholder="Set a password" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <div className="pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
          <Field label="Team code (your crew signs in with this + their phone/email)"><input type="text" value={b.teamPass || ""} onChange={(e) => set({ teamPass: e.target.value })} placeholder="e.g. a short word your crew will remember" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
          <p className="text-[11px] mt-1" style={{ color: T.sub }}>Employees open <b>Team sign-in</b> (on your public site / “Team” tab), enter their phone or email and this code, and get their own job list — no access to bookings or finances. Share this code only with your crew.</p>
        </div>
        <p className="text-[11px]" style={{ color: T.sub }}>Prototype note: these are simple gates stored in your browser. Real logins with individual staff accounts, roles, and encrypted passwords come with the database phase.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.greenSoft }}><Truck size={16} style={{ color: T.green }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Pricing</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Set the rate for each piece of equipment. A customer's total blends these automatically — longer rentals use the cheaper weekly, 2-week, and 4-week rates.</p>
        {state.types.map((t) => (
          <div key={t.size} className="rounded-lg p-3" style={{ background: T.paper }}>
            <div className="font-bold text-sm mb-2">{t.name}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Per 24 hrs ($)"><NumInput v={t.daily} on={(v) => setType(t.size, { daily: v })} /></Field>
              <Field label="Per week ($)"><NumInput v={t.weekly} on={(v) => setType(t.size, { weekly: v })} /></Field>
              <Field label="Per 2 weeks ($)"><NumInput v={t.biweekly ?? t.weekly * 2} on={(v) => setType(t.size, { biweekly: v })} /></Field>
              <Field label="Per 4 weeks ($)"><NumInput v={t.monthly} on={(v) => setType(t.size, { monthly: v })} /></Field>
            </div>
          </div>
        ))}
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.blueSoft }}><ImageIcon size={16} style={{ color: T.blue }} /></span>
            <h3 className="font-bold text-sm uppercase tracking-wide">Equipment photos & descriptions</h3>
          </div>
          <button onClick={() => setAddingType(true)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1" style={{ background: T.amber, color: T.steelDk }}><Plus size={14} /> Add equipment</button>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>The photo and description customers see when they pick this equipment. Every equipment type — including new ones you add — has its own photo and write-up.</p>
        {state.types.map((t) => (
          <div key={t.size} className="rounded-lg p-3" style={{ background: T.paper }}>
            <div className="flex items-start gap-3">
              {t.image
                ? <img src={t.image} alt={t.name} className="w-20 h-20 rounded-lg object-cover shrink-0" style={{ border: `1px solid ${T.line}` }} />
                : <div className="w-20 h-20 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#fff", border: `1px dashed ${T.line}` }}><ImageIcon size={22} style={{ color: T.gray }} /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-sm truncate">{t.name}</div>
                  {state.types.length > 1 && <button onClick={() => {
                    if (state.trailers.some((tr) => tr.size === t.size)) { flash("Remove its units first."); return; }
                    setConfirm({ title: `Remove ${t.name}?`, body: "This removes this product from your catalog and the customer booking page. You can undo it right after.", confirmLabel: "Remove", danger: true, onYes: () => removeType(t.size) });
                  }} title="Remove type" className="p-1 rounded" style={{ color: T.sub }}><Trash2 size={14} /></button>}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <label className="text-[11px] font-bold px-2 py-1 rounded cursor-pointer" style={{ background: T.steel, color: "#fff" }}>
                    {t.image ? "Replace photo" : "Upload photo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(t.size, e.target.files?.[0])} />
                  </label>
                  {t.image && <button onClick={() => { setType(t.size, { image: "" }); flash("Photo removed.", true); }} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.redSoft, color: T.red }}>Remove</button>}
                </div>
              </div>
            </div>
            <input value={t.cuyd || ""} onChange={(e) => setType(t.size, { cuyd: e.target.value })} placeholder="Capacity / size (optional) — e.g. 20 cu yd, 6,500 W, 26 ft"
              className="w-full mt-2 p-2 rounded-lg text-xs" style={{ border: `1px solid ${T.line}` }} />
            <div className="text-[10px] font-bold uppercase tracking-wide mt-2 mb-1 flex items-center gap-1" style={{ color: T.blue }}><ShieldCheck size={11} /> Certificate of Insurance required?</div>
            <select value={t.coiPolicy || "commercial"} onChange={(e) => setType(t.size, { coiPolicy: e.target.value })} className="w-full p-2 rounded-lg text-xs" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>
              {COI_POLICIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea value={t.desc || ""} onChange={(e) => setType(t.size, { desc: e.target.value })} rows={2} placeholder="Describe this equipment for customers…"
              className="w-full mt-2 p-2 rounded-lg text-xs" style={{ border: `1px solid ${T.line}` }} />
            <div className="text-[10px] font-bold uppercase tracking-wide mt-2 mb-1 flex items-center gap-1" style={{ color: T.blue }}><Info size={11} /> Requirements & specs (shown to customers)</div>
            <input value={t.reqLabel || ""} onChange={(e) => setType(t.size, { reqLabel: e.target.value })} placeholder="Heading — e.g. You'll need to tow this · Operator & transport · Power & fuel"
              className="w-full p-2 rounded-lg text-xs mb-1.5" style={{ border: `1px solid ${T.line}` }} />
            <textarea value={t.tow || ""} onChange={(e) => setType(t.size, { tow: e.target.value })} rows={2} placeholder="The requirements — vehicle & hitch, operator license, transport, fuel/power, PPE… whatever renters must know."
              className="w-full p-2 rounded-lg text-xs" style={{ border: `1px solid ${T.line}` }} />
          </div>
        ))}
        <p className="text-[11px]" style={{ color: T.sub }}>Photos are saved to this browser and auto-shrunk to fit. When you go live, they'll move to cloud storage.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.greenSoft }}><DollarSign size={16} style={{ color: T.green }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Rental policy</h3>
        </div>
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
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.blueSoft }}><Clock size={16} style={{ color: T.blue }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Booking notice (lead time)</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>How much heads-up your crew needs before a job. Customers can't book a delivery, pickup, or handoff any sooner than this — so no one gets caught with too little time to prepare. Type it in hours (24 = 1 day, 6 = six hours). Set to 0 to allow last-minute bookings.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Delivery / collection notice (hours)"><NumInput v={b.leadDeliveryHours ?? 12} on={(v) => set({ leadDeliveryHours: v })} /></Field>
          <Field label="Will-call / yard notice (hours)"><NumInput v={b.leadCounterHours ?? 2} on={(v) => set({ leadCounterHours: v })} /></Field>
        </div>
        <p className="text-[11px]" style={{ color: T.sub }}>Deliveries usually need more notice (load the trailer + drive) than a will-call, where the customer comes to your yard. Currently: deliveries need {leadLabel(b.leadDeliveryHours ?? 12)}, will-call/yard need {leadLabel(b.leadCounterHours ?? 2)}.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.blueSoft }}><CalendarClock size={16} style={{ color: T.blue }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Scheduling buffers</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Padding built into the schedule so jobs aren't stacked with no room to breathe. In minutes.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gap between a person's jobs (min)"><NumInput v={b.bufferMins ?? 0} on={(v) => set({ bufferMins: v })} /></Field>
          <Field label="Drive time to the first job (min)"><NumInput v={b.firstJobDriveMins ?? 0} on={(v) => set({ firstJobDriveMins: v })} /></Field>
        </div>
        <p className="text-[11px]" style={{ color: T.sub }}>
          <b>Gap between jobs</b> keeps a driver's back-to-back appointments apart so there's travel time — the app won't offer a slot too close to one they already have. <b>Drive time to the first job</b> holds the day's earliest delivery slots so the crew can leave the yard and reach the customer. Currently: {b.bufferMins ? `${b.bufferMins} min` : "no"} gap between jobs; first delivery no earlier than {WINDOWS[Math.min(Math.ceil((b.firstJobDriveMins || 0) / 60), WINDOWS.length - 1)]}. Set to 0 to turn either off.
        </p>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.blueSoft }}><Mail size={16} style={{ color: T.blue }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">When customers get notified</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Automatic messages to your customers. <b>Prototype note:</b> these are simulated for now — real texts and emails switch on in the messaging phase.</p>
        <Field label="Send by">
          <div className="flex gap-1 p-1 rounded-lg w-full" style={{ background: T.paper }}>
            {[["email", "Email"], ["text", "Text"], ["both", "Both"]].map(([v, l]) => (
              <button key={v} onClick={() => set({ notifyChannel: v })} className="flex-1 py-1.5 rounded-md text-sm font-bold" style={(b.notifyChannel || "both") === v ? { background: T.steel, color: "#fff" } : { color: T.sub }}>{l}</button>
            ))}
          </div>
        </Field>
        <Toggle label="Booking confirmation" sub="Sent right after they book — appointment details + confirmation number." on={b.notifyConfirm !== false} set={(v) => set({ notifyConfirm: v })} />
        <Toggle label="Copy of signed waiver" sub="Send the customer their signed rental agreement the moment they sign." on={b.notifyWaiver !== false} set={(v) => set({ notifyWaiver: v })} />
        <div>
          <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: T.sub }}>Reminders before pickup</div>
          <div className="space-y-1.5">
            {(b.notifyReminders || []).slice().sort((a, c) => c - a).map((h) => (
              <div key={h} className="flex items-center justify-between p-2 rounded-lg" style={{ background: T.paper }}>
                <span className="text-sm font-semibold">{leadLabel(h)} before</span>
                <button onClick={() => set({ notifyReminders: (b.notifyReminders || []).filter((x) => x !== h) })} className="text-xs font-bold px-2 py-1 rounded" style={{ background: T.redSoft, color: T.red }}>Remove</button>
              </div>
            ))}
            {(b.notifyReminders || []).length === 0 && <div className="text-xs" style={{ color: T.sub }}>No reminders set — add one below.</div>}
          </div>
          <div className="flex items-end gap-2 mt-2">
            <div className="flex-1"><Field label="Add a reminder (hours before)"><NumInput v={newRem} on={setNewRem} /></Field></div>
            <button onClick={() => { const h = Math.max(1, Math.round(newRem)); if (!(b.notifyReminders || []).includes(h)) set({ notifyReminders: [...(b.notifyReminders || []), h] }); }} className="px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: T.steel, color: "#fff" }}>Add</button>
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: T.sub }}>Common: 48 and 24 hours before. All messages go out by {channelLabel(b.notifyChannel)}.</p>
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.blueSoft }}><RotateCcw size={16} style={{ color: T.blue }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Cancellation & refund policy</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full refund if cancelled (hrs before pickup)"><NumInput v={b.refundFullHrs} on={(v) => set({ refundFullHrs: v })} /></Field>
          <Field label="Late-cancel refund (% of rental)"><NumInput v={Math.round(b.refundLatePct * 100)} on={(v) => set({ refundLatePct: v / 100 })} /></Field>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Cancel {b.refundFullHrs}h+ before pickup → full refund. Inside {b.refundFullHrs}h → {Math.round(b.refundLatePct * 100)}% back. After pickup → no refund. The deposit hold is always released. Shown to the customer before they confirm a cancellation.</p>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: T.amberSoft }}><ShieldCheck size={16} style={{ color: T.amberDk }} /></span>
          <h3 className="font-bold text-sm uppercase tracking-wide">Rental agreement & waiver</h3>
        </div>
        <p className="text-xs" style={{ color: T.sub }}>Customers read and e-sign this before paying. Their typed signature + timestamp is saved to the booking; you can view or download it from any booking. Edit the text to fit your attorney-reviewed agreement.</p>
        <textarea value={b.agreementText} onChange={(e) => set({ agreementText: e.target.value })} rows={8}
          className="w-full p-2.5 rounded-lg text-xs" style={{ border: `1px solid ${T.line}`, fontFamily: "ui-monospace, monospace" }} />
        <p className="text-[11px]" style={{ color: T.sub }}>Prototype note: this captures a signature record. A production e-sign service (DocuSign, Dropbox Sign, SignWell) adds a tamper-evident audit trail and secure storage when you go live.</p>
      </Card>
      <Card className="p-4">
        <h3 className="font-bold text-sm uppercase tracking-wide mb-1">Reset demo data</h3>
        <p className="text-xs mb-3" style={{ color: T.sub }}>Wipe all trailers and bookings and reload the sample yard.</p>
        <button onClick={() => setConfirm({
          title: "Reset everything?",
          body: "This wipes ALL trailers, equipment, drivers, and bookings and reloads the sample yard. Your logo, colors, pricing, and password reset to defaults too. You can undo it for a few seconds after.",
          confirmLabel: "Reset everything", danger: true,
          onYes: () => { setState(structuredClone(SEED)); flash("Reset to sample data.", true); },
        })}
          className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: T.redSoft, color: T.red }}>Reset everything</button>
      </Card>
      <p className="text-xs text-center pt-2" style={{ color: T.sub }}>
        {cloudEnabled
          ? "✓ Synced to the cloud — your data is backed up and shared across your devices."
          : "Prototype · data saves to this browser. Payments, texts, and customer logins get wired up when this goes live on the web."}
      </p>
      {addingType && <AddTypeModal onClose={() => setAddingType(false)} onAdd={addType} existing={state.types} onPhoto={fileToScaledDataURL} />}
      {confirm && <ConfirmModal {...confirm} onConfirm={() => { confirm.onYes(); setConfirm(null); }} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function AddTypeModal({ onClose, onAdd, existing, onPhoto }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [cuyd, setCuyd] = useState("");
  const [daily, setDaily] = useState(100);
  const [weekly, setWeekly] = useState(400);
  const [biweekly, setBiweekly] = useState(750);
  const [monthly, setMonthly] = useState(1300);
  const [desc, setDesc] = useState("");
  const [reqLabel, setReqLabel] = useState("");
  const [tow, setTow] = useState("");
  const [coiPolicy, setCoiPolicy] = useState("commercial");
  const [image, setImage] = useState("");
  const slug = (code || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("type-" + Date.now());
  const dupe = existing.some((t) => t.size === slug);
  const pick = async (f) => { if (!f) return; const url = await onPhoto(f); if (url) setImage(url); };
  return (
    <Modal onClose={onClose} title="Add equipment type">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {image
            ? <img src={image} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" style={{ border: `1px solid ${T.line}` }} />
            : <div className="w-20 h-20 rounded-lg flex items-center justify-center shrink-0" style={{ background: T.paper, border: `1px dashed ${T.line}` }}><ImageIcon size={22} style={{ color: T.gray }} /></div>}
          <label className="text-[11px] font-bold px-2.5 py-1.5 rounded cursor-pointer self-center" style={{ background: T.steel, color: "#fff" }}>
            {image ? "Replace photo" : "Upload photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </div>
        <Field label="Name (shown to customers)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 20-ft Roll-off Container" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Short code"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. rolloff-20" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
          <Field label="Capacity / size (optional)"><input value={cuyd} onChange={(e) => setCuyd(e.target.value)} placeholder="e.g. 20 cu yd · 6,500 W · 26 ft — or leave blank" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Day ($)"><NumInput v={daily} on={setDaily} /></Field>
          <Field label="Week ($)"><NumInput v={weekly} on={setWeekly} /></Field>
          <Field label="2 wks ($)"><NumInput v={biweekly} on={setBiweekly} /></Field>
          <Field label="4 wks ($)"><NumInput v={monthly} on={setMonthly} /></Field>
        </div>
        <Field label="Description"><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Describe it for customers…" className="w-full p-2.5 rounded-lg text-xs" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Requirements & specs — heading"><input value={reqLabel} onChange={(e) => setReqLabel(e.target.value)} placeholder="e.g. You'll need to tow this · Operator & transport · Power & fuel" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Requirements & specs — details"><textarea value={tow} onChange={(e) => setTow(e.target.value)} rows={2} placeholder="Vehicle & hitch, operator license, transport, fuel/power, PPE… whatever renters must know." className="w-full p-2.5 rounded-lg text-xs" style={{ border: `1px solid ${T.line}` }} /></Field>
        <Field label="Certificate of Insurance required?"><select value={coiPolicy} onChange={(e) => setCoiPolicy(e.target.value)} className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}`, background: "#fff" }}>{COI_POLICIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {dupe && <p className="text-[11px]" style={{ color: T.red }}>That short code is already used — pick another.</p>}
      </div>
      <button disabled={!name || dupe} onClick={() => onAdd({ size: slug, name, cuyd: cuyd.trim(), daily, weekly, biweekly, monthly, image, desc, reqLabel, tow, coiPolicy })}
        className="w-full mt-4 py-2.5 rounded-lg font-bold disabled:opacity-40" style={{ background: T.steel, color: "#fff" }}>Add equipment type</button>
    </Modal>
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

        {/* Certificate of Insurance — self-upload when required */}
        {coiRequired(type, b.type) && (
          <div className="mt-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${b.coiFile ? T.green : T.amber}` }}>
            <div className="px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: b.coiFile ? T.greenSoft : T.amberSoft }}>
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck size={16} className="shrink-0" style={{ color: b.coiFile ? T.green : T.amberDk }} />
                <div className="min-w-0">
                  <div className="text-sm font-bold" style={{ color: b.coiFile ? T.green : T.amberDk }}>Certificate of Insurance {b.coiFile ? "received" : "needed"}</div>
                  {b.coiName ? <div className="text-[11px] truncate" style={{ color: T.sub }}>{b.coiName}</div> : <div className="text-[11px]" style={{ color: T.amberDk }}>Upload it here (PDF or photo) before pickup.</div>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {b.coiFile && <button onClick={() => openStoredFile(b.coiFile)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: "#fff", color: T.steel, border: `1px solid ${T.line}` }}>View</button>}
                <label className="text-[11px] font-bold px-2.5 py-1.5 rounded cursor-pointer" style={{ background: T.steel, color: "#fff" }}>{b.coiFile ? "Replace" : "Upload COI"}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const url = await fileToDataURL(f); if (url) { setBooking(b.id, { coiFile: url, coiName: f.name, coi: true, coiExpiry: "" }); flash("Certificate of Insurance uploaded — thank you!"); } }} />
                </label>
              </div>
            </div>
          </div>
        )}

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
                <button onClick={() => { setBooking(b.id, { status: "cancelled" }); flash(`Cancelled · $${rf.amt} refunded.`, true); setPicked(null); setPanel(null); }} className="flex-1 py-2.5 rounded-lg text-sm font-bold" style={{ background: T.red, color: "#fff" }}>Cancel & refund ${rf.amt}</button>
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
          <button onClick={() => { setBooking(b.id, swapUnit ? { end: newEnd, price: b.price + addl, trailerId: swapUnit.id } : { end: newEnd, price: b.price + addl }); flash(`Extended to ${fmt(newEnd)} · $${addl} charged.`, true); done(); }}
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


/* live, itemized price — shown on every booking step so cost is never a surprise */
function PriceBreakdown({ type, days, base, waiver, waiverAmt, outMethod, returnMethod, outFee, returnFee, tax, total, deposit, pe, heading }) {
  return (
    <div className="rounded-xl p-4" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
      {heading && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: T.sub }}>{heading}</span>
          {days > 0 && <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full tabular-nums" style={{ background: T.amberSoft, color: T.amberDk }}>≈ ${pe.perDay}/day</span>}
        </div>
      )}
      <Row l={`${type.name} · ${days} day${days > 1 ? "s" : ""}`} r={`$${base}`} />
      <div className="text-[11px] mb-1.5" style={{ color: T.sub }}>
        Billed at your {pe.tierLabel}{pe.saved > 0 ? <span style={{ color: T.green, fontWeight: 700 }}> · saves ${pe.saved} vs daily</span> : ""}
      </div>
      {waiver && <Row l="Damage waiver (optional)" r={`$${waiverAmt}`} />}
      <Row l={outMethod === "delivery" ? "Delivery (we bring it)" : "Yard pickup (will-call)"} r={`$${outFee}`} />
      <Row l={returnMethod === "collect" ? "Collection (we get it)" : "Yard drop-off (you return it)"} r={`$${returnFee}`} />
      <Row l="Sales tax (NC)" r={`$${tax}`} />
      <div className="border-t my-2" style={{ borderColor: T.line }} />
      <Row l="Total today" r={`$${total}`} bold big />
      <Row l="Refundable deposit hold" r={`$${deposit} (released at return)`} />
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
    outMethod: "willcall", returnMethod: "yard", notes: "", coi: false, coiFile: "", coiName: "", signName: "", agree: false,
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const end = addDays(form.start, form.days - 1);
  // minimum booking notice (lead time) before your crew can be booked for the out leg
  const outLeadHours = form.outMethod === "delivery" ? (b.leadDeliveryHours || 0) : (b.leadCounterHours || 0);
  const firstJobWindows = Math.ceil((b.firstJobDriveMins || 0) / 60); // reserve the day's earliest slots so the crew can drive out to the first delivery
  const outCovers = (h) => {
    if (form.outMethod === "delivery") {
      if (WINDOWS.indexOf(h) < firstJobWindows) return false; // too early — no time to reach them
      return windowCovered(state, form.start, h);
    }
    return b.counterMode === "self" ? true : windowCovered(state, form.start, h);
  };
  const slotSoonEnough = (h) => slotDateTime(form.start, h).getTime() >= Date.now() + outLeadHours * 3600000;
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
  const pe = priceExplain(type, form.days);
  const priceProps = { type, days: form.days, base, waiver: form.waiver, waiverAmt, outMethod: form.outMethod, returnMethod: form.returnMethod, outFee, returnFee, tax, total, deposit: b.deposit, pe };
  // repeat customers: reuse a still-valid COI they already have on file (matched by phone/email)
  const coiOnFile = coiRequired(type, form.ctype) && !form.coiFile ? latestValidCoi(state, form.phone, form.email) : null;

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
      price: base + legFees, deposit: b.deposit, paid: true,
      coi: form.coiFile ? form.coi : (coiOnFile ? true : form.coi),
      coiFile: form.coiFile || (coiOnFile ? coiOnFile.coiFile : ""),
      coiName: form.coiFile ? form.coiName : (coiOnFile ? coiOnFile.coiName : ""),
      coiExpiry: form.coiFile ? "" : (coiOnFile ? coiOnFile.coiExpiry : ""),
      notes: form.notes, dropFee: b.dropFee,
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
        <p className="mt-2" style={{ color: T.sub }}>A {type.name} is reserved for {fmtLong(form.start)} at {form.pickupTime}{form.outMethod === "delivery" ? ", delivered to you" : " for pickup"}. We sent your confirmation{b.notifyWaiver !== false ? " and a copy of your signed agreement" : ""} by {channelLabel(b.notifyChannel)}{(b.notifyReminders && b.notifyReminders.length) ? `, and we'll remind you ${b.notifyReminders.slice().sort((x, y) => y - x).map(leadLabel).join(" and ")} before pickup` : ""}.</p>
        {coiRequired(type, form.ctype) && (form.coiFile || coiOnFile) && (
          <div className="mt-4 rounded-xl p-3 text-sm text-left flex items-start gap-2" style={{ background: T.greenSoft, color: T.green }}>
            <ShieldCheck size={16} className="shrink-0 mt-0.5" />
            <span><b>Certificate of Insurance:</b> {form.coiFile ? "received — thank you. You're all set." : <>we reused the COI already on your file{coiOnFile && coiOnFile.coiExpiry ? <> (valid through <b>{fmtLong(coiOnFile.coiExpiry)}</b>)</> : ""}. You're all set.</>}</span>
          </div>
        )}
        {coiRequired(type, form.ctype) && !form.coiFile && !coiOnFile && (
          <div className="mt-4 rounded-xl p-3 text-sm text-left flex items-start gap-2" style={{ background: T.blueSoft, color: T.blue }}>
            <ShieldCheck size={16} className="shrink-0 mt-0.5" />
            <span><b>Action needed:</b> this rental requires a Certificate of Insurance. Ask your insurance agent for a COI naming <b>{insuredName(b)}</b> as additionally insured, then upload it under <b>“Manage my booking”</b> before pickup. We'll remind you.</span>
          </div>
        )}
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
            <StepHead icon={Truck} title="Pick your trailer size" sub="All tow on a normal license. You'll see your full price — itemized — the moment you pick dates." />
            {state.types.map((t) => {
              const avail = countAvail(t.size, form.start, end);
              const active = form.size === t.size;
              return (
                <button key={t.size} disabled={avail === 0} onClick={() => set({ size: t.size })}
                  className="w-full text-left p-4 rounded-xl transition disabled:opacity-50 block"
                  style={{ border: `2px solid ${active ? T.amber : T.line}`, background: active ? T.amberSoft : "#fff" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {t.image
                        ? <img src={t.image} alt={t.name} className="w-16 h-16 rounded-lg object-cover shrink-0" style={{ border: `1px solid ${T.line}` }} />
                        : <div className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ background: active ? T.amber : T.paper }}><Truck size={26} style={{ color: active ? T.steelDk : T.steel }} /></div>}
                      <div className="min-w-0">
                        <div className="font-bold">{t.name}</div>
                        <div className="text-xs" style={{ color: T.sub }}>{t.cuyd ? t.cuyd + " · " : ""}from ${t.daily}/day</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold" style={{ color: avail > 0 ? T.green : T.red }}>{avail > 0 ? `${avail} available` : "None free"}</div>
                      {active && <Check size={16} className="inline mt-1" style={{ color: T.amberDk }} />}
                    </div>
                  </div>
                  {t.desc && <p className="text-xs mt-2.5 leading-snug" style={{ color: T.sub }}>{t.desc}</p>}
                  {t.tow && (
                    <div className="mt-2.5 flex items-start gap-2 p-2.5 rounded-lg" style={{ background: T.blueSoft }}>
                      <Info size={14} style={{ color: T.blue, marginTop: 1 }} className="shrink-0" />
                      <div className="text-[11px] leading-snug" style={{ color: T.blue }}><span className="font-bold">{t.reqLabel || "Good to know before you rent"}:</span> {t.tow}</div>
                    </div>
                  )}
                </button>
              );
            })}
            <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: T.amberSoft, color: T.amberDk }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span><b>Before you book:</b> make sure you're set up to safely haul and use what you pick — check each item's requirements above. You'll confirm you can meet them in the rental agreement.</span>
            </div>
            <NavBtns onNext={() => setStepN(1)} nextOk={!!form.size} />
          </div>
        )}

        {/* step 1: dates */}
        {stepN === 1 && (
          <div className="space-y-4">
            <StepHead icon={CalendarDays} title="When do you need it?" sub={`Pick your day, how long, and how you'll get it and return it. Booking is open for the next ${b.bookHorizonDays || 30} days.`} />
            <Field label="Start date">
              <input type="date" min={today()} max={addDays(today(), b.bookHorizonDays)} value={form.start} onChange={(e) => set({ start: e.target.value })}
                className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} />
            </Field>
            <Field label="How long?">
              <div className="grid grid-cols-5 gap-2">
                {[[1, "24 hrs"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"], [28, "4 weeks"]].map(([d, l]) => (
                  <button key={d} onClick={() => set({ days: d })} className="py-2 rounded-lg text-sm font-bold"
                    style={form.days === d ? { background: T.steel, color: "#fff" } : { background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>{l}</button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: T.steel }}>
                  <ArrowLeft size={13} /><ArrowRight size={13} /> Or slide to pick any number of days
                </span>
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full tabular-nums" style={{ background: T.amberSoft, color: T.amberDk }}>{form.days} day{form.days > 1 ? "s" : ""}</span>
              </div>
              <input type="range" min="1" max="60" value={form.days} onChange={(e) => set({ days: +e.target.value })} className="w-full mt-2" style={{ accentColor: T.amber, height: 8 }} />
              <div className="text-xs text-center mt-1" style={{ color: T.sub }}>Rent for {form.days} day{form.days > 1 ? "s" : ""} · return by {fmtLong(end)}</div>
            </Field>
            <Field label="How do you want to get it?">
              <div className="grid grid-cols-2 gap-2">
                {[["willcall", "I'll pick up", `+$${b.dropFee} · at the yard`], ["delivery", "Deliver to me", `+$${b.deliveryFee} · we bring it`]].map(([v, l, s]) => (
                  <button key={v} onClick={() => set({ outMethod: v })} className="p-2.5 rounded-lg text-left"
                    style={form.outMethod === v ? { background: T.amberSoft, border: `2px solid ${T.amber}` } : { background: T.paper, border: `1px solid ${T.line}` }}>
                    <div className="text-sm font-bold">{l}</div><div className="text-xs" style={{ color: T.sub }}>{s}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label={form.outMethod === "delivery" ? "Delivery time (driver availability)" : "Pickup time (staff availability)"}>
              {(() => {
                // A delivery needs a driver free; a will-call needs someone at the yard to hand off —
                // that's you when you cover the counter yourself, otherwise an available staff member.
                // Slots must also be far enough out to give the crew time to prepare (lead time).
                const availSlots = b.pickupHours.filter(outCovers);
                const slots = availSlots.filter(slotSoonEnough);
                if (slots.length === 0) {
                  const tooSoon = availSlots.length > 0;
                  return <div className="p-3 rounded-lg text-sm flex items-start gap-2" style={{ background: T.redSoft, color: T.red }}>
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {tooSoon
                      ? `That's sooner than we can prepare — ${form.outMethod === "delivery" ? "deliveries" : "pickups"} need at least ${leadLabel(outLeadHours)} notice. Pick a later day or time.`
                      : (form.outMethod === "delivery"
                        ? "No driver is available to deliver that day — pick another date, or choose will-call."
                        : "No one is scheduled at the yard for those hours that day — pick another date, or choose delivery.")}
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
            <Field label="How do you want to return it?">
              <div className="grid grid-cols-2 gap-2">
                {[["yard", "I'll drop it off", `+$${b.dropFee} · back to the yard`], ["collect", "You pick it up", `+$${b.deliveryFee} · we come get it`]].map(([v, l, s]) => (
                  <button key={v} onClick={() => set({ returnMethod: v })} className="p-2.5 rounded-lg text-left"
                    style={form.returnMethod === v ? { background: T.amberSoft, border: `2px solid ${T.amber}` } : { background: T.paper, border: `1px solid ${T.line}` }}>
                    <div className="text-sm font-bold">{l}</div><div className="text-xs" style={{ color: T.sub }}>{s}</div>
                  </button>
                ))}
              </div>
              {form.returnMethod === "collect" && <div className="text-[11px] mt-1.5" style={{ color: T.sub }}>We'll schedule a driver to collect it on your return date ({fmtLong(end)}).</div>}
            </Field>
            {countAvail(form.size, form.start, end) === 0 && (
              <div className="p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: T.redSoft, color: T.red }}>
                <AlertTriangle size={16} /> No {form.size} free for those dates — try a different day or size.
              </div>
            )}
            {type && <PriceBreakdown heading="Your price so far" {...priceProps} />}
            <NavBtns onBack={() => setStepN(0)} onNext={() => setStepN(2)}
              nextOk={countAvail(form.size, form.start, end) > 0 && outCovers(form.pickupTime) && slotSoonEnough(form.pickupTime)} />
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
            {coiRequired(type, form.ctype) && coiOnFile && !form.coiFile && (
              <div className="p-3 rounded-lg" style={{ background: T.greenSoft }}>
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: T.green }}>
                  <ShieldCheck size={15} /> Certificate of Insurance — already on file
                </div>
                <div className="text-xs mt-1" style={{ color: T.green }}>
                  Welcome back! We still have your Certificate of Insurance{coiOnFile.coiExpiry ? <> on file (valid through <b>{fmtLong(coiOnFile.coiExpiry)}</b>)</> : " on file"}, so you don't need to upload it again. We'll reuse it for this booking.
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <label className="text-xs font-bold px-2.5 py-1.5 rounded cursor-pointer" style={{ background: T.steel, color: "#fff" }}>
                    Upload a new COI
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const url = await fileToDataURL(f); if (url) set({ coiFile: url, coiName: f.name, coi: true }); }} />
                  </label>
                  <span className="text-xs" style={{ color: T.sub }}>Only if it's changed since last time.</span>
                </div>
              </div>
            )}
            {coiRequired(type, form.ctype) && !(coiOnFile && !form.coiFile) && (
              <div className="p-3 rounded-lg" style={{ background: T.blueSoft }}>
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: T.blue }}>
                  <ShieldCheck size={15} /> Certificate of Insurance — required
                </div>
                <div className="text-xs mt-1" style={{ color: T.blue }}>This {type ? type.name : "rental"} requires a COI. Ask your insurance agent for a Certificate of Insurance naming <b>{insuredName(b)}</b> as additionally insured — most send it the same day. Upload the PDF or a photo now, or add it later under “Manage my booking.”</div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <label className="text-xs font-bold px-2.5 py-1.5 rounded cursor-pointer" style={{ background: T.steel, color: "#fff" }}>
                    {form.coiFile ? "Replace COI" : "Upload COI"}
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const url = await fileToDataURL(f); if (url) set({ coiFile: url, coiName: f.name, coi: true }); }} />
                  </label>
                  {form.coiName
                    ? <span className="text-xs font-semibold flex items-center gap-1" style={{ color: T.green }}><Check size={13} /> {form.coiName}</span>
                    : <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: T.blue }}><input type="checkbox" checked={form.coi} onChange={(e) => set({ coi: e.target.checked })} style={{ accentColor: T.blue }} /> I'll send it separately</label>}
                </div>
              </div>
            )}
            <Toggle label="Add damage waiver" sub={`Caps your cost if something goes wrong · $${Math.round(base * b.waiverRate)}`} on={form.waiver} set={(v) => set({ waiver: v })} />
            <Field label="Anything we should know? (optional)"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder="Job type, what you're hauling…" className="w-full p-2.5 rounded-lg text-sm" style={{ border: `1px solid ${T.line}` }} /></Field>
            {type && <PriceBreakdown heading="Your price so far" {...priceProps} />}
            <NavBtns onBack={() => setStepN(1)} onNext={() => setStepN(3)} nextOk={form.name && form.phone && (!(form.outMethod === "delivery" || form.returnMethod === "collect") || form.address)} />
          </div>
        )}

        {/* step 3: review */}
        {stepN === 3 && (
          <div className="space-y-4">
            <StepHead icon={CreditCard} title="Review & pay" sub="Card holds your deposit; you're charged the rental now." />
            <PriceBreakdown heading="Order summary" {...priceProps} />
            {type?.tow && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ background: T.blueSoft, color: T.blue }}>
                <Info size={14} className="shrink-0 mt-0.5" />
                <span><b>{type.reqLabel || "Before you rent"} — {type.name}:</b> {type.tow} By signing below you confirm you can meet these requirements.</span>
              </div>
            )}
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
function SectionTitle({ children }) { return <h2 className="text-2xl font-extrabold tracking-tight" style={{ letterSpacing: "-0.02em" }}>{children}</h2>; }
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

/* Confirmation dialog for destructive actions */
function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm" style={{ color: T.sub }}>{body}</p>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg font-bold" style={{ background: T.paper, color: T.sub, border: `1px solid ${T.line}` }}>Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg font-bold" style={{ background: danger ? T.red : T.steel, color: "#fff" }}>{confirmLabel || "Confirm"}</button>
      </div>
    </Modal>
  );
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
  const notify = notifyTimeline(state, b);
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

      {/* CERTIFICATE OF INSURANCE */}
      {(coiRequired(type, b.type) || b.coiFile || b.coi) && (
        <div className="rounded-lg mb-3 overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ background: b.coiFile ? T.greenSoft : T.amberSoft }}>
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={15} style={{ color: b.coiFile ? T.green : T.amberDk }} />
              <div className="min-w-0">
                <div className="text-xs font-bold" style={{ color: b.coiFile ? T.green : T.amberDk }}>Certificate of Insurance {b.coiFile ? "on file" : (coiRequired(type, b.type) ? "— required, not uploaded yet" : "(optional)")}</div>
                {b.coiName && <div className="text-[11px] truncate" style={{ color: T.sub }}>{b.coiName}</div>}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {b.coiFile && <button onClick={() => openStoredFile(b.coiFile)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: "#fff", color: T.steel, border: `1px solid ${T.line}` }}>View</button>}
              {b.coiFile && <button onClick={() => downloadStoredFile(b.coiFile, b.coiName || `COI-${b.name}`)} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: "#fff", color: T.steel, border: `1px solid ${T.line}` }}>Download</button>}
              <label className="text-[11px] font-bold px-2 py-1 rounded cursor-pointer" style={{ background: T.steel, color: "#fff" }}>{b.coiFile ? "Replace" : "Upload COI"}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const url = await fileToDataURL(f); if (url) { setBooking(b.id, { coiFile: url, coiName: f.name, coi: true, coiExpiry: "" }); flash("COI uploaded.", true); } else flash("Couldn't read that file."); }} />
              </label>
              {b.coiFile && <button onClick={() => { setBooking(b.id, { coiFile: "", coiName: "", coiExpiry: "" }); flash("COI removed.", true); }} className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: T.redSoft, color: T.red }}>Remove</button>}
            </div>
          </div>
          {b.coiFile && (
            <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${T.line}` }}>
              <span className="text-[11px] font-bold" style={{ color: T.sub }}>Expires</span>
              <input type="date" value={b.coiExpiry || ""} onChange={(e) => setBooking(b.id, { coiExpiry: e.target.value })}
                className="text-[11px] p-1.5 rounded" style={{ border: `1px solid ${T.line}` }} />
              {b.coiExpiry
                ? (b.coiExpiry < today()
                    ? <span className="text-[11px] font-bold" style={{ color: T.red }}>⚠ Expired — repeat customers will be asked for a fresh COI.</span>
                    : <span className="text-[11px]" style={{ color: T.sub }}>Reused automatically for this customer's next booking until it lapses.</span>)
                : <span className="text-[11px]" style={{ color: T.sub }}>Set the expiry so repeat bookings can reuse it (and re-ask once it lapses).</span>}
            </div>
          )}
        </div>
      )}

      {/* CUSTOMER NOTIFICATIONS timeline */}
      <div className="rounded-lg mb-3 overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: T.paper }}>
          <Mail size={14} style={{ color: T.steel }} />
          <span className="text-xs font-bold">Customer notifications</span>
          <span className="text-[10px] ml-auto" style={{ color: T.sub }}>by {channelLabel(state.business.notifyChannel)}</span>
        </div>
        <div className="p-3 space-y-1.5">
          {notify.length === 0 && <div className="text-xs" style={{ color: T.sub }}>Notifications are turned off in Settings.</div>}
          {notify.map((n, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="text-xs min-w-0">
                <div className="font-semibold truncate">{n.label}</div>
                <div style={{ color: T.sub }}>{n.at ? new Date(n.at).toLocaleString() : "—"}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded shrink-0" style={n.sent ? { color: T.green, background: T.greenSoft } : { color: T.blue, background: T.blueSoft }}>{n.sent ? "Sent" : "Scheduled"}</span>
            </div>
          ))}
          <div className="text-[11px] pt-1" style={{ color: T.sub }}>Simulated in this prototype. Real texts/emails send once the messaging phase is live.</div>
        </div>
      </div>

      {/* INSPECTION & PHOTOS log */}
      <div className="rounded-lg mb-3 overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: T.paper }}>
          <CircleDot size={14} style={{ color: T.steel }} />
          <span className="text-xs font-bold">Inspection & photos</span>
        </div>
        <div className="p-3 space-y-3">
          {[["out", "Checkout (at pickup)", b.inspectOutAt, b.inspectOutPhotos], ["in", "Return (at drop-off)", b.inspectInAt, b.inspectInPhotos]].map(([leg, label, at, photos]) => {
            const pics = photos || [];
            const addOwnerPhotos = async (files) => {
              if (!files || !files.length) return;
              const urls = [];
              for (const f of Array.from(files)) { const u = await fileToResizedDataURL(f); if (u) urls.push(u); }
              if (!urls.length) return;
              setBooking(b.id, {
                [leg === "out" ? "inspectOutPhotos" : "inspectInPhotos"]: [...pics, ...urls].slice(0, 8),
                [leg === "out" ? "inspectOutAt" : "inspectInAt"]: new Date().toISOString(),
              });
              flash("Photos added.");
            };
            return (
              <div key={leg}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="font-semibold">{label}</div>
                    <div style={{ color: at ? T.green : T.sub }}>{at ? `${pics.length ? pics.length + " photo" + (pics.length > 1 ? "s · " : " · ") : ""}${new Date(at).toLocaleString()}` : "Not logged yet"}</div>
                  </div>
                  <label className="text-[11px] font-bold px-2.5 py-1.5 rounded cursor-pointer shrink-0" style={{ background: T.steel, color: "#fff" }}>
                    {pics.length ? "Add photos" : "Add photos"}
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addOwnerPhotos(e.target.files)} />
                  </label>
                </div>
                {pics.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {pics.map((p, i) => <img key={i} src={p} alt="" onClick={() => openStoredFile(p)} className="w-14 h-14 rounded object-cover cursor-pointer" style={{ border: `1px solid ${T.line}` }} />)}
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-[11px]" style={{ color: T.sub }}>Your crew can snap these right from their phone in the Team portal — same angles at pickup and return (tires, lights, cylinder, bed/sides, hitch, empty &amp; clean). They attach here automatically. Tap a photo to open it full-size.</div>
        </div>
      </div>

      {/* actions */}
      {(b.status === "reserved" || b.status === "out") && (
        <div className="flex gap-2 flex-wrap">
          {b.status === "reserved" && (
            <button onClick={() => { setBooking(b.id, { status: "out" }); flash(`${outVerb(b.outMethod)} — trailer is out.`, true); onClose(); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: T.steel, color: "#fff" }}>
              <Truck size={15} /> {outVerb(b.outMethod)}
            </button>
          )}
          {b.status === "out" && (
            <button onClick={() => { setBooking(b.id, { status: "returned" }); flash(`${returnVerb(b.returnMethod)} — deposit released.`, true); onClose(); }}
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

