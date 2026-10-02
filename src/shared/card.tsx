// Pieces of the card lists (sync requests, connections, fitting rooms) and user rows, shared by the drawer and the
// popup. Styles: src/ui.css (.sync*) and content/styles.css (.avatar, .member-main).
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Icon } from './icons'

// Row i of a list fades in a little after row i-1 (CSS reads --i), capped so long lists don't lag.
export const stagger = (i: number) => ({ '--i': Math.min(i, 12) }) as CSSProperties

// In select mode the whole card toggles, except its own links and buttons.
export const pickOnClick = (selecting: boolean, toggle: () => void) =>
  selecting ? (e: MouseEvent) => { if (!(e.target as Element).closest('a, button')) toggle() } : undefined

// A card's top row: select check, badge, title, then the view's chips, then the open link.
export function CardHead({ badge, title, check, link, children }: {
  badge: ReactNode; title: string; children?: ReactNode
  check?: { on: boolean; label: string; onToggle: () => void }
  link?: { href: string; label: string; title: string; newTab?: boolean }
}) {
  return (
    <div className="sync-head">
      {check && (
        <button className="check" role="checkbox" aria-checked={check.on} aria-label={check.label} onClick={check.onToggle}><Icon d="check" size={12} /></button>
      )}
      <span className="badge">{badge}</span>
      <strong title={title}>{title}</strong>
      {children}
      {link && (
        <a className="icon-btn sync-link" href={link.href} {...(link.newTab ? { target: '_blank', rel: 'noreferrer' } : { target: '_top' })}
          aria-label={link.label} title={link.title}><Icon d="external" size={14} /></a>
      )}
    </div>
  )
}

// Avatar, email and name (or `sub`): the inside of every user row (members, user search hits, picked user).
export function UserLabel({ u, sub }: { u: { email: string; name: string | null }; sub?: ReactNode }) {
  return <>
    <span className="avatar" aria-hidden>{(u.name || u.email)[0].toUpperCase()}</span>
    <span className="member-main"><strong title={u.email}>{u.email}</strong><span className="muted">{sub ?? u.name ?? 'No name'}</span></span>
  </>
}
