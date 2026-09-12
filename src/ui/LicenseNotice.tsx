/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useTranslation } from 'react-i18next'

/**
 * The GPL requires users of the running program to be told about their rights
 * and to be able to reach the corresponding source, so this stays visible in
 * the interface rather than buried in a menu.
 */
const SOURCE_URL = 'https://github.com/pabs-1/chess'
const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html'

export function LicenseNotice() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-400">
      <p>
        {t('license.notice')}{' '}
        <a className="underline hover:text-slate-200" href={LICENSE_URL} rel="noreferrer" target="_blank">
          GNU GPL v3
        </a>
        {' · '}
        <a className="underline hover:text-slate-200" href={SOURCE_URL} rel="noreferrer" target="_blank">
          {t('license.source')}
        </a>
      </p>
      <p className="mt-1">{t('license.engine')}</p>
    </footer>
  )
}
