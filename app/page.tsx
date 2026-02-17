import PlayerSavePanel from "./player-save-panel";

export default function Home() {
  return (
    <div className="dino-screen">
      <main className="jurassic-shell px-4 py-7 sm:px-8 sm:py-10">
        <p className="fossil-label">Isla Nublar Learning Lab</p>
        <h1 className="jurassic-heading mt-3 text-3xl font-bold sm:text-4xl">
          Dino Division
        </h1>
        <p className="jurassic-copy mt-3 max-w-3xl text-base sm:text-lg">
          Tackle long division one fossil layer at a time. Name your explorer,
          load a save, or begin a fresh expedition through Jurassic math
          challenges.
        </p>
        <PlayerSavePanel />
      </main>
    </div>
  );
}
