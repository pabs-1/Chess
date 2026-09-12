/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * SCORE CONVENTION: read this before using anything in this file.
 *
 * Every evaluation Stockfish reports is from the point of view of the SIDE TO
 * MOVE in the analysed position: `scoreCp`, `scoreMate` and `wdl` alike. A
 * `scoreCp` of +120 with Black to move means Black is better by 1.2 pawns.
 *
 * This layer preserves that convention untouched and never converts. Any
 * conversion to a White-relative point of view belongs in `src/analysis/`, at
 * the point of use, and must be explicit. Silently mixing the two conventions
 * is the classic source of sign bugs downstream, so it is forbidden here.
 */

/** Win / draw / loss probabilities in permille, side-to-move POV. Sums to 1000. */
export interface Wdl {
  win: number
  draw: number
  loss: number
}

/** One principal variation from a MultiPV search. */
export interface AnalysisLine {
  /** 1-based rank of this line; 1 is the engine's preferred move. */
  multipv: number
  /** Search depth this line was last reported at. */
  depth: number
  /** Centipawns, side-to-move POV. Null when the line reports a mate instead. */
  scoreCp: number | null
  /** Moves to mate, signed, side-to-move POV: +3 means mating, -3 means mated. */
  scoreMate: number | null
  /** Null when the engine was not asked for, or did not report, WDL. */
  wdl: Wdl | null
  /** Principal variation as UCI moves, e.g. ['e2e4', 'e7e5']. */
  pv: string[]
}

/** What is known about a position while the search is still running. */
export interface AnalysisSnapshot {
  /** The analysed position, echoed back so streaming consumers can't mismatch. */
  fen: string
  /** Ordered by `multipv` ascending. */
  lines: AnalysisLine[]
  /** Highest depth reported by any line so far. */
  depthReached: number
}

/** A completed search. */
export interface AnalysisResult extends AnalysisSnapshot {
  /**
   * Best move in UCI notation, or the empty string for a terminal position
   * (Stockfish reports `bestmove (none)` when there is no legal move).
   */
  bestMove: string
}

export interface AnalyseRequest {
  /** Position to analyse, in FEN notation. */
  fen: string
  /** Search depth. Defaults to the engine config's `defaultDepth`. */
  depth?: number
  /** Search time in milliseconds. Combined with `depth`, whichever hits first. */
  movetime?: number
  /** Number of principal variations. Defaults to the engine config's `multiPV`. */
  multiPV?: number
  /**
   * Called every time a line is updated, so the UI can stream results as the
   * search deepens. Called with the accumulated snapshot, not a single line.
   */
  onProgress?: (snapshot: AnalysisSnapshot) => void
}

export type EngineState =
  /** Constructed, no worker yet. */
  | 'idle'
  /** `init()` is in flight. */
  | 'loading'
  /** Booted and accepting commands. */
  | 'ready'
  /** A search is running. */
  | 'searching'
  /** The worker failed to load or crashed; unusable. */
  | 'failed'
  /** `dispose()` was called; unusable. */
  | 'disposed'
