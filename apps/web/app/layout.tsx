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
  title: "MCBuse | Micro-Banking Infrastructure for Financial Visibility",
  description:
    "MCBuse turns micro-payments, merchant activity, and peer-to-peer financial behavior into structured financial data for merchants, partners, and future banking access.",
  openGraph: {
    title: "MCBuse | Micro-Banking Infrastructure for Financial Visibility",
    description:
      "Blockchain-powered micro-banking infrastructure for low-ticket payments, merchant activity records, and financial visibility.",
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
