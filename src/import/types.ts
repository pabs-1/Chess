/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Importing games from the public archives of Lichess and Chess.com.
 *
 * Both are read directly from the browser, because there is no backend to read
 * them from. That only works if those services allow cross-origin requests; if
 * one of them stops doing so, the fetch fails and the user is told so, rather
 * than a server appearing in the architecture.
 *
 * Everything the app needs from a fetched game is its PGN — the review pipeline
 * takes it from there. The rest is what a person needs to pick the right game
 * out of a list.
 */

export type GameSource = 'lichess' | 'chesscom'

export interface ImportedGame {
  /** Stable within a source; used as a list key. */
  id: string
  source: GameSource
  /** Where to see the game on the original site. */
  url: string | null
  pgn: string
  white: string | null
  black: string | null
  whiteRating: number | null
  blackRating: number | null
  /** '1-0', '0-1' or '1/2-1/2'. */
  result: string | null
  /** Epoch milliseconds the game finished, for sorting and display. */
  playedAt: number | null
  /** The site's own name for the pace: 'blitz', 'rapid', 'classical'… */
  speed: string | null
}

/**
 * Why an import failed. A code, not a message: the wording lives in the
 * translation files.
 */
export type ImportErrorCode =
  /** No such player on that site. */
  | 'not-found'
  /** The player exists but has no games we can use. */
  | 'empty'
  /** The site asked us to slow down. */
  | 'rate-limited'
  /**
   * The request never completed. In a browser this is also what a cross-origin
   * refusal looks like — `fetch` rejects with a TypeError either way, and the
   * page is not allowed to know which it was.
   */
  | 'unreachable'
  /** The site answered, but not with anything we recognise. */
  | 'unexpected'

export class ImportError extends Error {
  readonly code: ImportErrorCode
  readonly source: GameSource

  constructor(code: ImportErrorCode, source: GameSource, options?: ErrorOptions) {
    super(`${source} import failed: ${code}`, options)
    this.name = 'ImportError'
    this.code = code
    this.source = source
  }
}

/** The subset of `fetch` used here, so tests can supply their own. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ImportOptions {
  /** How many games to return, newest first. */
  max?: number
  signal?: AbortSignal
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike
}

export const DEFAULT_MAX_GAMES = 20
