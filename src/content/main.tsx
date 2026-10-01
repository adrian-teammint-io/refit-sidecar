import { createRoot } from 'react-dom/client'
import geist from '@fontsource-variable/geist/wght.css?inline'
import mono from '@fontsource-variable/jetbrains-mono/wght.css?inline'
import css from './styles.css?inline'
import { App } from './App'

// @font-face is ignored inside shadow roots, so fonts go on the page; everything else stays isolated in the shadow DOM.
const fonts = document.createElement('style')
fonts.textContent = geist + mono
document.head.append(fonts)

const host = document.createElement('refit-sidecar')
host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; right: 0;'
document.documentElement.append(host)
// Keep keystrokes/pastes typed in the drawer away from the app's document-level shortcuts.
// React's listeners sit on the mount node inside the shadow root, so they still run first.
for (const type of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'paste']) host.addEventListener(type, e => e.stopPropagation())
// closed: the page is untrusted and has no reason to reach into the drawer
const shadow = host.attachShadow({ mode: 'closed' })
const style = document.createElement('style')
style.textContent = css
const mount = document.createElement('div')
shadow.append(style, mount)
createRoot(mount).render(<App />)
