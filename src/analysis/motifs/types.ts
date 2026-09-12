/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Motifs: *why* a move was bad, as data.
 *
 * A motif is never a sentence and never a label. It names a pattern and carries
 * the concrete squares, pieces and moves behind it, so that `src/commentary/`
 * can say it in any language and a test can assert it in none. Chess notation —
 * SAN moves, algebraic squares, piece letters — is data, not text, and is
 * identical in every locale, so it lives here.
 *
 * Exactly one motif is reported per move, chosen by tier: what is happening to
 * the king outranks what is happening to material, which outranks a tactic,
 * which outranks a positional concession. A player who has just been mated does
 * not need to hear about their pawn structure.
 */

import type { Color, MoveClassification } from '../types.ts'

export type PieceCode = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

/** Priority order; `MOTIF_TIERS` below is the authority on the ranking. */
export type MotifTier = 'mate' | 'material' | 'tactics' | 'positional'

export const MOTIF_TIERS: readonly MotifTier[] = ['mate', 'material', 'tactics', 'positional']

/**
 * Who a motif is worth explaining to. A stronger player does not need to be
 * told they hung a queen; a beginner does not need to hear about king safety
 * while pieces are dropping.
 */
export type MotifLevel = 'beginner' | 'intermediate' | 'advanced'

/** A piece on a square, as a motif refers to it. */
export interface PieceOnSquare {
  piece: PieceCode
  square: string
}

export type Motif =
  /** The opponent now has a forced mate that was not there before. */
  | {
      id: 'allows-mate'
      tier: 'mate'
      level: 'beginner'
      /** Moves to mate, always positive. */
      moves: number
      /** The mating line in SAN, opponent to move. */
      line: string[]
    }
  /** The player had a forced mate and played something else. */
  | {
      id: 'misses-mate'
      tier: 'mate'
      level: 'intermediate'
      moves: number
      /** The move that mated, in SAN. */
      bestMove: string
    }
  /** A piece was left where the opponent simply takes it. */
  | {
      id: 'hangs-piece'
      tier: 'material'
      level: 'beginner'
      /** What is lost, and where it stands. */
      target: PieceOnSquare
      /** The capture the opponent plays, in SAN. */
      capture: string
      /** True when nothing defends the square at all. */
      undefended: boolean
    }
  /** The player passed up a capture that wins material. */
  | {
      id: 'misses-material'
      tier: 'material'
      level: 'beginner'
      /** What was there for the taking. */
      target: PieceOnSquare
      /** The capture that should have been played, in SAN. */
      bestMove: string
    }
  /** The opponent's reply hits two pieces at once. */
  | {
      id: 'allows-fork'
      tier: 'tactics'
      level: 'intermediate'
      /** The piece doing the forking, and where it lands. */
      forker: PieceOnSquare
      /** What it hits. Always two or more. */
      targets: PieceOnSquare[]
      /** The forking move, in SAN. */
      reply: string
    }
  /** A pawn in front of one's own castled king was pushed. */
  | {
      id: 'weakens-king'
      tier: 'positional'
      level: 'advanced'
      /** Where the pawn came from. */
      from: string
      /** Where the king stands. */
      kingSquare: string
    }
  /** Castling rights were given up for nothing. */
  | {
      id: 'loses-castling'
      tier: 'positional'
      level: 'advanced'
    }

export type MotifId = Motif['id']

/** Everything a detector is allowed to look at. */
export interface MotifContext {
  fenBefore: string
  fenAfter: string
  /** The move played, in UCI and in SAN. */
  uci: string
  san: string
  mover: Color
  /** The engine's preferred move in the position before, in UCI. */
  bestMove: string | null
  /** The opponent's best continuation from the position after, in UCI. */
  refutation: readonly string[]
  /** Moves to mate for the mover; negative means the mover is being mated. */
  mateBefore: number | null
  mateAfter: number | null
  classification: MoveClassification
}

export type Detector = (context: MotifContext) => Motif | null
