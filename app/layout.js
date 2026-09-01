import "./globals.css";
import { getBusiness } from "./site-data";

// Public site URL — set NEXT_PUBLIC_SITE_URL to your real domain in Vercel when you go live.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yardhand.vercel.app";

// SEO is generated from what the owner sets in Settings → "Get found on Google" (seoTitle,
// seoDescription, seoKeywords) plus their name/city — so each business controls its own listing.
// Falls back to sensible defaults when a value is blank or the cloud isn't reachable.
// NOTE (multi-tenant): today this reads the single "default" workspace; per-tenant lookup (by domain)
// is the multi-tenant step — see the Yardhand Handbook (Part D).
export async function generateMetadata() {
  const biz = await getBusiness();
  const name = (biz && biz.name) || "Ext Professionals";
  const city = (biz && biz.yard) || "Charlotte, NC";
  const title = (biz && biz.seoTitle && biz.seoTitle.trim()) || `Dump Trailer Rental in ${city} | ${name}`;
  const description = (biz && biz.seoDescription && biz.seoDescription.trim()) ||
    `Rent a dump trailer in ${city} for roofing, concrete, demolition, renovation cleanouts, or landscaping haul-off. Delivery or will-call — book online in a minute, no CDL needed.`;
  const keywords = (biz && biz.seoKeywords && biz.seoKeywords.trim())
    ? biz.seoKeywords.split(",").map((s) => s.trim()).filter(Boolean)
    : ["dump trailer rental", `dump trailer rental ${city}`, "dumpster trailer rental", "debris removal trailer", "roll-off dumpster alternative", name];
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${name}` },
    description,
    keywords,
    applicationName: name,
    authors: [{ name }],
    robots: { index: true, follow: true },
    alternates: { canonical: "/" },
    openGraph: { type: "website", url: SITE_URL, siteName: name, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
