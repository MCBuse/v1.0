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
  title: "MCBuse — Small payments. Clear payouts. Better business records.",
  description:
    "MCBuse helps small merchants capture QR/NFC payments, track expected payouts, spot exceptions, and understand daily sales activity from one simple dashboard.",
  openGraph: {
    title: "MCBuse — Small payments. Clear payouts. Better business records.",
    description:
      "Capture QR/NFC payments, track expected payouts, spot exceptions, and understand daily sales activity. Pilot now in Munich and Berlin.",
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
