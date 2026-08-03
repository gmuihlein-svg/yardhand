import YardHandApp from "../yardhand-app.jsx";

// Standalone booking page — just the booking flow, no owner chrome — for embedding
// in another website (iframe) or sharing as a direct "Book now" link. Brand-themed
// from the business's own colors & logo. noindex so it doesn't compete with the
// main storefront in search.
export const metadata = {
  title: "Book online",
  robots: { index: false, follow: false },
  alternates: { canonical: "/book" },
};

export default function BookPage() {
  return <YardHandApp embed />;
}
