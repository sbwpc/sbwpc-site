// Only touches /preview/ requests. Everything else on the site is served as built.
import {defineMiddleware} from 'astro:middleware'
import {previewStore} from './lib/data.js'
import {checkKey, carryKey} from './lib/preview-link.js'

const FRAMES = "frame-ancestors 'self' https://sbwpc.sanity.studio https://*.sanity.studio http://localhost:3333"

export const onRequest = defineMiddleware(async (context, next) => {
  const {pathname, searchParams} = context.url
  if (pathname !== '/preview' && !pathname.startsWith('/preview/')) return next()
  const pk = searchParams.get('pk') || ''
  if (!checkKey(pk)) {
    return new Response('This preview link has expired. Open the Preview tab in the Sanity Studio again.', {
      status: 403,
      headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow'},
    })
  }
  // Read the whole page inside draft mode, so nothing renders after the draft setting is gone.
  const [res, text] = await previewStore.run(true, async () => {
    const r = await next()
    const t = (r.headers.get('content-type') || '').includes('text/html') ? await r.text() : null
    return [r, t]
  })
  const headers = new Headers(res.headers)
  headers.set('cache-control', 'no-store')
  headers.set('x-robots-tag', 'noindex, nofollow')
  headers.set('content-security-policy', FRAMES)
  headers.set('referrer-policy', 'no-referrer')
  if (text === null) return new Response(res.body, {status: res.status, headers})
  headers.delete('content-length')
  return new Response(carryKey(text, pk), {status: res.status, headers})
})
