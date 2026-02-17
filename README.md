# Dino Division

Next.js App Router baseline for the Dino Division game, with TypeScript,
Tailwind CSS, shared domain types, and Gemini API key env wiring.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env vars:

```bash
cp .env.example .env.local
```

3. Add your Gemini key to `.env.local`:

```dotenv
GEMINI_API_KEY=your_real_key
```

`lib/env.ts` provides `getGeminiApiKey()` for server-side access to this value.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - ESLint checks
- `npm run typecheck` - TypeScript compile checks
- `npm run test` - Unit tests

## QA Runbook

For developer QA steps (env validation, test/build gate, and browser support
checks for File System Access API), see `docs/qa-runbook.md`.
