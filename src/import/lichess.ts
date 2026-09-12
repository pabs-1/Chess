/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { readNumber, readRecord, readString } from './json.ts'
import { DEFAULT_MAX_GAMES, ImportError } from './types.ts'
import type { ImportOptions, ImportedGame } from './types.ts'

const GAMES_URL = 'https://lichess.org/api/games/user'

/** Only standard chess; the review pipeline knows no variants. */
const SUPPORTED_VARIANT = 'standard'

function resultFrom(winner: string | null, status: string | null): string | null {
  if (winner === 'white') return '1-0'
  if (winner === 'black') return '0-1'
  // No winner and a finished game means a draw; a game still in play has none.
  if (status === null || status === 'started') return null
  return '1/2-1/2'
}

/**
 * Player name, or null for anonymous play and for games against the Lichess AI,
 * neither of which carries a `user` object. The PGN itself still names both
 * sides, so the review is unaffected; only the picker shows a colour instead.
 */
function playerName(players: Record<string, unknown> | null, colour: string): string | null {
  return readString(readRecord(readRecord(players, colour), 'user'), 'name')
}

function playerRating(players: Record<string, unknown> | null, colour: string): number | null {
  return readNumber(readRecord(players, colour), 'rating')
}

/** Turns one NDJSON line into a game, or null if it is not one we can use. */
export function parseLichessGame(value: unknown): ImportedGame | null {
  const id = readString(value, 'id')
  const pgn = readString(value, 'pgn')
  if (id === null || pgn === null) return null

  const variant = readString(value, 'variant')
  if (variant !== null && variant !== SUPPORTED_VARIANT) return null

  const players = readRecord(value, 'players')

  return {
    id,
    source: 'lichess',
    url: `https://lichess.org/${id}`,
    pgn,
    white: playerName(players, 'white'),
    black: playerName(players, 'black'),
    whiteRating: playerRating(players, 'white'),
    blackRating: playerRating(players, 'black'),
    result: resultFrom(readString(value, 'winner'), readString(value, 'status')),
    playedAt: readNumber(value, 'lastMoveAt') ?? readNumber(value, 'createdAt'),
    speed: readString(value, 'speed'),
  }
}

/**
 * Parses an NDJSON body: one JSON object per line.
 *
 * A malformed line is skipped rather than fatal — a truncated stream should
 * still yield the games that did arrive.
 */
export function parseLichessNdjson(body: string): ImportedGame[] {
  const games: ImportedGame[] = []

  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue

    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch {
      continue
    }

    const game = parseLichessGame(value)
    if (game !== null) games.push(game)
  }

  return games
}

export async function fetchLichessGames(
  username: string,
  options: ImportOptions = {},
): Promise<ImportedGame[]> {
  const max = options.max ?? DEFAULT_MAX_GAMES
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)

  const query = new URLSearchParams({
    max: String(max),
    pgnInJson: 'true',
    clocks: 'false',
    evals: 'false',
    opening: 'true',
    sort: 'dateDesc',
  })
  const url = `${GAMES_URL}/${encodeURIComponent(username)}?${query.toString()}`

  let response: Response
  try {
    response = await doFetch(url, {
      headers: { Accept: 'application/x-ndjson' },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
  } catch (cause) {
    // A cross-origin refusal and a dead network are the same TypeError here.
    throw new ImportError('unreachable', 'lichess', { cause })
  }

  if (response.status === 404) throw new ImportError('not-found', 'lichess')
  if (response.status === 429) throw new ImportError('rate-limited', 'lichess')
  if (!response.ok) throw new ImportError('unexpected', 'lichess')

  let body: string
  try {
    body = await response.text()
  } catch (cause) {
    throw new ImportError('unreachable', 'lichess', { cause })
  }

  const games = parseLichessNdjson(body)
  if (games.length === 0) throw new ImportError('empty', 'lichess')

  return games.slice(0, max)
}
