import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dino Division",
  description: "Jurassic-themed long division practice game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
