const controls = '.wide-button,.outline-button,.detail-actions a,.detail-actions button,.bus-view-switch button'

export function installPressFeedback(root: HTMLElement): () => void {
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  const running = new Map<HTMLElement, { animation: Animation; remove: () => void }>()
  const clear = () => {
    for (const { animation, remove } of running.values()) { animation.cancel(); remove() }
    running.clear()
  }
  const onPreference = () => { if (media.matches) clear() }
  const press = (event: MouseEvent) => {
    if (media.matches || !(event.target instanceof Element)) return
    const control = event.target.closest<HTMLElement>(controls)
    if (!control || !root.contains(control) || control.matches(':disabled,[aria-disabled="true"]')) return
    const previous = running.get(control)
    if (previous) { previous.animation.cancel(); previous.remove(); running.delete(control) }
    const rect = control.getBoundingClientRect()
    const ripple = document.createElement('span')
    if (typeof ripple.animate !== 'function') return
    ripple.className = 'press-ripple'
    ripple.setAttribute('aria-hidden', 'true')
    ripple.style.left = `${event.detail ? event.clientX - rect.left : rect.width / 2}px`
    ripple.style.top = `${event.detail ? event.clientY - rect.top : rect.height / 2}px`
    control.append(ripple)
    const scale = Math.hypot(rect.width, rect.height) / 12
    const animation = ripple.animate([
      { transform: 'scale(.1)', opacity: .2 },
      { transform: `scale(${scale})`, opacity: 0 },
    ], { duration: 460, easing: 'cubic-bezier(.2,.75,.2,1)' })
    const remove = () => ripple.remove()
    running.set(control, { animation, remove })
    const finish = () => {
      remove()
      if (running.get(control)?.animation === animation) running.delete(control)
    }
    void animation.finished.then(finish, finish)
    // A detached control can live until its brief animation finishes. Bound the
    // total as well, so rapid navigation cannot accumulate retained elements.
    if (running.size > 12) {
      const [oldControl, old] = running.entries().next().value!
      old.animation.cancel(); old.remove(); running.delete(oldControl)
    }
  }
  root.addEventListener('click', press, { capture: true })
  media.addEventListener('change', onPreference)
  return () => {
    root.removeEventListener('click', press, { capture: true })
    media.removeEventListener('change', onPreference)
    clear()
  }
}
