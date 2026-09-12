/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { fetchChessComGames } from './chesscom.ts'
import { fetchLichessGames } from './lichess.ts'
import type { GameSource, ImportOptions, ImportedGame } from './types.ts'

export { parseChessComArchive, parseChessComGame } from './chesscom.ts'
export { parseLichessGame, parseLichessNdjson } from './lichess.ts'
export {
  DEFAULT_MAX_GAMES,
  ImportError,
  type FetchLike,
  type GameSource,
  type ImportErrorCode,
  type ImportOptions,
  type ImportedGame,
} from './types.ts'

export const GAME_SOURCES: readonly GameSource[] = ['lichess', 'chesscom']

/** Fetches a player's most recent games from whichever site they name. */
export function fetchGames(
  source: GameSource,
  username: string,
  options: ImportOptions = {},
): Promise<ImportedGame[]> {
  return source === 'lichess'
    ? fetchLichessGames(username, options)
    : fetchChessComGames(username, options)
}
