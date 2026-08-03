import { OperatorApp } from "../yardhand-app.jsx";

// The SaaS business (Yardhand) lives on its OWN URL with its OWN login, kept
// entirely separate from the rental business at "/". This portal is for the
// platform owner only — keep it out of search engines.
export const metadata = {
  title: "Yardhand · Operator",
  description: "Private operator portal for managing Yardhand subscribers.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/operator" },
};

export default function OperatorPage() {
  return <OperatorApp />;
}
