/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Engine build selection.
 *
 * Which Stockfish build runs, and how it is configured, is a matter of build
 * configuration — never of application code. Switching from the single-threaded
 * build to the multi-threaded one means setting the environment variables below
 * and enabling the COOP/COEP headers in public/_headers, nothing more.
 */

export interface EngineConfig {
  /** URL of the Stockfish worker script, served from public/. */
  workerUrl: string
  /**
   * UCI `Threads`. Must stay 1 unless the page is cross-origin isolated and a
   * multi-threaded build is being served; SharedArrayBuffer is required.
   */
  threads: number
  /** UCI `Hash`, in megabytes. */
  hashMb: number
  /** Default number of principal variations. */
  multiPV: number
  /** UCI `UCI_ShowWDL`: makes `info` lines carry win/draw/loss in permille. */
  showWdl: boolean
  /** Depth used by `analyse()` when neither `depth` nor `movetime` is given. */
  defaultDepth: number
  /** How long to wait for the worker to answer `uci` before giving up. */
  bootTimeoutMs: number
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  workerUrl: import.meta.env.VITE_ENGINE_WORKER_URL ?? '/engine/stockfish-18-lite-single.js',
  threads: readInt(import.meta.env.VITE_ENGINE_THREADS, 1),
  hashMb: readInt(import.meta.env.VITE_ENGINE_HASH, 16),
  multiPV: 1,
  showWdl: true,
  defaultDepth: 18,
  // The lite WASM payload is ~7 MB: a cold, throttled first load is slow.
  bootTimeoutMs: 60_000,
}

export function resolveEngineConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return { ...DEFAULT_ENGINE_CONFIG, ...overrides }
}
