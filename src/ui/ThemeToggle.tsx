import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from './icons'

const THEMES = ['concrete', 'concrete-dark'] as const
type Theme = (typeof THEMES)[number]
const LABEL: Record<Theme, string> = { concrete: 'Concrete (grey)', 'concrete-dark': 'Concrete Dark (blue)' }

const read = (): Theme => THEMES.find((t) => t === document.documentElement.dataset.theme) ?? 'concrete'

/** Cycles Concrete (flat grey) → Concrete Dark (blue-slate); the choice is remembered. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('board.theme', theme)
    } catch {
      /* storage unavailable: the choice just won't be remembered */
    }
  }, [theme])
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  return (
    <button className="icon theme-toggle" title={`Switch to ${LABEL[next]}`} onClick={() => setTheme(next)}>
      {theme === 'concrete-dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
