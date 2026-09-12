/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * Types every translation key from the Italian locale, which is the reference
 * language. A key that is missing from it.json, or a typo at a call site, is a
 * compile error rather than a string rendered raw in the interface.
 */

import type { defaultNS, resources } from './index.ts'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['it']
  }
}
