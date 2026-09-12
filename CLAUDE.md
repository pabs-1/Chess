# Pabs Chess — working context

Free, open source, client-side chess learning app. Two products: a free **Game
Review** (import a PGN or a Chess.com / Lichess game, get move-by-move
evaluation, mistake classification, accuracy, evaluation graph) and an
**in-game coach** (play Stockfish, get real-time commentary explaining *why* a
move is good or bad). See `README.md` for the user-facing description.

## Non-negotiable constraints

1. **No backend.** Everything runs in the browser. Deploys as a static site.
   Nothing may require a server at runtime.
2. **No LLM, no AI API.** All commentary is deterministic: structured data from
   Stockfish + hand-written detectors + language templates. Every sentence the
   app produces must be reproducible and unit-testable. If a feature would need
   a model to generate text, it is out of scope.
3. **GPLv3.** Stockfish is GPLv3, so this project is too. Keep the SPDX licence
   header in every source file, `COPYING` in the repo, and a visible licence
   notice with a link to the source in the UI.
4. **i18n from the first commit.** No hardcoded UI strings. Italian and English,
   with a structure that makes a third language a new file, not a refactor.
5. **Strict separation between analysis and language.** `src/analysis/` emits
   structured data only; `src/commentary/` emits sentences only, consuming that
   data. They must never mix. This is what keeps tests trivial and language
   support cheap.

## Stack

Vite · TypeScript strict · React · Tailwind CSS v4 · `chess.js` ·
`chessground` (Lichess') for the board · `stockfish` from npm, WASM ·
Vitest · ESLint (flat config, type-aware) · `i18next` + `react-i18next`.

**Do not add a dependency that is not in that list without asking the user
first.**

## Layout

```
src/
  engine/       promise-based UCI wrapper over a Web Worker
  analysis/     classifier + motif detectors → DATA ONLY
  commentary/   templates and sentence generation → TEXT ONLY
  openings/     ECO lookup (later)
  ui/           React components
  i18n/         locales/it.json, locales/en.json
scripts/
public/engine/  Stockfish binaries (gitignored, fetched by postinstall)
```

## Engine notes

- Loaded as a Web Worker from `public/engine/`. Binaries are **never**
  committed; `scripts/fetch-engine.mjs` copies them from `node_modules` and
  `postinstall` runs it.
- Currently the single-threaded `lite-single` build, which needs no COOP/COEP.
  Swapping to the multi-threaded build must stay a matter of configuration
  (`VITE_ENGINE_*` + `public/_headers`), never a rewrite. See
  `src/engine/config.ts`.
- **Score convention: everything Stockfish reports — `scoreCp`, `scoreMate`,
  `wdl` — is from the point of view of the side to move.** The `engine/` layer
  preserves that convention untouched and never converts. Any conversion to a
  White-relative point of view belongs in `analysis/`, at the point of use, and
  must be explicit. This is the classic source of downstream sign bugs.
- `UCI_ShowWDL` is enabled, so `info` lines carry win/draw/loss in permille.

## Conventions

- TypeScript strict mode; pure and testable functions wherever possible,
  especially in `analysis/`.
- Before committing, everything must pass: `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`.
- Code, identifiers, code comments, commit messages: **English**. Italian is the
  reference language for user-facing *text*, which lives only in
  `src/i18n/locales/`.
- Atomic commits, conventional-commit style.
- If a design decision is ambiguous, stop and ask the user instead of picking
  unilaterally.

## Roadmap (context — do not implement ahead of the user's request)

1. UCI wrapper ✅
2. Analysis of a pasted PGN: win-percent-delta classification, accuracy, graph
3. Game import from the Chess.com and Lichess APIs
4. Motif detectors + Italian/English templates
5. Play against the engine: Free / Coach / Training modes
6. Opening names (lichess-org/chess-openings ECO dataset, public domain) and
   out-of-book detection
7. PWA → Capacitor (Android/iOS) → Tauri (desktop)

Design notes to keep in mind for those phases:

- Mistake classification is based on the **delta in win percentage**, not raw
  centipawns. Dropping 300cp while at +9 is not a mistake; dropping 80cp in a
  level position is.
- "Forced move" (only legal move, or alternatives far worse) and "good but not
  best" (delta ≈ 0) are separate cases and must be handled as such.
- Commentary uses **progressive disclosure**: four levels of increasing help
  that the user unlocks one at a time, so someone who wants to think it through
  is not handed the answer.
- Every motif detector carries a level (beginner / intermediate / advanced) so
  commentary can be filtered to the user.
- **One motif per comment**, chosen by priority: mate > material > tactics >
  positional.
