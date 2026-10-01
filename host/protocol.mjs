// Pure helpers for the native host: Chrome's length-prefixed JSON framing, output chunking and argv building.
// No I/O here so host.test.mjs can run it with plain node.

// Chrome caps host -> extension messages at 1 MB of UTF-8 JSON. 64K chars stays far under it even if every
// char is JSON-escaped (\u0000 is 6 bytes, 64K * 6 = 384 KB).
export const MAX_CHUNK = 64 * 1024

export function encode(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length) // native byte order; every Mac Chrome runs on is little-endian
  return Buffer.concat([head, body])
}

// Feed raw stdin buffers; calls onMessage for every complete frame.
export function decoder(onMessage) {
  let buf = Buffer.alloc(0)
  return chunk => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0)
      if (buf.length < 4 + len) break
      const body = buf.subarray(4, 4 + len)
      buf = buf.subarray(4 + len)
      onMessage(JSON.parse(body.toString('utf8')))
    }
  }
}

// Splits buffered output into chunks that end on a line break and are at most `max` chars.
// A single line longer than `max` is cut. With `all`, the trailing partial line is flushed too
// (stream ended, or no newline arrived for a while).
export function takeChunks(carry, all, max = MAX_CHUNK) {
  const chunks = []
  let rest = carry
  for (;;) {
    if (rest.length > max) {
      const nl = rest.lastIndexOf('\n', max - 1)
      const cut = nl >= 0 ? nl + 1 : max
      chunks.push(rest.slice(0, cut))
      rest = rest.slice(cut)
      continue
    }
    const nl = rest.lastIndexOf('\n')
    if (all ? rest : nl >= 0) {
      const cut = all ? rest.length : nl + 1
      chunks.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    return { chunks, carry: rest }
  }
}

// Builds argv from an allowlisted command spec. Params must be declared and match their pattern in full.
// A placeholder is a whole arg ("{name}"), never spliced into a string, and there is no shell anywhere.
export function buildArgv(spec, args) {
  const params = spec.params ?? {}
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('args must be an object')
  for (const k of Object.keys(args)) if (!Object.hasOwn(params, k)) throw new Error(`Unknown param: ${k}`)
  const values = {}
  for (const [k, p] of Object.entries(params)) {
    const v = Object.hasOwn(args, k) ? args[k] : p.default
    if (typeof v !== 'string') throw new Error(`Missing param: ${k}`)
    if (!new RegExp(`^(?:${p.pattern})$`).test(v)) throw new Error(`Invalid ${k}: ${JSON.stringify(v).slice(0, 60)}`)
    values[k] = v
  }
  return spec.args.map(a => {
    const m = /^\{(\w+)\}$/.exec(a)
    return m && Object.hasOwn(values, m[1]) ? values[m[1]] : a
  })
}
