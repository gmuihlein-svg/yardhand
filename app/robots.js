// Tells search engines they can crawl the whole public site, and where the sitemap is.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yardhand.vercel.app";

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
