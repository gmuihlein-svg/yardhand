import { PortalChooser } from "../yardhand-app.jsx";

// One place to choose which business to open — your rental business ("/") or
// your SaaS business ("/operator"). Owner-only launcher; keep it out of search.
export const metadata = {
  title: "Choose a business · Yardhand",
  description: "Pick which business to open.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/portal" },
};

export default function PortalPage() {
  return <PortalChooser />;
}
