/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * As in lichess.test.ts, these fixtures follow the shapes the Chess.com
 * Published-Data API documents and were written by hand, because the sandbox
 * this was built in cannot reach api.chess.com.
 */

import { describe, expect, it, vi } from 'vitest'

import { fetchChessComGames, parseChessComArchive, parseChessComGame } from './chesscom.ts'

const PGN = '[Event "Live Chess"]\n\n1. e4 e5 1/2-1/2'

function chessComGame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: 'https://www.chess.com/game/live/123456',
    pgn: PGN,
    time_control: '600',
    end_time: 1_700_000_000,
    rated: true,
    time_class: 'rapid',
    rules: 'chess',
    white: { username: 'alice', rating: 1500, result: 'win' },
    black: { username: 'bob', rating: 1520, result: 'checkmated' },
    ...overrides,
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('parseChessComGame', () => {
  it('reads a complete game', () => {
    expect(parseChessComGame(chessComGame())).toEqual({
      id: 'https://www.chess.com/game/live/123456',
      source: 'chesscom',
      url: 'https://www.chess.com/game/live/123456',
      pgn: PGN,
      white: 'alice',
      black: 'bob',
      whiteRating: 1500,
      blackRating: 1520,
      result: '1-0',
      // end_time is in seconds; everything else in the app is milliseconds.
      playedAt: 1_700_000_000_000,
      speed: 'rapid',
    })
  })

  it('reads a win for Black', () => {
    const game = chessComGame({
      white: { username: 'alice', result: 'resigned' },
      black: { username: 'bob', result: 'win' },
    })

    expect(parseChessComGame(game)?.result).toBe('0-1')
  })

  it('reads every non-win outcome as a draw', () => {
    for (const outcome of ['agreed', 'repetition', 'stalemate', 'insufficient', '50move']) {
      const game = chessComGame({
        white: { username: 'alice', result: outcome },
        black: { username: 'bob', result: outcome },
      })

      expect(parseChessComGame(game)?.result).toBe('1/2-1/2')
    }
  })

  it('skips a variant the review pipeline cannot handle', () => {
    expect(parseChessComGame(chessComGame({ rules: 'chess960' }))).toBeNull()
    expect(parseChessComGame(chessComGame({ rules: 'bughouse' }))).toBeNull()
  })

  it('skips an entry with no PGN', () => {
    const game = chessComGame()
    delete game.pgn

    expect(parseChessComGame(game)).toBeNull()
  })

  it('survives a game with no player records', () => {
    const game = chessComGame()
    delete game.white
    delete game.black

    const parsed = parseChessComGame(game)
    expect(parsed?.white).toBeNull()
    expect(parsed?.result).toBeNull()
  })

  it('skips anything that is not a game', () => {
    expect(parseChessComGame(null)).toBeNull()
    expect(parseChessComGame([])).toBeNull()
  })
})

describe('parseChessComArchive', () => {
  it('reads the games out of an archive file', () => {
    const archive = { games: [chessComGame({ url: 'a' }), chessComGame({ url: 'b' })] }

    expect(parseChessComArchive(archive).map((game) => game.url)).toEqual(['a', 'b'])
  })

  it('drops the entries it cannot use and keeps the rest', () => {
    const archive = { games: [chessComGame({ url: 'a' }), chessComGame({ rules: 'chess960' })] }

    expect(parseChessComArchive(archive)).toHaveLength(1)
  })

  it('is empty for an archive with no games', () => {
    expect(parseChessComArchive({ games: [] })).toEqual([])
    expect(parseChessComArchive({})).toEqual([])
  })
})

describe('fetchChessComGames', () => {
  const ARCHIVE_2023_11 = 'https://api.chess.com/pub/player/alice/games/2023/11'
  const ARCHIVE_2023_12 = 'https://api.chess.com/pub/player/alice/games/2023/12'

  function respondWith(map: Record<string, unknown>) {
    return vi.fn((url: string) => {
      const body = map[url]
      return Promise.resolve(body === undefined ? json({}, 404) : json(body))
    })
  }

  it('lowercases the username, as the archive paths require', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': { archives: [ARCHIVE_2023_12] },
      [ARCHIVE_2023_12]: { games: [chessComGame()] },
    })

    await fetchChessComGames('ALICE', { fetch: fetchMock })

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/player/alice/games/archives')
  })

  it('reads the newest month first and returns newest game first', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': {
        archives: [ARCHIVE_2023_11, ARCHIVE_2023_12],
      },
      // Archives list games oldest first.
      [ARCHIVE_2023_12]: {
        games: [chessComGame({ url: 'older' }), chessComGame({ url: 'newer' })],
      },
      [ARCHIVE_2023_11]: { games: [] },
    })

    const games = await fetchChessComGames('alice', { fetch: fetchMock })

    expect(games.map((game) => game.url)).toEqual(['newer', 'older'])
    expect(fetchMock.mock.calls[1]?.[0]).toBe(ARCHIVE_2023_12)
  })

  it('walks back a month when the newest one is short', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': {
        archives: [ARCHIVE_2023_11, ARCHIVE_2023_12],
      },
      [ARCHIVE_2023_12]: { games: [chessComGame({ url: 'december' })] },
      [ARCHIVE_2023_11]: { games: [chessComGame({ url: 'november' })] },
    })

    const games = await fetchChessComGames('alice', { max: 2, fetch: fetchMock })

    expect(games.map((game) => game.url)).toEqual(['december', 'november'])
  })

  it('stops as soon as it has enough, without reading older months', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': {
        archives: [ARCHIVE_2023_11, ARCHIVE_2023_12],
      },
      [ARCHIVE_2023_12]: {
        games: [chessComGame({ url: 'a' }), chessComGame({ url: 'b' })],
      },
      [ARCHIVE_2023_11]: { games: [chessComGame({ url: 'old' })] },
    })

    const games = await fetchChessComGames('alice', { max: 2, fetch: fetchMock })

    expect(games).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the games it has when an older month is unavailable', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': {
        archives: [ARCHIVE_2023_11, ARCHIVE_2023_12],
      },
      [ARCHIVE_2023_12]: { games: [chessComGame({ url: 'december' })] },
      // November is listed but 404s, as respondWith answers for anything absent.
    })

    const games = await fetchChessComGames('alice', { fetch: fetchMock })

    expect(games.map((game) => game.url)).toEqual(['december'])
  })

  it('reports the failure when no month could be read at all', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': { archives: [ARCHIVE_2023_12] },
    })

    await expect(fetchChessComGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('reports an unknown player', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 404))

    await expect(fetchChessComGames('nobody', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'not-found',
      source: 'chesscom',
    })
  })

  it('reports a player who has never played', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': { archives: [] },
    })

    await expect(fetchChessComGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'empty',
    })
  })

  it('reports a player whose months hold nothing reviewable', async () => {
    const fetchMock = respondWith({
      'https://api.chess.com/pub/player/alice/games/archives': { archives: [ARCHIVE_2023_12] },
      [ARCHIVE_2023_12]: { games: [chessComGame({ rules: 'chess960' })] },
    })

    await expect(fetchChessComGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'empty',
    })
  })

  it('reports a refused request as unreachable, which is also how CORS looks', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(fetchChessComGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'unreachable',
    })
  })

  it('reports a body that is not JSON as unexpected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>nope</html>', { status: 200 }))

    await expect(fetchChessComGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'unexpected',
    })
  })
})
