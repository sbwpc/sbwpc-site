// The manage page asks this what to show for a private manage link: the member's first name and their
// automatic payments. No contact details ever leave the server. The link travels in the request body, not the
// address, so it does not end up in logs.
import {json, fail, sameOrigin, readJson, log} from '../lib/http.mjs'
import {dbReady} from '../lib/db.mjs'
import {planByToken, summary} from '../lib/plans.mjs'

export default async (req) => {
  if (!sameOrigin(req)) return fail(403, 'This request did not come from our website.')
  if (!dbReady()) return fail(503, 'This page is not switched on yet. Please email info@sbwpc.org.')
  let body
  try { body = await readJson(req, 2000) } catch { return fail(400, 'We could not read the request.') }
  try {
    const plan = await planByToken(body.token)
    if (!plan) return fail(404, 'That link is not valid. Enter your email below and we will send you a new one.')
    return json({ok: true, ...(await summary(plan))})
  } catch (err) {
    log('plan.view_failed', {message: err.message})
    return fail(502, 'We could not load your details just now. Please try again in a minute.')
  }
}

export const config = {path: '/api/plan/view', method: 'POST', rateLimit: {windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain']}}
