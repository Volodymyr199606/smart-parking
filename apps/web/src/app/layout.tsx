import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Parking — Find smarter parking near you",
  description:
    "Real-time street parking availability for San Francisco drivers. Skip the circle, save time, park easier.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
