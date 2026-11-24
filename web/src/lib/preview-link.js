// Signed, short-lived links for the draft preview. A link is "<expires>.<signature>" in the ?pk= part of the address.
// The Studio asks for one (netlify/functions/preview-link.mjs, after Sanity confirms who is asking) and the
// middleware checks it on every /preview/ request. No cookies, so it also works inside the Studio's frame
// in browsers that block third-party cookies.
import crypto from 'node:crypto'

export const LIFETIME_SECONDS = 8 * 3600
const key = () => process.env.PREVIEW_SIGNING_KEY || ''
const sign = (exp) => crypto.createHmac('sha256', key()).update(`preview:${exp}`).digest('hex')

export function makeKey(now = Date.now()) {
  if (key().length < 24) return ''
  const exp = Math.floor(now / 1000) + LIFETIME_SECONDS
  return `${exp}.${sign(exp)}`
}

export function checkKey(value, now = Date.now()) {
  if (key().length < 24 || typeof value !== 'string') return false
  const [exp, sig] = value.split('.')
  if (!/^\d{9,12}$/.test(exp || '') || !/^[0-9a-f]{64}$/.test(sig || '')) return false
  if (Number(exp) < Math.floor(now / 1000)) return false
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(sign(exp), 'hex'))
}

// Keep the key on every page link inside a preview so the editor can click around.
const SKIP = /^\/(_astro|media|fonts|brand|studio-help|admin|api|\.netlify|preview)(\/|$)|\.[a-z0-9]{2,5}$/i
export function carryKey(html, value) {
  return html.replace(/<a\b[^>]*>/gi, (tag) =>
    tag.replace(/\shref="(\/[^"]*)"/i, (m, url) => {
      if (url.startsWith('//')) return m
      const [beforeHash, hash = ''] = url.split(/(?=#)/)
      const [pathPart, query = ''] = beforeHash.split('?')
      if (SKIP.test(pathPart)) return m
      const target = pathPart === '/' ? '/preview/' : `/preview${pathPart}`
      return ` href="${target}?${query ? query + '&' : ''}pk=${value}${hash}"`
    }),
  )
}
