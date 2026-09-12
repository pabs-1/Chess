/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Point-of-view conversion — the one place allowed to flip a sign.
 *
 * Stockfish expresses every evaluation from the point of view of the side to
 * move. Reviewing a game means comparing the position before a move with the
 * position after it, and between those two the side to move has changed: the
 * engine's two numbers are expressed for opposite players. Comparing them
 * directly is the single most likely way to get a game review silently,
 * plausibly wrong — every classification inverted for one colour.
 *
 * So conversion happens here, explicitly, and nowhere else. `src/engine/` never
 * converts; callers state which side a number is expressed for and which side
 * they want it for, and the types make them say it.
 */

import { winPercentFromEvaluation } from './evaluation.ts'
import type { Wdl } from '../engine/types.ts'
import type { Color, Evaluation } from './types.ts'

/** Negation that never yields -0, which would break equality in tests and UIs. */
function negate(value: number): number {
  return value === 0 ? 0 : -value
}

/** Which side is to move in a position. */
export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/** Swaps the win and loss probabilities; a draw stays a draw. */
export function invertWdl(wdl: Wdl): Wdl {
  return { win: wdl.loss, draw: wdl.draw, loss: wdl.win }
}

/**
 * Re-expresses an evaluation for the opposite side.
 *
 * `mate 0` — the side it is expressed for has already been mated — has no
 * meaningful opposite, since there is no "mates in zero". It is left at 0
 * rather than invented; the UCI parser never produces it, because a position
 * with no legal move reports no line at all.
 */
export function invertEvaluation(evaluation: Evaluation): Evaluation {
  return {
    cp: evaluation.cp === null ? null : negate(evaluation.cp),
    mate: evaluation.mate === null ? null : negate(evaluation.mate),
    wdl: evaluation.wdl === null ? null : invertWdl(evaluation.wdl),
  }
}

/**
 * Re-expresses an evaluation from one side's point of view to another's.
 *
 * @param expressedFor the side the evaluation currently favours when positive
 * @param wantedFor the side it should favour when positive
 */
export function toPov(evaluation: Evaluation, expressedFor: Color, wantedFor: Color): Evaluation {
  return expressedFor === wantedFor ? evaluation : invertEvaluation(evaluation)
}

/** Convenience for the evaluation graph, whose axis is always White's. */
export function toWhitePov(evaluation: Evaluation, expressedFor: Color): Evaluation {
  return toPov(evaluation, expressedFor, 'w')
}

/**
 * Win percentage for a chosen side, from an evaluation expressed for either.
 *
 * @returns 0–100 for `wantedFor`
 */
export function winPercentFor(
  evaluation: Evaluation,
  expressedFor: Color,
  wantedFor: Color,
): number {
  return winPercentFromEvaluation(toPov(evaluation, expressedFor, wantedFor))
}

/** The side that is not `color`. */
export function opponentOf(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}
