import "./globals.css";

// Public site URL — set NEXT_PUBLIC_SITE_URL to your real domain in Vercel when you go live.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yardhand.vercel.app";

// NOTE (multi-tenant): these are the primary business's SEO defaults (Ext Professionals).
// When Yardhand becomes multi-tenant, generate this per-business with generateMetadata()
// from each tenant's settings (name, city, equipment). See PLATFORM-PLAN.md.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Dump Trailer Rental in Charlotte, NC | Ext Professionals",
    template: "%s | Ext Professionals",
  },
  description:
    "Rent a dump trailer in Charlotte, NC for concrete, roofing, cleanouts, or yard debris. Tow it yourself or we deliver. Book online in under a minute — no CDL needed.",
  keywords: [
    "dump trailer rental",
    "dump trailer rental Charlotte NC",
    "dumpster trailer rental",
    "debris removal trailer",
    "roll-off dumpster alternative",
    "concrete cleanup trailer",
    "Ext Professionals",
  ],
  applicationName: "Ext Professionals",
  authors: [{ name: "Ext Professionals" }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Ext Professionals",
    title: "Dump Trailer Rental in Charlotte, NC | Ext Professionals",
    description:
      "Book a dump trailer online in under a minute. Delivery or will-call. No CDL needed. Serving Charlotte, NC & nearby.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dump Trailer Rental in Charlotte, NC | Ext Professionals",
    description:
      "Book a dump trailer online in under a minute. Delivery or will-call. No CDL needed.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
