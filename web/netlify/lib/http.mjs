// Small helpers shared by the checkout functions.
export const env = (name) => {
  const v = globalThis.Netlify?.env?.get ? globalThis.Netlify.env.get(name) : process.env[name]
  return v == null ? '' : String(v).trim()
}
const HEADERS = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex'}
export const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: HEADERS})
export const fail = (status, message, extra = {}) => json({ok: false, message, ...extra}, status)

// Only our own pages may post to the checkout. Stops other websites from driving it in a visitor's browser.
export function sameOrigin(req) {
  const origin = req.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}
export async function readJson(req, maxBytes = 20000) {
  const text = await req.text()
  if (text.length > maxBytes) throw new Error('too large')
  return JSON.parse(text)
}
// Log without personal details: event name and ids only
export const log = (event, data = {}) => console.log(JSON.stringify({event, ...data}))
