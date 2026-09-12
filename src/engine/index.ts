/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

export { Engine } from './Engine.ts'
export { DEFAULT_ENGINE_CONFIG, resolveEngineConfig, type EngineConfig } from './config.ts'
export {
  EngineDisposedError,
  EngineError,
  EngineLoadError,
  EngineNotReadyError,
  EngineTimeoutError,
} from './errors.ts'
export type {
  AnalyseRequest,
  AnalysisLine,
  AnalysisResult,
  AnalysisSnapshot,
  EngineState,
  Wdl,
} from './types.ts'
