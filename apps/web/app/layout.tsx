import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "MCBuse — Payment reconciliation infrastructure for small merchants.",
  description:
    "MCBuse connects QR and NFC payments to expected payouts — matching every transaction automatically and surfacing exceptions in real time. Piloting in Munich and Berlin.",
  openGraph: {
    title: "MCBuse — Payment reconciliation infrastructure for small merchants.",
    description:
      "Automated payout matching, exception detection, and real-time reconciliation for small merchants. Built on Solana. Piloting now in Germany.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
