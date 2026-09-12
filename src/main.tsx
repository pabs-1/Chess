/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App.tsx'
import './index.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Root container #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
