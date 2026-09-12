/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Reading values out of JSON that came from somebody else's server.
 *
 * The shapes below are documented, not guaranteed: a field can go missing, a
 * number can arrive as a string, a player can be anonymous. These helpers make
 * every read state what it expects and hand back null when it does not get it,
 * so a surprise in one field cannot take the page down.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readRecord(source: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return isRecord(value) ? value : null
}

export function readString(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'string' && value !== '' ? value : null
}

export function readNumber(source: unknown, key: string): number | null {
  if (!isRecord(source)) return null
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function readArray(source: unknown, key: string): unknown[] {
  if (!isRecord(source)) return []
  const value = source[key]
  return Array.isArray(value) ? value : []
}
