import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Jersey_10, Press_Start_2P, VT323 } from "next/font/google";
import { FESTIVAL } from "@/lib/festival";
import { SITE_URL } from "@/lib/events";
import { Analytics } from "@vercel/analytics/next";
import { INSTALL_BOOT } from "@/components/install";
import { AppSetup } from "@/components/AppSetup";
import "./globals.css";

/**
 * Pixel faces where they're big and decorative (Jersey headings, Press Start 2P numbers,
 * VT323 notes). Descriptions and small labels use Chakra Petch: squared and techy so it
 * fits the game look, but crisp and easy to read at small sizes.
 */
const display = Jersey_10({ subsets: ["latin"], weight: "400", variable: "--font-pixel-display", display: "swap" });
const body = Chakra_Petch({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-pixel-body", display: "swap" });
const digits = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-pixel-digits", display: "swap" });
const label = Chakra_Petch({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-pixel-label", display: "swap" });
const hand = VT323({ subsets: ["latin"], weight: "400", variable: "--font-pixel-hand", display: "swap" });

const title = `CHRONOS ${FESTIVAL.year} · ${FESTIVAL.tagline}`;
const description =
  "Chronos 2026, 11 to 13 December at GEC Palamu: exhibitions, a hackathon, Robo Soccer, Robo War and more. Three days celebrating what students build. By the Science & Innovation Club.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: "%s · CHRONOS 2026" },
  description,
  applicationName: "CHRONOS 2026",
  keywords: [
    "Chronos 2026",
    "Chronos GEC Palamu",
    "GEC Palamu fest",
    "GEC Palamu tech fest",
    "Government Engineering College Palamu",
    "tech fest Jharkhand",
    "college fest Jharkhand 2026",
    "Daltonganj tech fest",
    "hackathon Jharkhand",
    "Robo War",
    "Robo Soccer",
    "Science & Innovation Club",
    "SIC GEC Palamu",
  ],
  authors: [{ name: "Science & Innovation Club, GEC Palamu", url: "https://sic.gecp.in" }],
  creator: "Science & Innovation Club, GEC Palamu",
  publisher: "Science & Innovation Club, GEC Palamu",
  category: "events",
  formatDetection: { telephone: false, email: false, address: false },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "CHRONOS 2026",
    locale: "en_IN",
    title,
    description,
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  appleWebApp: { capable: true, title: "Chronos", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#07070a", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${display.variable} ${body.variable} ${label.variable} ${hand.variable} ${digits.variable}`}>
      <head>
        {/* Hide words before first paint only when they will be animated in. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("js-motion")}catch(e){}`,
          }}
        />
        {/* Keep the browser's install prompt for Babu's own Install button */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_BOOT }} />
      </head>
      <body>
        {children}
        <Analytics />
        <AppSetup />
      </body>
    </html>
  );
}
