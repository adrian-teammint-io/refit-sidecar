// Native messaging host: a relay. Chrome starts it (through the refit-sidecar-host wrapper that install.mjs writes) when
// the worker calls connectNative. It runs nothing itself: frames from Chrome go to the terminal server (server.mjs)
// over a unix socket, and frames from the server come back unchanged. Both sides use the same length-prefixed JSON.
// It also tells the worker whether the server is up, live: {id: 'status', server: 'up' | 'down'}.
// stdout is the protocol channel: never console.log here.
import { createConnection } from 'node:net'
import { SOCK, decoder, encode } from './protocol.mjs'

const RETRY_MS = 1000 // how often to look for the server while it's down

const toChrome = msg => process.stdout.write(encode(msg))
let sock // connected socket, or undefined while the server is down
let timer

function connect() {
  clearTimeout(timer)
  const s = createConnection(SOCK)
  s.on('connect', () => { sock = s; toChrome({ id: 'status', server: 'up' }) })
  s.on('data', decoder(toChrome)) // re-framed per message, so one Chrome frame never mixes two replies
  s.on('error', () => {})
  s.on('close', () => {
    if (sock === s) { sock = undefined; toChrome({ id: 'status', server: 'down' }) }
    timer = setTimeout(connect, RETRY_MS)
  })
}

process.stdin.on('data', decoder(msg => {
  if (sock) return sock.write(encode(msg))
  if (msg?.type === 'hello') return toChrome({ id: 'status', server: 'down' })
  toChrome({ id: msg?.id, error: 'Server not running. Start it with `pnpm server` in a terminal.' })
}))
// Chrome closed the port: the server sees the socket close and stops anything this relay started.
process.stdin.on('end', () => process.exit(0))
toChrome({ id: 'status', server: 'down' })
connect()
