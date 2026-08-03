import YardHandApp from "./yardhand-app.jsx";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yardhand.vercel.app";

// Structured data (JSON-LD) so Google/AI understand this is a local rental business and
// show it richly in local results. NOTE (multi-tenant): generate this per-business from
// each tenant's settings when Yardhand goes multi-tenant — see PLATFORM-PLAN.md.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Ext Professionals",
  description:
    "Dump trailer rental in Charlotte, NC. Book online for concrete, roofing, cleanouts, or yard debris — delivery or will-call, no CDL needed.",
  url: SITE_URL,
  telephone: "(704) 555-0100",
  priceRange: "$$",
  areaServed: { "@type": "City", name: "Charlotte" },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Charlotte",
    addressRegion: "NC",
    addressCountry: "US",
  },
  makesOffer: [
    { "@type": "Offer", itemOffered: { "@type": "Product", name: "7x14 Dump Trailer (14K GVWR)" }, priceCurrency: "USD", price: "155" },
    { "@type": "Offer", itemOffered: { "@type": "Product", name: "7x12 Dump Trailer (9,990 GVWR)" }, priceCurrency: "USD", price: "130" },
    { "@type": "Offer", itemOffered: { "@type": "Product", name: "5x8 Dump Trailer (5K GVWR)" }, priceCurrency: "USD", price: "95" },
  ],
};

export default function Page() {
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
