import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DinoPageShell } from "@/features/theme/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dino Division",
  description:
    "An interactive, dinosaur-themed long-division practice game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DinoPageShell>{children}</DinoPageShell>
      </body>
    </html>
  );
}
