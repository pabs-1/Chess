/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * The commentary layer: sentences, and nothing else.
 *
 * It consumes the data `src/analysis/` produced and decides *what to say and in
 * what order*. It never decides whether a move was bad, never looks at a board,
 * and never computes anything about chess: if it needed to, the fact belongs
 * upstream as data.
 *
 * The words themselves live in `src/i18n/locales/`. What this layer emits is a
 * key and the values to interpolate into it, so adding a language is a new
 * locale file and nothing else. Values are codes and chess notation, never
 * words: a piece is `'n'`, and the template turns that into "cavallo" or
 * "knight".
 */

/**
 * One rung of the ladder, in the order it is revealed.
 *
 * Progressive disclosure: a player who wants to work it out for themselves gets
 * a nudge, not the answer. Each step tells them strictly more than the last.
 *  - `signal`   something is wrong here
 *  - `theme`    what kind of thing, with no specifics
 *  - `detail`   the actual pieces and squares
 *  - `solution` what the engine would have played
 */
export type CommentKind = 'signal' | 'theme' | 'detail' | 'solution'

export const COMMENT_KINDS: readonly CommentKind[] = ['signal', 'theme', 'detail', 'solution']

export interface CommentStep {
  kind: CommentKind
  /** Translation key. */
  key: string
  /** Interpolation values: codes and notation, never translated words. */
  values: Readonly<Record<string, string | number>>
}
