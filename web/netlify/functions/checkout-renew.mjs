// The renew link in a reminder email carries a private token. This returns just enough for the Join form to
// greet the member and preselect their level: name, email and level. Nothing else about them.
import {json, fail} from '../lib/http.mjs'
import {db, dbReady, must} from '../lib/db.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async (req) => {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!dbReady() || !UUID.test(token)) return fail(404, 'That renewal link is not valid.')
  try {
    const found = await must(db().rpc('renewal_prefill', {p_token: token}))
    if (!found) return fail(404, 'That renewal link is no longer valid. You can still renew below.')
    return json({ok: true, member: {first_name: found.first_name, last_name: found.last_name, email: found.email, level: found.level}})
  } catch {
    return fail(502, 'We could not look up that link. You can still renew below.')
  }
}

export const config = {path: '/api/checkout/renew', method: 'GET', rateLimit: {windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain']}}
