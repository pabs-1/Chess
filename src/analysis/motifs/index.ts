/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { isNoteworthy } from '../classify.ts'
import { allowsMate, missesMate } from './mate.ts'
import { hangsPiece, missesMaterial } from './material.ts'
import { allowsFork } from './tactics.ts'
import { losesCastling, weakensKing } from './positional.ts'
import { MOTIF_TIERS } from './types.ts'
import type { Detector, Motif, MotifContext } from './types.ts'

/**
 * Every detector, in the order they are consulted.
 *
 * The order *is* the priority rule: mate before material, material before
 * tactics, tactics before anything positional. A player who has just been mated
 * does not need to hear about their king shelter. `detectors are ordered by
 * tier` in index.test.ts holds this list to that promise.
 */
export const DETECTORS: readonly Detector[] = [
  allowsMate,
  missesMate,
  hangsPiece,
  missesMaterial,
  allowsFork,
  weakensKing,
  losesCastling,
]

/**
 * The one motif worth telling the player about, or null.
 *
 * Only moves that actually went wrong get one: naming a pattern behind a move
 * that cost nothing would be noise dressed as insight.
 */
export function detectMotif(context: MotifContext): Motif | null {
  if (!isNoteworthy(context.classification)) return null

  for (const detect of DETECTORS) {
    const motif = detect(context)
    if (motif !== null) return motif
  }
  return null
}

export { MOTIF_TIERS }
export { PIECE_VALUES } from './board.ts'
export type {
  Detector,
  Motif,
  MotifContext,
  MotifId,
  MotifLevel,
  MotifTier,
  PieceCode,
  PieceOnSquare,
} from './types.ts'
