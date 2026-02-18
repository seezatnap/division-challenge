import type { Metadata } from "next";
import { Alegreya_Sans, Cinzel, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const jurassicDisplay = Cinzel({
  variable: "--font-jurassic-display",
  subsets: ["latin"],
  weight: ["600", "700"],
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
  description: "Jurassic-themed long-division practice game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${jurassicDisplay.variable} ${jurassicBody.variable} ${jurassicMono.variable} antialiased`}
      >
        <div className="jp3-frame" data-ui-frame="wood-border">
          <div className="jp3-frame-bolt jp3-frame-bolt--tl" aria-hidden="true" />
          <div className="jp3-frame-bolt jp3-frame-bolt--tr" aria-hidden="true" />
          <div className="jp3-frame-bolt jp3-frame-bolt--bl" aria-hidden="true" />
          <div className="jp3-frame-bolt jp3-frame-bolt--br" aria-hidden="true" />
          {children}
        </div>
      </body>
    </html>
  );
}
