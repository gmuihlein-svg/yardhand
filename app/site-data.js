// Server-only helper: read the primary business's settings so the live page's SEO
// (title, description, keywords, structured data) reflects what the owner set in
// Settings → "Get found on Google". Plain REST fetch so it runs in Server Components
// (no "use client"). Returns null when the cloud isn't configured (e.g. local/sandbox),
// and callers fall back to sensible defaults.
const WORKSPACE_ID = "default";

export async function getBusiness() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/workspaces?id=eq.${WORKSPACE_ID}&select=data`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60 }, // refresh at most once a minute; still prerendered into the HTML
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const data = Array.isArray(rows) && rows[0] && rows[0].data;
    return (data && data.business) || null;
  } catch (e) {
    return null;
  }
}
