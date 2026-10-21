const idPattern = /^[A-Za-z0-9_-]{1,80}$/

export function pathId(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value)
    return idPattern.test(decoded) ? decoded : undefined
  } catch { return undefined }
}

export function savedFavorites(value: unknown): { routes: string[]; stops: string[] } {
  const empty = { routes: [], stops: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const candidate = value as Record<string, unknown>
  const valid = (list: unknown): list is string[] => Array.isArray(list) && list.length <= 2000
    && list.every(id => typeof id === 'string' && idPattern.test(id))
  if (!valid(candidate.routes) || !valid(candidate.stops)) return empty
  return { routes: [...new Set(candidate.routes)], stops: [...new Set(candidate.stops)] }
}
