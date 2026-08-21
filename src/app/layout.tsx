import type { Metadata } from "next";
import { Alegreya_Sans, Cinzel, IBM_Plex_Mono, Orbitron } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import { UiSoundEffects } from "@/features/workspace-ui/components/ui-sound-effects";

const GOOGLE_ANALYTICS_ID = "G-GW0EZ8GPTN";

const jurassicDisplay = Cinzel({
  variable: "--font-jurassic-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

// Self-hosted like the other faces; was previously a render-blocking CDN link.
const jurassicTechy = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

const jurassicBody = Alegreya_Sans({
  variable: "--font-jurassic-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const jurassicMono = IBM_Plex_Mono({
  variable: "--font-jurassic-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "InGen Division Dashboard",
  description: "Jurassic-themed long-division and long-multiplication practice game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jurassicDisplay.variable} ${jurassicBody.variable} ${jurassicMono.variable} ${jurassicTechy.variable} antialiased`}
      >
        <UiSoundEffects />
        <div className="jp3-frame" data-ui-frame="wood-border">
          <div className="jp3-frame-bolt jp3-frame-bolt--tl" aria-hidden="true" />
          <div className="jp3-frame-bolt jp3-frame-bolt--tr" aria-hidden="true" />
          <div className="jp3-frame-bolt jp3-frame-bolt--bl" aria-hidden="true" />
          <div className="jp3-frame-bolt jp3-frame-bolt--br" aria-hidden="true" />
          {children}
        </div>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ANALYTICS_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
