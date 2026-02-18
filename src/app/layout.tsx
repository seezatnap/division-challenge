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
  title: "Dino Division v2",
  description: "Jurassic-themed long-division practice game.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jurassicDisplay.variable} ${jurassicBody.variable} ${jurassicMono.variable} antialiased`}
      >
        <div
          aria-hidden="true"
          className="jurassic-app-frame"
          data-ui-decoration="viewport-frame"
        />
        {children}
      </body>
    </html>
  );
}
