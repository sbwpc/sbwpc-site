// Gives the Sanity Studio a signed, short-lived address for the draft preview of one page.
// The Studio sends the person's own Sanity session token. We ask Sanity who it belongs to and check that
// person is a member of the SBWPC Sanity project, then return the preview address. The token is never
// stored or logged. Without this check, anyone could read unpublished drafts.
import {json, fail, readJson, log, env} from '../lib/http.mjs'
import {makeKey} from '../../src/lib/preview-link.js'

const API = '2021-06-07'
const SITE = 'https://sbwpc.org'
const base = () => env('SANITY_API_BASE') || 'https://api.sanity.io'
const projectId = () => env('SANITY_PROJECT_ID') || 'coo0nu6y'
const ALLOWED = new Set(['https://sbwpc.sanity.studio', 'http://localhost:3333'])

const cors = (origin) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '600',
  vary: 'origin',
})
const reply = (res, origin) => {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(cors(origin))) headers.set(k, v)
  return new Response(res.body, {status: res.status, headers})
}

async function sanity(path, token) {
  return fetch(`${base()}/v${API}${path}`, {headers: {authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(8000)})
}

export default async (req) => {
  const origin = req.headers.get('origin') || ''
  if (!ALLOWED.has(origin)) return fail(403, 'This request did not come from the Sanity Studio.')
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(origin)})
  let body
  try { body = await readJson(req, 4000) } catch { return reply(fail(400, 'We could not read the request.'), origin) }
  const token = String(body.token || '').trim()
  const path = String(body.path || '').trim().replace(/^\/+|\/+$/g, '')
  if (token.length < 20 || /\s/.test(token)) return reply(fail(401, 'Your Studio sign-in is out of date. Sign out and back in.'), origin)
  if (!/^[a-z0-9][a-z0-9/_-]{0,120}$/i.test(path) && path !== '') return reply(fail(400, 'That page cannot be previewed.'), origin)
  try {
    const me = await sanity('/users/me', token)
    if (!me.ok) { log('preview_link.denied', {why: 'sanity_session'}); return reply(fail(401, 'Your Studio sign-in is out of date. Sign out and back in.'), origin) }
    const proj = await sanity(`/projects/${encodeURIComponent(projectId())}`, token)
    if (!proj.ok) { log('preview_link.denied', {why: 'not_project_member'}); return reply(fail(403, 'This Sanity account cannot preview the site.'), origin) }
    const pk = makeKey()
    if (!pk || !env('SANITY_READ_TOKEN')) return reply(fail(503, 'Preview is not switched on yet.'), origin)
    return reply(json({ok: true, url: `${SITE}/preview/${path ? path + '/' : ''}?pk=${pk}`}), origin)
  } catch (err) {
    log('preview_link.failed', {message: err.message})
    return reply(fail(502, 'We could not open the preview just now. Try again in a minute.'), origin)
  }
}

export const config = {path: '/api/preview/link', method: ['POST', 'OPTIONS'], rateLimit: {windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain']}}
