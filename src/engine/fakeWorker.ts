/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * A scripted stand-in for the Stockfish worker, used by Engine.test.ts.
 *
 * It speaks just enough of the UCI protocol to exercise the parts of the
 * wrapper that are hard to get right (the command queue, stopping a running
 * search, and worker failure) without booting a 7 MB WebAssembly module. The
 * lines it emits follow the shape captured from the real engine; the protocol
 * *parsing* is tested against verbatim real output in uciParser.test.ts.
 */

export interface FakeWorkerOptions {
  /** Fire `onerror` on the first command instead of answering it. */
  failOnFirstCommand?: boolean
}

export class FakeStockfishWorker {
  static instances: FakeStockfishWorker[] = []
  static options: FakeWorkerOptions = {}

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null

  readonly url: string
  readonly commands: string[] = []
  terminated = false

  readonly #options: FakeWorkerOptions
  #searching = false
  #depth = 0
  #depthTarget = 0
  #multiPv = 1

  constructor(url: string | URL) {
    this.url = String(url)
    this.#options = FakeStockfishWorker.options
    FakeStockfishWorker.instances.push(this)
  }

  /** Commands that carry a position or a search, i.e. the ones order matters for. */
  get searchCommands(): string[] {
    return this.commands.filter(
      (command) => command.startsWith('position ') || command.startsWith('go') || command === 'stop',
    )
  }

  postMessage(command: string): void {
    this.commands.push(command)

    if (this.#options.failOnFirstCommand === true && this.commands.length === 1) {
      queueMicrotask(() => {
        this.onerror?.({ message: 'simulated worker failure' } as ErrorEvent)
      })
      return
    }

    if (command === 'uci') {
      this.#emit('id name Fake Stockfish')
      this.#emit('uciok')
      return
    }

    if (command === 'isready') {
      this.#emit('readyok')
      return
    }

    if (command.startsWith('setoption name MultiPV value ')) {
      this.#multiPv = Number.parseInt(command.slice('setoption name MultiPV value '.length), 10)
      return
    }

    if (command.startsWith('go')) {
      const depth = /depth (\d+)/.exec(command)?.[1]
      this.#depthTarget = depth === undefined ? 4 : Number.parseInt(depth, 10)
      this.#depth = 0
      this.#searching = true
      setTimeout(this.#tick, 0)
      return
    }

    if (command === 'stop' && this.#searching) this.#finish()
  }

  terminate(): void {
    this.terminated = true
    this.#searching = false
  }

  #tick = (): void => {
    if (!this.#searching) return

    this.#depth += 1
    // Engine chatter and a bound line, so the accumulator has to filter them out.
    if (this.#depth === 1) this.#emit('info string NNUE evaluation using nn-fake.nnue')
    this.#emit(`info depth ${this.#depth} multipv 1 score cp 999 upperbound nodes 1 time 1 pv e2e4`)

    for (let multipv = 1; multipv <= this.#multiPv; multipv += 1) {
      this.#emit(
        `info depth ${this.#depth} seldepth ${this.#depth + 2} multipv ${multipv} ` +
          `score cp ${30 - multipv * 10} wdl ${500 - multipv} 400 ${100 + multipv} ` +
          `nodes 1000 nps 10000 hashfull 1 time 10 pv e2e4 e7e5`,
      )
    }

    if (this.#depth >= this.#depthTarget) {
      this.#finish()
      return
    }
    setTimeout(this.#tick, 0)
  }

  #finish(): void {
    this.#searching = false
    this.#emit('bestmove e2e4 ponder e7e5')
  }

  #emit(line: string): void {
    queueMicrotask(() => {
      this.onmessage?.({ data: line } as MessageEvent)
    })
  }
}

/** Installs the fake as the global Worker; returns the restore function. */
export function installFakeWorker(options: FakeWorkerOptions = {}): () => void {
  const original = globalThis.Worker
  FakeStockfishWorker.instances = []
  FakeStockfishWorker.options = options
  globalThis.Worker = FakeStockfishWorker as unknown as typeof Worker
  return () => {
    globalThis.Worker = original
    FakeStockfishWorker.instances = []
    FakeStockfishWorker.options = {}
  }
}
