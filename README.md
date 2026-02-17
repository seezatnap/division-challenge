# Dino Division v2

Next.js App Router + TypeScript + Tailwind foundation for the dino-themed long-division game.

## Run locally

```bash
npm ci
npm run dev
```

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Feature Architecture Baseline

The v2 foundation includes these feature domains under `src/features/`:

- `division-engine`
- `workspace-ui`
- `rewards`
- `gallery`
- `persistence`

Each feature has a typed entrypoint (`index.ts`) and subfolders to support incremental implementation in later tasks.
