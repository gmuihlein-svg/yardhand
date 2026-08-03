import YardHandApp from "./yardhand-app.jsx";
import { getBusiness } from "./site-data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yardhand.vercel.app";

// Structured data (JSON-LD) so Google/AI understand this is a local rental business and show it
// richly in local results — built from the owner's own settings (name, city, phone, equipment) with
// sensible fallbacks. Per-tenant lookup (by domain) is the multi-tenant step — see PLATFORM-PLAN.md.
export default async function Page() {
  const biz = await getBusiness();
  const name = (biz && biz.name) || "Ext Professionals";
  const cityFull = (biz && biz.yard) || "Charlotte, NC";
  const [locality, region] = cityFull.split(",").map((s) => s.trim());
  const phone = (biz && biz.phone) || "(704) 555-0100";
  const description = (biz && biz.seoDescription && biz.seoDescription.trim()) ||
    `Dump trailer rental in ${cityFull}. Book online for concrete, roofing, cleanouts, or yard debris — delivery or will-call, no CDL needed.`;
  const offers = Array.isArray(biz && biz.types) && biz.types.length
    ? biz.types.filter((t) => t && t.name).map((t) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Product", name: t.name },
        priceCurrency: "USD",
        ...(t.dayRate || t.price ? { price: String(t.dayRate || t.price) } : {}),
      }))
    : [
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "7x14 Dump Trailer (14K GVWR)" }, priceCurrency: "USD", price: "155" },
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "7x12 Dump Trailer (9,990 GVWR)" }, priceCurrency: "USD", price: "130" },
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "5x8 Dump Trailer (5K GVWR)" }, priceCurrency: "USD", price: "95" },
      ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    description,
    url: SITE_URL,
    telephone: phone,
    priceRange: "$$",
    ...(locality ? { areaServed: { "@type": "City", name: locality } } : {}),
    address: {
      "@type": "PostalAddress",
      ...(locality ? { addressLocality: locality } : {}),
      ...(region ? { addressRegion: region } : {}),
      addressCountry: "US",
    },
    ...(offers.length ? { makesOffer: offers } : {}),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <YardHandApp />
    </>
  );
}
