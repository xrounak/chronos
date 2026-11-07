import type { Metadata, Viewport } from "next";
import { Jersey_10, Pixelify_Sans, Press_Start_2P, Silkscreen, VT323 } from "next/font/google";
import { FESTIVAL } from "@/lib/festival";
import { SITE_URL } from "@/lib/events";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/**
 * One pixel family, five voices (like a colour palette): tall condensed Jersey for headings,
 * round Pixelify for reading, tiny Silkscreen caps for labels, VT323 terminal for notes and
 * chunky Press Start 2P (the most "Minecraft") for numbers.
 */
const display = Jersey_10({ subsets: ["latin"], weight: "400", variable: "--font-pixel-display", display: "swap" });
const body = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-pixel-body", display: "swap" });
const digits = Press_Start_2P({ subsets: ["latin"], weight: "400", variable: "--font-pixel-digits", display: "swap" });
const label = Silkscreen({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-pixel-label", display: "swap" });
const hand = VT323({ subsets: ["latin"], weight: "400", variable: "--font-pixel-hand", display: "swap" });

const title = `CHRONOS ${FESTIVAL.year} · ${FESTIVAL.tagline}`;
const description =
  "Chronos 2026, 11 to 13 December at GEC Palamu: expert talks, exhibitions, a hackathon, Robo Soccer, Robo War and more. Three days celebrating what students build. By the Science & Innovation Club.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: "%s · CHRONOS 2026" },
  description,
  applicationName: "CHRONOS 2026",
  keywords: ["Chronos 2026", "Chronos GEC Palamu", "tech fest Jharkhand", "GEC Palamu fest", "hackathon", "Robo War", "Robo Soccer", "Science & Innovation Club"],
  alternates: { canonical: SITE_URL },
  openGraph: { type: "website", url: SITE_URL, siteName: "CHRONOS 2026", locale: "en_IN", title, description },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
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
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
