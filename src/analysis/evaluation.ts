/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Turning engine evaluations into a win percentage.
 *
 * This is the foundation the whole classifier will sit on: mistakes are graded
 * by how much a move costs in *winning chances*, not in raw centipawns. Losing
 * 300cp while already at +9 costs almost nothing; losing 80cp in a level
 * position is a real error. Only a win percentage makes those comparable.
 *
 * Every function here is pure and side-effect free, and every value it returns
 * keeps the engine's convention: the point of view of the SIDE TO MOVE in the
 * analysed position. A win percentage of 80 with Black to move means Black is
 * winning. See src/engine/types.ts.
 */

import type { AnalysisLine, Wdl } from '../engine/types.ts'

/**
 * Centipawn-to-win-percentage steepness, from the Lichess accuracy model,
 * fitted on real game results. Only used when the engine gives us no WDL.
 */
const CP_TO_WIN_MULTIPLIER = -0.00368208

/** Beyond ±10 pawns the curve is flat enough that clamping changes nothing. */
const CP_CLAMP = 1000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Win percentage from the engine's own win/draw/loss probabilities.
 *
 * This is the preferred source: it comes from Stockfish's model of the position
 * rather than from a curve fitted over centipawns. A draw counts as half a win,
 * which is what makes the result a scoring expectation rather than a raw win
 * probability.
 *
 * @param wdl permille, summing to 1000, side-to-move POV
 * @returns 0–100
 */
export function winPercentFromWdl(wdl: Wdl): number {
  return clamp((wdl.win + wdl.draw / 2) / 10, 0, 100)
}

/**
 * Win percentage from a centipawn score — the fallback for when WDL is
 * unavailable, e.g. an imported analysis or an engine build without
 * `UCI_ShowWDL`.
 *
 * @param cp centipawns, side-to-move POV
 * @returns 0–100
 */
export function winPercentFromCp(cp: number): number {
  const bounded = clamp(cp, -CP_CLAMP, CP_CLAMP)
  const winning = 2 / (1 + Math.exp(CP_TO_WIN_MULTIPLIER * bounded)) - 1
  return clamp(50 + 50 * winning, 0, 100)
}

/**
 * Win percentage for a line, picking the best source available: the engine's
 * WDL, then a mate score, then the centipawn fallback.
 *
 * A mate score is a certainty, so it saturates: being the one delivering mate
 * is 100, being the one getting mated is 0.
 *
 * @returns 0–100, side-to-move POV
 * @throws when the line carries neither a score nor a mate, which the UCI
 *   parser never produces and therefore signals a bug upstream
 */
export function winPercentFromLine(line: AnalysisLine): number {
  if (line.wdl !== null) return winPercentFromWdl(line.wdl)
  // `mate 0` means the side to move has already been mated.
  if (line.scoreMate !== null) return line.scoreMate > 0 ? 100 : 0
  if (line.scoreCp !== null) return winPercentFromCp(line.scoreCp)

  throw new Error('Cannot evaluate a line with neither a centipawn score nor a mate score')
}

/**
 * Formats a line for display: `"+0.35"`, `"-1.20"`, `"0.00"`, `"M4"`, `"-M3"`.
 *
 * The decimal separator stays a full stop in every language: this is chess
 * notation, like `Nf3`, not prose, so it does not belong in the translation
 * files. A positive value always favours the side to move.
 *
 * @throws when the line carries neither a score nor a mate
 */
export function formatEval(line: AnalysisLine): string {
  if (line.scoreMate !== null) {
    return `${line.scoreMate < 0 ? '-' : ''}M${Math.abs(line.scoreMate)}`
  }

  if (line.scoreCp !== null) {
    if (line.scoreCp === 0) return '0.00'
    const pawns = Math.abs(line.scoreCp) / 100
    return `${line.scoreCp > 0 ? '+' : '-'}${pawns.toFixed(2)}`
  }

  throw new Error('Cannot format a line with neither a centipawn score nor a mate score')
}
