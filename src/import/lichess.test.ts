/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * The fixtures below follow the shapes the Lichess API documents. They were
 * written by hand rather than captured, because the sandbox this was built in
 * cannot reach lichess.org — so they prove the parser handles the documented
 * shape and its ragged edges, not that the live endpoint still emits it.
 */

import { describe, expect, it, vi } from 'vitest'

import { fetchLichessGames, parseLichessGame, parseLichessNdjson } from './lichess.ts'
import { ImportError } from './types.ts'

const PGN = '1. e4 e5 2. Nf3 Nc6 1/2-1/2'

function lichessGame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q7ZvsdUF',
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    createdAt: 1_700_000_000_000,
    lastMoveAt: 1_700_000_300_000,
    status: 'mate',
    players: {
      white: { user: { name: 'alice', id: 'alice' }, rating: 1500 },
      black: { user: { name: 'bob', id: 'bob' }, rating: 1520 },
    },
    winner: 'white',
    pgn: PGN,
    ...overrides,
  }
}

function ndjson(...games: Record<string, unknown>[]): string {
  return games.map((game) => JSON.stringify(game)).join('\n')
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}

describe('parseLichessGame', () => {
  it('reads a complete game', () => {
    expect(parseLichessGame(lichessGame())).toEqual({
      id: 'q7ZvsdUF',
      source: 'lichess',
      url: 'https://lichess.org/q7ZvsdUF',
      pgn: PGN,
      white: 'alice',
      black: 'bob',
      whiteRating: 1500,
      blackRating: 1520,
      result: '1-0',
      playedAt: 1_700_000_300_000,
      speed: 'blitz',
    })
  })

  it('maps the winner to a result', () => {
    expect(parseLichessGame(lichessGame({ winner: 'black' }))?.result).toBe('0-1')
  })

  it('reads a finished game with no winner as a draw', () => {
    const game = lichessGame({ status: 'draw' })
    delete game.winner

    expect(parseLichessGame(game)?.result).toBe('1/2-1/2')
  })

  it('leaves the result open for a game still in play', () => {
    const game = lichessGame({ status: 'started' })
    delete game.winner

    expect(parseLichessGame(game)?.result).toBeNull()
  })

  it('falls back to the creation time when the game has no last move', () => {
    const game = lichessGame()
    delete game.lastMoveAt

    expect(parseLichessGame(game)?.playedAt).toBe(1_700_000_000_000)
  })

  it('accepts an anonymous player rather than dropping the game', () => {
    const game = parseLichessGame(
      lichessGame({ players: { white: { rating: 1500 }, black: { user: { name: 'bob' } } } }),
    )

    expect(game?.white).toBeNull()
    expect(game?.black).toBe('bob')
  })

  it('skips a variant the review pipeline cannot handle', () => {
    expect(parseLichessGame(lichessGame({ variant: 'crazyhouse' }))).toBeNull()
    expect(parseLichessGame(lichessGame({ variant: 'chess960' }))).toBeNull()
  })

  it('skips an entry with no PGN, since there is nothing to review', () => {
    const game = lichessGame()
    delete game.pgn

    expect(parseLichessGame(game)).toBeNull()
  })

  it('skips anything that is not a game', () => {
    expect(parseLichessGame(null)).toBeNull()
    expect(parseLichessGame('nope')).toBeNull()
    expect(parseLichessGame({})).toBeNull()
  })
})

describe('parseLichessNdjson', () => {
  it('reads one game per line', () => {
    const body = ndjson(lichessGame({ id: 'aaa' }), lichessGame({ id: 'bbb' }))

    expect(parseLichessNdjson(body).map((game) => game.id)).toEqual(['aaa', 'bbb'])
  })

  it('ignores blank lines and trailing newlines', () => {
    const body = `\n${ndjson(lichessGame({ id: 'aaa' }))}\n\n`

    expect(parseLichessNdjson(body)).toHaveLength(1)
  })

  it('keeps the games that did arrive when the stream is truncated', () => {
    const body = `${ndjson(lichessGame({ id: 'aaa' }))}\n{"id":"bbb","pgn`

    expect(parseLichessNdjson(body).map((game) => game.id)).toEqual(['aaa'])
  })

  it('is empty for an empty body', () => {
    expect(parseLichessNdjson('')).toEqual([])
  })
})

describe('fetchLichessGames', () => {
  it('asks for PGN in NDJSON, newest first, and honours max', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ndjson(lichessGame())))

    await fetchLichessGames('alice', { max: 5, fetch: fetchMock })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://lichess.org/api/games/user/alice')
    expect(url).toContain('max=5')
    expect(url).toContain('pgnInJson=true')
    expect(url).toContain('sort=dateDesc')
    expect((init.headers as Record<string, string>).Accept).toBe('application/x-ndjson')
  })

  it('escapes a username that would otherwise change the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ndjson(lichessGame())))

    await fetchLichessGames('../../admin?x=1', { fetch: fetchMock })

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain(encodeURIComponent('../../admin?x=1'))
  })

  it('never returns more than max, whatever the server sends', async () => {
    const body = ndjson(
      lichessGame({ id: 'a' }),
      lichessGame({ id: 'b' }),
      lichessGame({ id: 'c' }),
    )
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))

    await expect(fetchLichessGames('alice', { max: 2, fetch: fetchMock })).resolves.toHaveLength(2)
  })

  it('reports an unknown player', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('', 404))

    await expect(fetchLichessGames('nobody', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'not-found',
      source: 'lichess',
    })
  })

  it('reports being asked to slow down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('', 429))

    await expect(fetchLichessGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'rate-limited',
    })
  })

  it('reports a player with nothing we can review', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(''))

    await expect(fetchLichessGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'empty',
    })
  })

  it('reports a refused request as unreachable, which is also how CORS looks', async () => {
    // In a browser a cross-origin refusal rejects with a TypeError, exactly as a
    // dead network does, and the page is not allowed to tell them apart.
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await fetchLichessGames('alice', { fetch: fetchMock }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ImportError)
    expect(error).toMatchObject({ code: 'unreachable' })
  })

  it('reports any other refusal as unexpected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('', 500))

    await expect(fetchLichessGames('alice', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'unexpected',
    })
  })

  it('passes the abort signal through', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ndjson(lichessGame())))

    await fetchLichessGames('alice', { fetch: fetchMock, signal: controller.signal })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})
