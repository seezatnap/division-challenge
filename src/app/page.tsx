import { featureModules } from "@/features";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f5e6b8_0%,#efe2bc_35%,#d9c8a2_100%)] px-6 py-14 text-stone-900">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-amber-900/20 bg-amber-50/80 p-8 shadow-xl shadow-amber-900/10 backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-900/70">Dino Division v2</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          App Router Foundation Initialized
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-700 sm:text-base">
          This baseline establishes the Next.js App Router + TypeScript + Tailwind setup and the feature-module
          boundaries that downstream tasks will implement.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {featureModules.map((module) => (
            <li key={module.id} className="rounded-xl border border-amber-900/15 bg-white/70 p-4">
              <p className="text-sm font-semibold text-amber-950">{module.title}</p>
              <p className="mt-1 text-sm text-stone-700">{module.summary}</p>
              <p className="mt-2 text-xs text-stone-500">{module.rootPath}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
