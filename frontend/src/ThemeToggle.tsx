import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  const savedTheme = window.localStorage.getItem('relay-theme')
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    // On garde le choix de l'utilisateur pour le retrouver à sa prochaine visite.
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('relay-theme', theme)
  }, [theme])

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Activer le mode ${theme === 'light' ? 'sombre' : 'clair'}`}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    >
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
      {theme === 'light' ? 'Mode sombre' : 'Mode clair'}
    </button>
  )
}
