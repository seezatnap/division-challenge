# AGENTS.md

## Next.js Dev Server Concurrency Rule

Always run each `next dev` process with a unique `NEXT_DIST_DIR` so multiple servers can run at the same time without lock collisions on `.next/dev/lock`.

### Required Pattern

- For any spawned dev server: set `NEXT_DIST_DIR` explicitly.
- Do not start two concurrent servers that share the same `NEXT_DIST_DIR`.

### Command Examples

- Primary local dev server:
  - `NEXT_DIST_DIR=.next-dev-3000 npm run dev -- --port 3000 --hostname 127.0.0.1`
- Secondary local dev server:
  - `NEXT_DIST_DIR=.next-dev-3001 npm run dev -- --port 3001 --hostname 127.0.0.1`
- Visual test harness server (reserved convention):
  - `NEXT_DIST_DIR=.next-visual-tests npm run dev -- --port 4173 --hostname 127.0.0.1`

### Test/Automation Guidance

- Any script/test runner that launches `next dev` must inject a dedicated `NEXT_DIST_DIR`.
- Keep the visual test runner on `.next-visual-tests` unless intentionally changed.
