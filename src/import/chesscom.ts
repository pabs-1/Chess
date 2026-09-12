/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { readArray, readNumber, readRecord, readString } from './json.ts'
import { DEFAULT_MAX_GAMES, ImportError } from './types.ts'
import type { ImportOptions, ImportedGame } from './types.ts'

const ARCHIVES_URL = 'https://api.chess.com/pub/player'

/** Only standard chess; the review pipeline knows no variants. */
const SUPPORTED_RULES = 'chess'

/**
 * How far back to walk the monthly archives looking for enough games.
 *
 * Chess.com splits a player's history into one file per month, so a player who
 * played twice in the current month needs the previous ones too. The cap keeps
 * a dormant account from costing a dozen requests.
 */
const MAX_ARCHIVES_TO_READ = 3

/**
 * Chess.com states each side's outcome separately, in a vocabulary of its own
 * ('win', 'checkmated', 'resigned', 'agreed', 'repetition', 'timeout',
 * 'stalemate', 'insufficient', '50move', 'abandoned'…). Only one side can win,
 * so everything else is a draw.
 */
function resultFrom(white: unknown, black: unknown): string | null {
  const whiteResult = readString(white, 'result')
  const blackResult = readString(black, 'result')
  if (whiteResult === null && blackResult === null) return null
  if (whiteResult === 'win') return '1-0'
  if (blackResult === 'win') return '0-1'
  return '1/2-1/2'
}

export function parseChessComGame(value: unknown): ImportedGame | null {
  const pgn = readString(value, 'pgn')
  if (pgn === null) return null

  const rules = readString(value, 'rules')
  if (rules !== null && rules !== SUPPORTED_RULES) return null

  const url = readString(value, 'url')
  const white = readRecord(value, 'white')
  const black = readRecord(value, 'black')
  const endTime = readNumber(value, 'end_time')

  return {
    // The game URL is the only stable identifier the archive offers.
    id: url ?? `chesscom-${String(endTime ?? Math.random())}`,
    source: 'chesscom',
    url,
    pgn,
    white: readString(white, 'username'),
    black: readString(black, 'username'),
    whiteRating: readNumber(white, 'rating'),
    blackRating: readNumber(black, 'rating'),
    result: resultFrom(white, black),
    // `end_time` is epoch seconds; everything else here is milliseconds.
    playedAt: endTime === null ? null : endTime * 1000,
    speed: readString(value, 'time_class'),
  }
}

/** Reads one monthly archive file. Archives list games oldest first. */
export function parseChessComArchive(value: unknown): ImportedGame[] {
  const games: ImportedGame[] = []
  for (const entry of readArray(value, 'games')) {
    const game = parseChessComGame(entry)
    if (game !== null) games.push(game)
  }
  return games
}

async function getJson(
  doFetch: NonNullable<ImportOptions['fetch']>,
  url: string,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(url, {
      headers: { Accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (cause) {
    // A cross-origin refusal and a dead network are the same TypeError here.
    throw new ImportError('unreachable', 'chesscom', { cause })
  }

  if (response.status === 404) throw new ImportError('not-found', 'chesscom')
  if (response.status === 429) throw new ImportError('rate-limited', 'chesscom')
  if (!response.ok) throw new ImportError('unexpected', 'chesscom')

  try {
    return await response.json()
  } catch (cause) {
    throw new ImportError('unexpected', 'chesscom', { cause })
  }
}

export async function fetchChessComGames(
  username: string,
  options: ImportOptions = {},
): Promise<ImportedGame[]> {
  const max = options.max ?? DEFAULT_MAX_GAMES
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const { signal } = options

  const archivesUrl = `${ARCHIVES_URL}/${encodeURIComponent(username.toLowerCase())}/games/archives`
  const archives = readArray(await getJson(doFetch, archivesUrl, signal), 'archives').filter(
    (entry): entry is string => typeof entry === 'string',
  )

  if (archives.length === 0) throw new ImportError('empty', 'chesscom')

  // Newest month first, and stop as soon as we have enough.
  const collected: ImportedGame[] = []
  for (const archiveUrl of archives.slice(-MAX_ARCHIVES_TO_READ).reverse()) {
    let archive: unknown
    try {
      archive = await getJson(doFetch, archiveUrl, signal)
    } catch (error) {
      // One month being unavailable is not a reason to throw away the games
      // already collected from the others. With nothing collected, the failure
      // is the whole story and is reported below.
      if (collected.length > 0) break
      throw error
    }

    collected.push(...parseChessComArchive(archive).reverse())
    if (collected.length >= max) break
  }

  if (collected.length === 0) throw new ImportError('empty', 'chesscom')

  return collected.slice(0, max)
}
