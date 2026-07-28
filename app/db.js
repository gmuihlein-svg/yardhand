"use client";
/* ---------------------------------------------------------------------------
   Phase 2 — cloud sync (Supabase), with graceful localStorage fallback.

   The whole app state lives in ONE workspace row (JSONB) for now. When the two
   NEXT_PUBLIC_SUPABASE_* env vars are present the workspace loads/saves from
   Supabase and syncs across devices in realtime; when they're absent everything
   falls back to browser localStorage exactly like before — so the app keeps
   working whether or not the cloud is wired up yet.

   Next milestone: normalize into per-entity tables + real per-user auth (RLS).
--------------------------------------------------------------------------- */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const WORKSPACE_ID = "default"; // single workspace for now → per-tenant later
const LS_KEY = "yardhand_state_v1";

export const cloudEnabled = !!(URL && ANON);
let supabase = null;
if (cloudEnabled) {
  try { supabase = createClient(URL, ANON, { auth: { persistSession: false } }); }
  catch (e) { supabase = null; }
}

/* --- localStorage (cache + offline + fallback) --- */
function lsLoad() {
  try { const v = window.localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}
function lsSave(s) {
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* quota */ }
}

/* --- load the workspace: cloud first, else local --- */
export async function loadWorkspace() {
  if (typeof window === "undefined") return null;
  if (!supabase) return lsLoad();
  try {
    const { data, error } = await supabase.from("workspaces").select("data").eq("id", WORKSPACE_ID).maybeSingle();
    if (error) { console.warn("[cloud] load failed, using local copy:", error.message); return lsLoad(); }
    if (data && data.data) { lsSave(data.data); return data.data; }
    // no cloud row yet — migrate any existing local data up so nothing is lost
    const local = lsLoad();
    if (local) { await saveWorkspace(local, true); return local; }
    return null; // caller seeds fresh sample data
  } catch (e) { console.warn("[cloud] load error, using local copy:", e); return lsLoad(); }
}

/* --- save the workspace: always cache locally, debounce the cloud upsert --- */
let saveTimer = null, pending = null;
export async function saveWorkspace(s, immediate = false) {
  if (typeof window === "undefined") return;
  lsSave(s);
  if (!supabase) return;
  pending = s;
  const flush = async () => {
    const snapshot = pending; pending = null;
    if (!snapshot) return;
    try { await supabase.from("workspaces").upsert({ id: WORKSPACE_ID, data: snapshot, updated_at: new Date().toISOString() }); }
    catch (e) { console.warn("[cloud] save failed (kept locally):", e); }
  };
  clearTimeout(saveTimer);
  if (immediate) return flush();
  saveTimer = setTimeout(flush, 600);
}

/* --- realtime: call onChange(data) when another device updates the workspace --- */
export function subscribeWorkspace(onChange) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel("workspace-sync")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "workspaces", filter: `id=eq.${WORKSPACE_ID}` },
      (payload) => { if (payload && payload.new && payload.new.data) onChange(payload.new.data); })
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch (e) { /* ignore */ } };
}
