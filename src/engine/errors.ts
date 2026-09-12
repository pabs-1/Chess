/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/** Base class for every failure originating in the engine layer. */
export class EngineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EngineError'
  }
}

/** The Web Worker could not be created, or crashed while loading. */
export class EngineLoadError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EngineLoadError'
  }
}

/** A command was issued before `init()` completed, or after a fatal error. */
export class EngineNotReadyError extends EngineError {
  constructor(message: string) {
    super(message)
    this.name = 'EngineNotReadyError'
  }
}

/** The engine did not answer within the expected time. */
export class EngineTimeoutError extends EngineError {
  constructor(message: string) {
    super(message)
    this.name = 'EngineTimeoutError'
  }
}

/** `dispose()` was called while work was pending. */
export class EngineDisposedError extends EngineError {
  constructor(message = 'The engine was disposed') {
    super(message)
    this.name = 'EngineDisposedError'
  }
}
