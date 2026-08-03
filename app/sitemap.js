// Sitemap for search engines. Single-page storefront today; add routes here as the site grows.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yardhand.vercel.app";

export default function sitemap() {
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];
}
