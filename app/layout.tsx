import type { Metadata } from "next";
import { Alegreya_Sans, Cinzel_Decorative } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dino Division",
  description: "Jurassic-themed long division practice game",
};

const jurassicBodyFont = Alegreya_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jurassic-body",
});

const jurassicHeadingFont = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jurassic-heading",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jurassicBodyFont.variable} ${jurassicHeadingFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
