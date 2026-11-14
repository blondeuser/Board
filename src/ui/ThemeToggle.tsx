import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from './icons'

type Theme = 'mocha' | 'latte'

const read = (): Theme => (document.documentElement.dataset.theme === 'latte' ? 'latte' : 'mocha')

/** Switches between Catppuccin Mocha (dark) and Latte (light); the choice is remembered. */
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
  const next = theme === 'mocha' ? 'latte' : 'mocha'
  return (
    <button
      className="icon theme-toggle"
      title={next === 'latte' ? 'Switch to Latte (light)' : 'Switch to Mocha (dark)'}
      onClick={() => setTheme(next)}
    >
      {theme === 'mocha' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
