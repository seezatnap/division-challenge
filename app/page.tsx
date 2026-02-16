import PlayerSavePanel from "./player-save-panel";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-950 px-6 text-emerald-50">
      <main className="w-full max-w-2xl rounded-2xl border border-emerald-700 bg-emerald-900/40 p-10 shadow-xl">
        <h1 className="text-3xl font-bold tracking-tight">Dino Division</h1>
        <p className="mt-3 text-emerald-100">
          Save/load support now uses the File System Access API with explicit
          permission prompts, JSON schema validation, and browser fallback
          messaging.
        </p>
        <PlayerSavePanel />
      </main>
    </div>
  );
}
