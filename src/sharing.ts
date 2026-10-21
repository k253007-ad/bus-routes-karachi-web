export async function sharePage(title: string) {
  const page = new URL(location.href)
  if (!['https:', 'http:'].includes(page.protocol) || page.username || page.password) return
  const target = document.documentElement.dataset.nativeApp === 'true'
    ? new URL('https://bus-khi-routes.vercel.app') : new URL(page.href)
  target.pathname = page.pathname
  target.search = page.search
  target.hash = page.hash
  const url = target.href
  if (navigator.share) {
    try { await navigator.share({ title, url }); return } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return
    }
  }
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(url); alert('Link copied to clipboard.') }
    catch { alert('Could not copy the link. Please try sharing again.') }
  } else alert('Sharing and clipboard are unavailable. Please open this page in your browser to share it.')
}
