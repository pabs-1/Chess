/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { resolveEngineConfig, type EngineConfig } from './config.ts'
import {
  EngineDisposedError,
  EngineLoadError,
  EngineNotReadyError,
  EngineTimeoutError,
  type EngineError,
} from './errors.ts'
import { depthReached, parseBestMove, parseInfo, upsertLine } from './uciParser.ts'
import type {
  AnalyseRequest,
  AnalysisLine,
  AnalysisResult,
  AnalysisSnapshot,
  EngineState,
} from './types.ts'

/** Matches a line and extracts a value from it, or returns null to keep waiting. */
type LineMatcher<T> = (line: string) => T | null

interface PendingWait {
  reject: (error: Error) => void
}

/**
 * Builds the `go` command. Never emits a bare `go`, which would let the engine
 * pick its own (effectively unbounded) search.
 */
function buildGoCommand(request: AnalyseRequest, config: EngineConfig): string {
  const parts = ['go']
  if (request.depth !== undefined) parts.push('depth', String(request.depth))
  if (request.movetime !== undefined) parts.push('movetime', String(request.movetime))
  if (request.depth === undefined && request.movetime === undefined) {
    parts.push('depth', String(config.defaultDepth))
  }
  return parts.join(' ')
}

/**
 * Promise-based wrapper around Stockfish running in a Web Worker.
 *
 * ## Concurrency
 *
 * The engine speaks one conversation at a time, so `analyse()` and
 * `setOption()` are serialised through an internal FIFO queue: calling
 * `analyse()` while a search is running does not reject and does not interleave
 * commands — it waits its turn. `stop()` ends the *current* search early, and
 * that search resolves with whatever depth it had reached, which is a valid
 * result rather than an error. `dispose()` rejects everything still queued.
 *
 * ## Scores
 *
 * Every score that comes out of this class is from the point of view of the
 * side to move, exactly as Stockfish reports it, and is never converted here.
 * See src/engine/types.ts for the full rule.
 */
export class Engine {
  readonly #config: EngineConfig

  #worker: Worker | null = null
  #state: EngineState = 'idle'
  #initPromise: Promise<void> | null = null
  #fatalError: EngineError | null = null

  /** Line subscribers, one per outstanding wait. */
  readonly #listeners = new Set<(line: string) => void>()
  /** Outstanding waits, so a crash or a dispose can reject all of them. */
  readonly #pending = new Set<PendingWait>()

  /** Tail of the FIFO queue; every queued operation chains onto it. */
  #tail: Promise<unknown> = Promise.resolve()

  /** Last MultiPV actually applied, to avoid a needless round trip per search. */
  #appliedMultiPV: number | null = null

  constructor(config: Partial<EngineConfig> = {}) {
    this.#config = resolveEngineConfig(config)
  }

  get state(): EngineState {
    return this.#state
  }

  get config(): Readonly<EngineConfig> {
    return this.#config
  }

  /**
   * Boots the worker, handshakes with `uci`, and applies the configured
   * options. Idempotent: concurrent and repeated calls share one boot.
   */
  init(): Promise<void> {
    if (this.#state === 'disposed') return Promise.reject(new EngineDisposedError())
    if (this.#initPromise === null) this.#initPromise = this.#boot()
    return this.#initPromise
  }

  /** Resolves once the engine has drained its input, i.e. on `readyok`. */
  async isReady(): Promise<void> {
    this.#assertUsable()
    if (this.#worker === null) {
      throw new EngineNotReadyError('The engine is not started; call init() first')
    }
    await this.#syncReady()
  }

  /**
   * Sets a UCI option and resolves once the engine confirms it has applied it.
   * Queued behind any running search, because UCI options must not be changed
   * mid-search.
   */
  setOption(name: string, value: string | number | boolean): Promise<void> {
    return this.#enqueue(async () => {
      this.#assertUsable()
      if (this.#state !== 'ready') {
        throw new EngineNotReadyError('The engine is not started; call init() first')
      }
      await this.#applyOption(name, value)
    })
  }

  /**
   * Analyses one position. Resolves when the engine reports `bestmove`, either
   * because the search finished or because `stop()` cut it short.
   */
  analyse(request: AnalyseRequest): Promise<AnalysisResult> {
    return this.#enqueue(() => this.#runAnalysis(request))
  }

  /**
   * Ends the running search early. The pending `analyse()` promise resolves
   * normally with the depth reached so far. A no-op when nothing is running.
   */
  stop(): void {
    if (this.#state !== 'searching') return
    this.#post('stop')
  }

  /**
   * Terminates the worker and rejects everything still queued. The instance is
   * not reusable afterwards.
   */
  dispose(): void {
    if (this.#state === 'disposed') return

    const worker = this.#worker
    this.#state = 'disposed'
    this.#worker = null
    this.#initPromise = null
    this.#rejectPending(new EngineDisposedError())

    if (worker !== null) {
      try {
        worker.postMessage('quit')
      } catch {
        // The worker may already be gone; terminating is what matters.
      }
      worker.terminate()
    }
  }

  // ---------------------------------------------------------------- internals

  async #boot(): Promise<void> {
    this.#state = 'loading'

    let worker: Worker
    try {
      worker = new Worker(this.#config.workerUrl)
    } catch (cause) {
      throw this.#fail(
        new EngineLoadError(`Could not start the engine worker at ${this.#config.workerUrl}`, {
          cause,
        }),
      )
    }

    this.#worker = worker
    worker.onmessage = (event: MessageEvent) => {
      this.#receive(event.data)
    }
    worker.onerror = (event: ErrorEvent) => {
      this.#fail(
        new EngineLoadError(
          `The engine worker failed: ${event.message || 'unknown error'} ` +
            `(${this.#config.workerUrl}). Check that the Stockfish binaries were fetched; ` +
            'see `npm run fetch-engine`.',
        ),
      )
    }
    worker.onmessageerror = () => {
      this.#fail(new EngineLoadError('The engine worker sent a message that could not be read'))
    }

    // Register the wait before sending, so a fast reply cannot be missed.
    const handshake = this.#waitForLine(
      (line) => (line === 'uciok' ? true : null),
      this.#config.bootTimeoutMs,
      'uciok',
    )
    this.#post('uci')
    await handshake

    await this.#applyOption('Threads', this.#config.threads)
    await this.#applyOption('Hash', this.#config.hashMb)
    await this.#applyOption('UCI_ShowWDL', this.#config.showWdl)
    await this.#applyOption('MultiPV', this.#config.multiPV)

    this.#state = 'ready'
  }

  async #runAnalysis(request: AnalyseRequest): Promise<AnalysisResult> {
    this.#assertUsable()
    if (this.#state !== 'ready') {
      throw new EngineNotReadyError('The engine is not started; call init() first')
    }

    const multiPV = request.multiPV ?? this.#config.multiPV
    if (multiPV !== this.#appliedMultiPV) await this.#applyOption('MultiPV', multiPV)

    const { fen, onProgress } = request
    let lines: AnalysisLine[] = []
    const snapshot = (): AnalysisSnapshot => ({ fen, lines, depthReached: depthReached(lines) })

    this.#state = 'searching'
    try {
      const finished = this.#waitForLine<string>((line) => {
        const info = parseInfo(line)
        if (info !== null) {
          lines = upsertLine(lines, info)
          onProgress?.(snapshot())
          return null
        }
        return parseBestMove(line)?.bestMove ?? null
      }, null, 'bestmove')

      this.#post(`position fen ${fen}`)
      this.#post(buildGoCommand(request, this.#config))

      const bestMove = await finished
      return { ...snapshot(), bestMove }
    } catch (error) {
      // The search was abandoned without the engine being told — an onProgress
      // consumer threw, say. Drain it, or the next queued `position` would
      // arrive mid-search and desynchronise the protocol.
      await this.#abortSearch()
      throw error
    } finally {
      // On a fatal error the state is already 'failed'; don't resurrect it.
      if (this.#state === 'searching') this.#state = 'ready'
    }
  }

  /** Stops a search we are no longer listening to, and waits for it to end. */
  async #abortSearch(): Promise<void> {
    if (this.#worker === null || this.#state !== 'searching') return
    try {
      const finished = this.#waitForLine(
        (line) => (parseBestMove(line) === null ? null : true),
        this.#config.bootTimeoutMs,
        'bestmove',
      )
      this.#post('stop')
      await finished
    } catch {
      // The engine is already gone or unresponsive; there is nothing to drain.
    }
  }

  /** Sets an option and waits for `readyok`, which is UCI's only confirmation. */
  async #applyOption(name: string, value: string | number | boolean): Promise<void> {
    this.#post(`setoption name ${name} value ${String(value)}`)
    if (name === 'MultiPV') {
      const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
      this.#appliedMultiPV = Number.isFinite(parsed) ? parsed : null
    }
    await this.#syncReady()
  }

  async #syncReady(): Promise<void> {
    const readyok = this.#waitForLine(
      (line) => (line === 'readyok' ? true : null),
      this.#config.bootTimeoutMs,
      'readyok',
    )
    this.#post('isready')
    await readyok
  }

  /** Chains an operation onto the FIFO queue, isolated from its predecessor. */
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // Both handlers run `operation`: a predecessor that failed must not cancel
    // the work queued behind it.
    const run = this.#tail.then(operation, operation)
    // Swallow the outcome for the tail only: a failure here must not reject the
    // promise the *next* caller chains onto.
    this.#tail = run.catch(() => undefined)
    return run
  }

  #waitForLine<T>(match: LineMatcher<T>, timeoutMs: number | null, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null

      const settle = (): void => {
        if (timer !== null) clearTimeout(timer)
        this.#listeners.delete(listener)
        this.#pending.delete(pending)
      }

      const listener = (line: string): void => {
        let matched: T | null
        try {
          matched = match(line)
        } catch (error) {
          settle()
          reject(error instanceof Error ? error : new Error(String(error)))
          return
        }
        if (matched === null) return
        settle()
        resolve(matched)
      }

      const pending: PendingWait = {
        reject: (error: Error) => {
          settle()
          reject(error)
        },
      }

      this.#listeners.add(listener)
      this.#pending.add(pending)

      if (timeoutMs !== null) {
        timer = setTimeout(() => {
          settle()
          reject(new EngineTimeoutError(`The engine did not answer with ${what} in ${timeoutMs}ms`))
        }, timeoutMs)
      }
    })
  }

  /** Splits and dispatches worker output; a message may carry several lines. */
  #receive(data: unknown): void {
    const text = typeof data === 'string' ? data : String(data)
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (line === '') continue
      // Copy: a listener may unregister itself while we iterate.
      for (const listener of [...this.#listeners]) listener(line)
    }
  }

  #post(command: string): void {
    if (this.#worker === null) {
      throw new EngineNotReadyError('The engine is not started; call init() first')
    }
    this.#worker.postMessage(command)
  }

  /** Marks the engine unusable and rejects everything outstanding. */
  #fail(error: EngineError): EngineError {
    if (this.#state === 'disposed') return error

    this.#state = 'failed'
    this.#fatalError = error
    this.#rejectPending(error)

    const worker = this.#worker
    this.#worker = null
    worker?.terminate()

    return error
  }

  #rejectPending(error: Error): void {
    for (const pending of [...this.#pending]) pending.reject(error)
    this.#pending.clear()
    this.#listeners.clear()
  }

  #assertUsable(): void {
    if (this.#state === 'disposed') throw new EngineDisposedError()
    if (this.#state === 'failed') {
      throw this.#fatalError ?? new EngineNotReadyError('The engine is not available')
    }
  }
}
