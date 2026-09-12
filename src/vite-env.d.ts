/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/// <reference types="vite/client" />

/**
 * Build-time engine selection. Changing engine build is a configuration change,
 * never a code change. See src/engine/config.ts and public/_headers.
 */
interface ImportMetaEnv {
  /** Path to the Stockfish worker script, served from public/. */
  readonly VITE_ENGINE_WORKER_URL?: string
  /** UCI `Threads`. Must stay 1 unless the page is cross-origin isolated. */
  readonly VITE_ENGINE_THREADS?: string
  /** UCI `Hash`, in megabytes. */
  readonly VITE_ENGINE_HASH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Build identity, substituted by `define` in vite.config.ts.
 *
 * These say which source a running site was built from, so a deployment that
 * silently failed to happen is visible rather than inferred.
 */
declare const __APP_VERSION__: string
declare const __BUILD_COMMIT__: string
declare const __BUILD_DATE__: string
