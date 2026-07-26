import "./globals.css";

export const metadata = {
  title: "YardHand — Trailer Rental Manager",
  description: "Dump-trailer rental booking and dispatch for Whole Yard Trailer Rental.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
