import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { Footer } from "../components/site/Footer";
import { Nav } from "../components/site/Nav";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const SITE_URL = "https://mcbuse.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MCBuse — Merchant Financial Visibility for Low-Ticket Payments",
    template: "%s — MCBuse",
  },
  description:
    "MCBuse turns everyday low-ticket merchant payments into structured financial records — analytics merchants can use, and evidence institutions can verify.",
  applicationName: "MCBuse",
  openGraph: {
    type: "website",
    siteName: "MCBuse",
    url: SITE_URL,
    title: "MCBuse — Merchant Financial Visibility for Low-Ticket Payments",
    description:
      "MCBuse turns everyday low-ticket merchant payments into structured financial records — analytics merchants can use, and evidence institutions can verify.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-accent focus:bg-bg focus:px-4 focus:py-3 focus:text-sm focus:text-text"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
