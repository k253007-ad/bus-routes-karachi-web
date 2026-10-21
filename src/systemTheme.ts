export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  const media = matchMedia('(prefers-color-scheme: dark)')
  const update = (event: MediaQueryListEvent) => onChange(event.matches)
  media.addEventListener('change', update)
  onChange(media.matches)
  return () => media.removeEventListener('change', update)
}
