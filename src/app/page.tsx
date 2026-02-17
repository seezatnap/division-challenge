export default function Home() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      {/* Hero section */}
      <div className="dino-fade-up">
        <h1 className="dino-heading text-4xl sm:text-5xl md:text-6xl">
          Dino Division
        </h1>
        <p className="mt-4 max-w-md text-base text-jungle-pale sm:text-lg md:text-xl">
          Long-division practice, Jurassic style.
        </p>
      </div>

      {/* Game area placeholder — workspace UI will render here */}
      <div className="dino-card mt-8 w-full max-w-2xl p-6 sm:mt-12 sm:p-8 md:p-10">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-earth-mid sm:text-base">
            The division workspace will appear here.
          </p>
          <p className="text-xs text-earth-light sm:text-sm">
            Solve problems, earn dinosaurs!
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:gap-4">
        <button className="dino-btn dino-btn-primary">
          Start Practice
        </button>
        <button className="dino-btn dino-btn-secondary">
          Load Save
        </button>
      </div>
    </div>
  );
}
