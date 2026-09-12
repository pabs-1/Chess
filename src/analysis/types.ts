/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * The data shapes the analysis layer produces.
 *
 * DATA ONLY. Nothing in `src/analysis/` may return a sentence, a label meant
 * for a human, or anything that would need translating. Classifications are
 * codes; `src/commentary/` and the UI turn them into words. See CLAUDE.md.
 */

import type { Wdl } from '../engine/types.ts'

export type Color = 'w' | 'b'

/**
 * A position evaluation, detached from the search that produced it.
 *
 * Unlike `AnalysisLine`, this carries no point of view of its own: whoever
 * holds one must know which side it is expressed for. `src/analysis/pov.ts`
 * is the only place allowed to change that.
 */
export interface Evaluation {
  /** Centipawns, or null when the position is a forced mate. */
  cp: number | null
  /** Moves to mate, signed: positive means the side it is expressed for mates. */
  mate: number | null
  wdl: Wdl | null
}

export interface GameHeaders {
  event: string | null
  site: string | null
  date: string | null
  round: string | null
  white: string | null
  black: string | null
  result: string | null
  whiteElo: number | null
  blackElo: number | null
  /** Every header as it appeared, for whatever this interface does not model. */
  raw: Readonly<Record<string, string>>
}

/** One played move, with the positions on either side of it. */
export interface GameMove {
  /** 0-based index into the game. */
  ply: number
  /** Move number as printed in the PGN; 1 for White's first move. */
  moveNumber: number
  color: Color
  san: string
  /** UCI long algebraic, e.g. 'e2e4', 'e7e8q', 'e1g1' for castling. */
  uci: string
  fenBefore: string
  fenAfter: string
}

export interface ParsedGame {
  headers: GameHeaders
  /** Where the game starts; the standard position unless [FEN] says otherwise. */
  initialFen: string
  moves: GameMove[]
}

/**
 * How good a played move was.
 *
 * A code, never a label: the words live in the translation files.
 *  - `forced`     the position had exactly one legal move
 *  - `best`       the engine's own choice, or close enough to be indistinguishable
 *  - `excellent`  lost almost nothing, but not the engine's move
 *  - `good`       a small, ordinary concession
 *  - `inaccuracy` / `mistake` / `blunder`  increasingly costly
 */
export type MoveClassification =
  | 'forced'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
