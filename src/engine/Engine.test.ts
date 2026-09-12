/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { Engine } from './Engine.ts'
import { EngineDisposedError, EngineLoadError, EngineNotReadyError } from './errors.ts'
import { FakeStockfishWorker, installFakeWorker } from './fakeWorker.ts'
import type { AnalysisSnapshot } from './types.ts'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const KIWIPETE_FEN = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'

let restore: (() => void) | null = null
let engine: Engine | null = null

function startEngine(): Engine {
  restore = installFakeWorker()
  engine = new Engine()
  return engine
}

afterEach(() => {
  engine?.dispose()
  engine = null
  restore?.()
  restore = null
})

function worker(): FakeStockfishWorker {
  const instance = FakeStockfishWorker.instances[0]
  if (instance === undefined) throw new Error('no worker was created')
  return instance
}

describe('init', () => {
  it('handshakes and applies the configured options', async () => {
    const created = startEngine()
    await created.init()

    expect(created.state).toBe('ready')
    expect(worker().url).toBe('/engine/stockfish-18-lite-single.js')
    expect(worker().commands).toContain('uci')
    // WDL must be on: the whole analysis layer is built on win percentages.
    expect(worker().commands).toContain('setoption name UCI_ShowWDL value true')
    expect(worker().commands).toContain('setoption name Threads value 1')
    expect(worker().commands).toContain('setoption name Hash value 16')
  })

  it('boots only once no matter how often it is called', async () => {
    const created = startEngine()
    await Promise.all([created.init(), created.init()])
    await created.init()

    expect(FakeStockfishWorker.instances).toHaveLength(1)
    expect(worker().commands.filter((command) => command === 'uci')).toHaveLength(1)
  })

  it('reports a worker that fails to load, and stays unusable afterwards', async () => {
    restore = installFakeWorker({ failOnFirstCommand: true })
    engine = new Engine()

    await expect(engine.init()).rejects.toBeInstanceOf(EngineLoadError)
    expect(engine.state).toBe('failed')
    await expect(engine.analyse({ fen: START_FEN })).rejects.toBeInstanceOf(EngineLoadError)
  })

  it('reports a worker that cannot be constructed at all', async () => {
    const original = globalThis.Worker
    globalThis.Worker = class {
      constructor() {
        throw new Error('script not found')
      }
    } as unknown as typeof Worker
    restore = () => {
      globalThis.Worker = original
    }
    engine = new Engine()

    await expect(engine.init()).rejects.toBeInstanceOf(EngineLoadError)
    expect(engine.state).toBe('failed')
  })
})

describe('analyse', () => {
  it('rejects before init rather than booting implicitly', async () => {
    const created = startEngine()

    await expect(created.analyse({ fen: START_FEN })).rejects.toBeInstanceOf(EngineNotReadyError)
  })

  it('returns a typed result, not raw strings', async () => {
    const created = startEngine()
    await created.init()

    const result = await created.analyse({ fen: START_FEN, depth: 3 })

    expect(result.fen).toBe(START_FEN)
    expect(result.bestMove).toBe('e2e4')
    expect(result.depthReached).toBe(3)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toEqual({
      multipv: 1,
      depth: 3,
      scoreCp: 20,
      scoreMate: null,
      wdl: { win: 499, draw: 400, loss: 101 },
      pv: ['e2e4', 'e7e5'],
    })
  })

  it('sends the position and a bounded go command', async () => {
    const created = startEngine()
    await created.init()
    await created.analyse({ fen: KIWIPETE_FEN, depth: 2 })

    expect(worker().searchCommands).toEqual([`position fen ${KIWIPETE_FEN}`, 'go depth 2'])
  })

  it('falls back to the configured depth when none is requested', async () => {
    restore = installFakeWorker()
    engine = new Engine({ defaultDepth: 5 })
    await engine.init()
    await engine.analyse({ fen: START_FEN })

    expect(worker().searchCommands).toContain('go depth 5')
  })

  it('passes movetime through', async () => {
    const created = startEngine()
    await created.init()
    await created.analyse({ fen: START_FEN, movetime: 250, depth: 2 })

    expect(worker().searchCommands).toContain('go depth 2 movetime 250')
  })

  it('returns one line per requested MultiPV, ordered by rank', async () => {
    const created = startEngine()
    await created.init()

    const result = await created.analyse({ fen: START_FEN, depth: 2, multiPV: 3 })

    expect(result.lines.map((line) => line.multipv)).toEqual([1, 2, 3])
    expect(worker().commands).toContain('setoption name MultiPV value 3')
  })

  it('does not re-send MultiPV when it has not changed', async () => {
    const created = startEngine()
    await created.init()
    await created.analyse({ fen: START_FEN, depth: 2, multiPV: 3 })
    await created.analyse({ fen: START_FEN, depth: 2, multiPV: 3 })

    const multiPvCommands = worker().commands.filter((command) =>
      command.startsWith('setoption name MultiPV'),
    )
    expect(multiPvCommands).toEqual(['setoption name MultiPV value 1', 'setoption name MultiPV value 3'])
  })

  it('streams deepening snapshots through onProgress', async () => {
    const created = startEngine()
    await created.init()

    const depths: number[] = []
    const result = await created.analyse({
      fen: START_FEN,
      depth: 4,
      onProgress: (snapshot: AnalysisSnapshot) => {
        expect(snapshot.fen).toBe(START_FEN)
        depths.push(snapshot.depthReached)
      },
    })

    expect(depths).toEqual([1, 2, 3, 4])
    expect(result.depthReached).toBe(4)
  })

  it('ignores engine chatter and aspiration bounds while streaming', async () => {
    const created = startEngine()
    await created.init()

    const snapshots: AnalysisSnapshot[] = []
    await created.analyse({
      fen: START_FEN,
      depth: 3,
      onProgress: (snapshot) => snapshots.push(snapshot),
    })

    // The fake emits an `info string` line and an `upperbound` line per depth;
    // neither may produce a snapshot or a line.
    expect(snapshots).toHaveLength(3)
    for (const snapshot of snapshots) {
      expect(snapshot.lines.every((line) => line.scoreCp !== 999)).toBe(true)
    }
  })
})

describe('concurrency', () => {
  it('queues overlapping analyses instead of interleaving commands', async () => {
    const created = startEngine()
    await created.init()

    const [first, second] = await Promise.all([
      created.analyse({ fen: START_FEN, depth: 3 }),
      created.analyse({ fen: KIWIPETE_FEN, depth: 2 }),
    ])

    expect(first.fen).toBe(START_FEN)
    expect(second.fen).toBe(KIWIPETE_FEN)
    expect(worker().searchCommands).toEqual([
      `position fen ${START_FEN}`,
      'go depth 3',
      `position fen ${KIWIPETE_FEN}`,
      'go depth 2',
    ])
  })

  it('resolves queued analyses in the order they were requested', async () => {
    const created = startEngine()
    await created.init()

    const order: string[] = []
    await Promise.all([
      created.analyse({ fen: START_FEN, depth: 3 }).then(() => order.push('first')),
      created.analyse({ fen: KIWIPETE_FEN, depth: 1 }).then(() => order.push('second')),
    ])

    expect(order).toEqual(['first', 'second'])
  })

  it('runs work queued behind a failed analysis', async () => {
    const created = startEngine()
    await created.init()

    const failing = created.analyse({ fen: START_FEN, depth: 2, onProgress: () => {
      throw new Error('consumer exploded')
    } })
    const queued = created.analyse({ fen: KIWIPETE_FEN, depth: 2 })

    await expect(failing).rejects.toThrow('consumer exploded')
    await expect(queued).resolves.toMatchObject({ fen: KIWIPETE_FEN })

    // The abandoned search must be stopped before the next position is sent,
    // otherwise the engine would receive `position` in the middle of a search.
    const commands = worker().searchCommands
    expect(commands).toEqual([
      `position fen ${START_FEN}`,
      'go depth 2',
      'stop',
      `position fen ${KIWIPETE_FEN}`,
      'go depth 2',
    ])
  })

  it('queues setOption behind a running search', async () => {
    const created = startEngine()
    await created.init()

    const analysis = created.analyse({ fen: START_FEN, depth: 3 })
    const option = created.setOption('Skill Level', 10)
    await Promise.all([analysis, option])

    const commands = worker().commands
    expect(commands.indexOf('setoption name Skill Level value 10')).toBeGreaterThan(
      commands.indexOf('go depth 3'),
    )
  })
})

describe('stop', () => {
  it('ends the search early and resolves with the depth reached so far', async () => {
    const created = startEngine()
    await created.init()

    const result = await created.analyse({
      fen: START_FEN,
      depth: 99,
      onProgress: (snapshot) => {
        if (snapshot.depthReached === 2) created.stop()
      },
    })

    expect(worker().commands).toContain('stop')
    expect(result.depthReached).toBeGreaterThanOrEqual(2)
    expect(result.depthReached).toBeLessThan(99)
    expect(result.lines).toHaveLength(1)
    expect(created.state).toBe('ready')
  })

  it('is a no-op when nothing is running', async () => {
    const created = startEngine()
    await created.init()
    created.stop()

    expect(worker().commands).not.toContain('stop')
  })
})

describe('dispose', () => {
  it('terminates the worker and rejects the running analysis', async () => {
    const created = startEngine()
    await created.init()

    const analysis = created.analyse({ fen: START_FEN, depth: 99 })
    created.dispose()

    await expect(analysis).rejects.toBeInstanceOf(EngineDisposedError)
    expect(worker().terminated).toBe(true)
    expect(created.state).toBe('disposed')
  })

  it('rejects anything requested afterwards', async () => {
    const created = startEngine()
    await created.init()
    created.dispose()

    await expect(created.analyse({ fen: START_FEN })).rejects.toBeInstanceOf(EngineDisposedError)
    await expect(created.init()).rejects.toBeInstanceOf(EngineDisposedError)
  })

  it('can be called twice', async () => {
    const created = startEngine()
    await created.init()
    created.dispose()

    expect(() => created.dispose()).not.toThrow()
  })
})
