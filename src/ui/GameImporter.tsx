/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useId, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { GAME_SOURCES } from '../import/index.ts'
import type { GameSource, ImportedGame } from '../import/index.ts'
import { useGameImport } from './useGameImport.ts'

/** Site names are proper nouns; they are not translated. */
const SITE_NAMES: Record<GameSource, string> = {
  lichess: 'Lichess',
  chesscom: 'Chess.com',
}

export interface GameImporterProps {
  onPick: (game: ImportedGame) => void
  disabled?: boolean
}

function GameRow({
  game,
  onPick,
  disabled,
  formatDate,
}: {
  game: ImportedGame
  onPick: (game: ImportedGame) => void
  disabled: boolean
  formatDate: (at: number | null) => string
}) {
  const { t } = useTranslation()
  const unknown = t('import.unknownPlayer')

  const rating = (value: number | null) => (value === null ? '' : ` (${String(value)})`)

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800 px-3 py-2 last:border-b-0">
      <span className="text-sm">
        {game.white ?? unknown}
        <span className="text-slate-500">{rating(game.whiteRating)}</span>{' '}
        <span className="text-slate-500">{t('import.vs')}</span> {game.black ?? unknown}
        <span className="text-slate-500">{rating(game.blackRating)}</span>
      </span>

      {game.result !== null && (
        <span className="font-mono text-xs text-slate-400">{game.result}</span>
      )}
      {game.speed !== null && <span className="text-xs text-slate-500">{game.speed}</span>}
      <span className="text-xs text-slate-500">{formatDate(game.playedAt)}</span>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(game)}
        className="ml-auto rounded-md border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800 disabled:opacity-40"
      >
        {t('import.pick')}
      </button>
    </li>
  )
}

/**
 * Fetches a player's recent games from Lichess or Chess.com and lets one be
 * picked for review.
 *
 * Both sites are read directly from the browser. If one of them refuses
 * cross-origin requests the fetch simply fails, and the message for
 * `unreachable` says so, because the page cannot be told which it was.
 */
export function GameImporter({ onPick, disabled = false }: GameImporterProps) {
  const { t, i18n } = useTranslation()
  const { status, games, error, search } = useGameImport()

  const [source, setSource] = useState<GameSource>('lichess')
  const [username, setUsername] = useState('')

  const sourceFieldId = useId()
  const usernameFieldId = useId()

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' }),
    [i18n.resolvedLanguage],
  )
  const formatDate = (at: number | null) =>
    at === null ? t('import.noDate') : dateFormatter.format(new Date(at))

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    search(source, username)
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={sourceFieldId}>
            {t('import.sourceLabel')}
          </label>
          <select
            id={sourceFieldId}
            value={source}
            onChange={(event) => setSource(event.target.value as GameSource)}
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
          >
            {GAME_SOURCES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {SITE_NAMES[candidate]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-300" htmlFor={usernameFieldId}>
            {t('import.usernameLabel')}
          </label>
          <input
            id={usernameFieldId}
            value={username}
            autoComplete="username"
            spellCheck={false}
            placeholder={t('import.usernamePlaceholder')}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={username.trim() === '' || status === 'searching'}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {status === 'searching' ? t('import.searching') : t('import.search')}
        </button>
      </form>

      {status === 'error' && error !== null && (
        <p role="alert" className="rounded-md border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
          {t(`import.error.${error}`, { site: SITE_NAMES[source] })}
        </p>
      )}

      {status === 'done' && games.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-slate-300">
            {t('import.results', { username: username.trim() })}
          </h3>
          <ul className="rounded-md border border-slate-800">
            {games.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                onPick={onPick}
                disabled={disabled}
                formatDate={formatDate}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
