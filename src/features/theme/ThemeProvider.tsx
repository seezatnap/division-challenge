"use client";

import React from "react";
import Link from "next/link";

/**
 * DinoBackground — renders the ambient jungle/Jurassic background
 * with subtle motif overlays (fern silhouettes, gradient fog).
 *
 * This is intentionally CSS-only with inline SVG for zero
 * external dependencies.
 */
export function DinoBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Base jungle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a3a1a] via-[#2d5a27] to-[#1a3a1a]" />

      {/* Radial light from top center — "sunlight through canopy" */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(212,160,23,0.15)_0%,transparent_60%)]" />

      {/* Bottom fog / mist */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#1a3a1a]/80 to-transparent" />

      {/* Fern motif — top-left */}
      <svg
        className="absolute -left-8 -top-4 h-48 w-48 opacity-[0.06] sm:h-64 sm:w-64"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path
          className="text-[#5a9e4f]"
          d="M50 10 Q48 20 45 30 Q42 35 38 38 Q42 40 46 38 Q48 35 50 30 Q52 35 54 38 Q58 40 62 38 Q58 35 55 30 Q52 20 50 10 Z M50 30 Q48 40 45 50 Q42 55 38 58 Q42 60 46 58 Q48 55 50 50 Q52 55 54 58 Q58 60 62 58 Q58 55 55 50 Q52 40 50 30 Z M50 50 Q48 60 45 70 Q42 75 38 78 Q42 80 46 78 Q48 75 50 70 Q52 75 54 78 Q58 80 62 78 Q58 75 55 70 Q52 60 50 50 Z"
        />
      </svg>

      {/* Fern motif — bottom-right */}
      <svg
        className="absolute -bottom-4 -right-8 h-48 w-48 rotate-180 opacity-[0.06] sm:h-64 sm:w-64"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path
          className="text-[#5a9e4f]"
          d="M50 10 Q48 20 45 30 Q42 35 38 38 Q42 40 46 38 Q48 35 50 30 Q52 35 54 38 Q58 40 62 38 Q58 35 55 30 Q52 20 50 10 Z M50 30 Q48 40 45 50 Q42 55 38 58 Q42 60 46 58 Q48 55 50 50 Q52 55 54 58 Q58 60 62 58 Q58 55 55 50 Q52 40 50 30 Z M50 50 Q48 60 45 70 Q42 75 38 78 Q42 80 46 78 Q48 75 50 70 Q52 75 54 78 Q58 80 62 78 Q58 75 55 70 Q52 60 50 50 Z"
        />
      </svg>

      {/* Footprint motifs — scattered decoratively */}
      <svg
        className="absolute bottom-24 left-12 h-12 w-12 rotate-[-25deg] opacity-[0.04] sm:h-16 sm:w-16"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path
          className="text-[#c4a882]"
          d="M50 20 Q48 25 45 28 L42 35 Q40 40 42 45 L45 48 Q48 50 50 48 Q52 50 55 48 L58 45 Q60 40 58 35 L55 28 Q52 25 50 20 Z M42 15 Q40 12 42 10 Q44 12 42 15 Z M50 12 Q48 9 50 7 Q52 9 50 12 Z M58 15 Q56 12 58 10 Q60 12 58 15 Z"
        />
      </svg>

      <svg
        className="absolute right-20 top-1/3 h-10 w-10 rotate-[15deg] opacity-[0.04] sm:h-14 sm:w-14"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path
          className="text-[#c4a882]"
          d="M50 20 Q48 25 45 28 L42 35 Q40 40 42 45 L45 48 Q48 50 50 48 Q52 50 55 48 L58 45 Q60 40 58 35 L55 28 Q52 25 50 20 Z M42 15 Q40 12 42 10 Q44 12 42 15 Z M50 12 Q48 9 50 7 Q52 9 50 12 Z M58 15 Q56 12 58 10 Q60 12 58 15 Z"
        />
      </svg>
    </div>
  );
}

/**
 * Navigation bar with Jurassic styling and responsive layout.
 */
export function DinoNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-[#5a9e4f]/20 bg-[#1a3a1a]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo / Title */}
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-[#d4a017] transition-colors hover:text-[#f0c94d] sm:text-xl"
        >
          <span aria-hidden="true" className="text-2xl">
            🦕
          </span>
          <span>Dino Division</span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#a8d5a0] transition-colors hover:bg-[#5a9e4f]/20 hover:text-[#f0c94d] sm:px-4 sm:py-2 sm:text-base"
          >
            Play
          </Link>
          <Link
            href="/gallery"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#a8d5a0] transition-colors hover:bg-[#5a9e4f]/20 hover:text-[#f0c94d] sm:px-4 sm:py-2 sm:text-base"
          >
            Gallery
          </Link>
        </div>
      </div>
    </nav>
  );
}

/**
 * Themed page wrapper providing consistent layout, background, and nav.
 */
export function DinoPageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DinoBackground />
      <DinoNav />
      <main className="relative z-0 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        {children}
      </main>
    </>
  );
}
