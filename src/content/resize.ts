// Drag (or arrow-key) the drawer's left edge to change its width. Live while dragging; saved to settings on release.
import { useEffect, useRef, useState } from 'react'

export const MIN_WIDTH = 360
export const MAX_WIDTH = 1200
export const DEFAULT_WIDTH = 440
const STEP = 32 // per arrow key press

// The drawer is docked 12px from the right edge, so its width is the distance from the pointer to that edge.
export const clampWidth = (w: number, viewport: number) => Math.round(Math.max(MIN_WIDTH, Math.min(w, MAX_WIDTH, viewport - 24)))

export function useResize(saved: number, save: (w: number) => void) {
  const [width, setWidth] = useState(saved)
  const [active, setActive] = useState(false)
  const latest = useRef(width)
  latest.current = width
  useEffect(() => { if (!active) setWidth(saved) }, [saved]) // follow changes from another tab

  const commit = (w: number) => { setWidth(w); if (w !== saved) save(w) }
  return {
    width,
    active,
    handle: {
      role: 'separator',
      'aria-orientation': 'vertical' as const,
      'aria-label': 'Resize drawer',
      'aria-valuenow': width,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': MAX_WIDTH,
      title: 'Drag to resize · double-click to reset',
      tabIndex: 0,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true)
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (active) setWidth(clampWidth(window.innerWidth - 12 - e.clientX, window.innerWidth))
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        if (!active) return
        e.currentTarget.releasePointerCapture(e.pointerId)
        setActive(false)
        commit(latest.current)
      },
      onDoubleClick: () => commit(DEFAULT_WIDTH),
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        const d = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0 // left edge: left = wider
        if (!d) return
        e.preventDefault()
        commit(clampWidth(width + d, window.innerWidth))
      },
    },
  }
}
