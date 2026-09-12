# Pabs Chess

Free and open source chess learning tools that run entirely in your browser.

Two things, both free:

1. **Game Review** — import a game (pasted PGN, or a Chess.com / Lichess
   username) and get a full analysis: move-by-move evaluation, mistake
   classification, accuracy percentage, and an evaluation graph. A free and
   transparent alternative to Chess.com's paid Game Review.
2. **In-game coach** — play against Stockfish and get real-time commentary that
   explains *why* a move is good or bad, not just which move was best.

## What makes it different

- **It explains the reason.** Detected tactical and positional motifs, not just
  a label and a variation.
- **It talks during the game,** not only at the end. That is possible precisely
  because there is no rating and no human opponent to protect.
- **Fully client-side.** Works offline, no account, no backend, no telemetry.
- **Italian and English** from the first commit.

## Non-negotiable constraints

These shape every design decision in this repository. They are restated for
contributors (and for AI assistants) in [`CLAUDE.md`](./CLAUDE.md).

- **No backend.** Everything runs in the browser; the app deploys as a static
  site.
- **No LLM, no AI API.** Commentary is generated deterministically: structured
  data from Stockfish, plus hand-written detectors, plus language templates.
  It must be reproducible and testable.
- **GPLv3.** Stockfish is GPLv3, so this project is too.
- **i18n from day one.** No hardcoded UI strings, ever.
- **Strict separation between analysis and language.** `src/analysis/` produces
  structured data only. `src/commentary/` produces sentences only, from that
  data. They never mix — that is what keeps tests trivial and makes adding a
  language a new file rather than a refactor.

## Tech stack

Vite · TypeScript (strict) · React · Tailwind CSS · `chess.js` ·
`chessground` · `stockfish` (WASM) · Vitest · `i18next` / `react-i18next`

## Getting started

```bash
npm install     # also fetches the Stockfish binaries, see below
npm run dev     # http://localhost:5173
```

Other scripts:

```bash
npm run build         # type-check and build to dist/
npm run preview       # serve the production build locally
npm run typecheck     # tsc only
npm test              # vitest, single run
npm run test:watch    # vitest, watch mode
npm run fetch-engine  # re-copy the engine binaries
```

## The Stockfish binaries

The engine is about 7 MB and belongs to a separate project, so **it is not
committed to this repository**. [`scripts/fetch-engine.mjs`](./scripts/fetch-engine.mjs)
copies it from `node_modules/stockfish/bin/` into `public/engine/`, and
`postinstall` runs that script automatically after `npm install`. `public/engine/`
is gitignored.

If you install with `--ignore-scripts`, run `npm run fetch-engine` by hand.

### Choosing an engine build

The default is `lite-single`: the single-threaded lite build, which needs no
special HTTP headers and therefore works on any static host.

Switching to the multi-threaded build is a **configuration** change, not a code
change. It needs cross-origin isolation, because multi-threading requires
`SharedArrayBuffer`:

1. Uncomment the `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` rules in
   [`public/_headers`](./public/_headers) (Cloudflare Pages reads this file;
   other hosts have an equivalent).
2. `ENGINE_VARIANT=lite npm run fetch-engine`
3. Set `VITE_ENGINE_WORKER_URL=/engine/stockfish-18-lite.js` and
   `VITE_ENGINE_THREADS=4` (or whatever suits) in `.env`.

The engine wrapper reads those variables at build time; see
[`src/engine/config.ts`](./src/engine/config.ts).

## Project layout

```
src/
  engine/       promise-based UCI wrapper over a Web Worker
  analysis/     classifier + motif detectors → DATA ONLY
  commentary/   templates and sentence generation → TEXT ONLY
  openings/     ECO lookup (later)
  ui/           React components
  i18n/         locales/it.json, locales/en.json
scripts/        build-time helpers
public/engine/  Stockfish binaries (gitignored)
```

## Conventions

- TypeScript strict mode.
- Pure, testable functions wherever possible, especially in `analysis/`.
- Atomic commits, conventional-commit style.
- Code, identifiers, code comments and commit messages in **English**. Italian
  is the reference language for user-facing *text*, which lives in
  `src/i18n/locales/`.
- No superfluous dependencies.

## Licence

Pabs Chess is free software, licensed under the **GNU General Public License
v3.0 or later**. See [`COPYING`](./COPYING) for the full text.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.

### Stockfish

Analysis is powered by [Stockfish](https://stockfishchess.org/), a free and
strong UCI chess engine derived from Glaurung 2.1, copyright the Stockfish
developers. Stockfish is licensed under the GNU General Public License v3, and
is the reason this project is GPLv3 as well. It is used here unmodified, as the
WebAssembly build published by the
[`stockfish` npm package](https://www.npmjs.com/package/stockfish)
(source: [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish),
WASM port: [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)).
