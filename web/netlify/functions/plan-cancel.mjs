// A member pressed "stop" on the manage page. PayPal is told to stop charging, and only when PayPal agrees is
// the plan marked cancelled. A membership that was paid for stays active until it expires.
import {json, fail, sameOrigin, readJson, log} from '../lib/http.mjs'
import {db, dbReady, must} from '../lib/db.mjs'
import {paypalReady} from '../lib/paypal.mjs'
import {planByToken, stopPlan, summary, UUID} from '../lib/plans.mjs'
import {kick} from '../lib/outbox.mjs'

export default async (req, context) => {
  if (!sameOrigin(req)) return fail(403, 'This request did not come from our website.')
  if (!dbReady() || !paypalReady()) return fail(503, 'This page is not switched on yet. Please email info@sbwpc.org.')
  let body
  try { body = await readJson(req, 2000) } catch { return fail(400, 'We could not read the request.') }
  try {
    const mine = await planByToken(body.token)
    if (!mine) return fail(404, 'That link is not valid. Reload the page and ask for a new one.')
    // The link opens every plan that belongs to the same person, and no one else's
    let plan = mine
    if (body.planId && body.planId !== mine.id) {
      plan = UUID.test(body.planId) ? (await must(db().from('recurring_plans').select('*').eq('id', body.planId).eq('person_id', mine.person_id).limit(1)))[0] : null
      if (!plan) return fail(404, 'That plan was not found.')
    }
    let changed
    try {
      changed = await stopPlan(plan)
    } catch (err) {
      log('plan.cancel_failed', {plan: plan.id, message: err.message, issue: err.issue || '', debug: err.debugId || ''})
      if (err.manual) return fail(409, 'This one has to be cancelled by SBWPC. Please email info@sbwpc.org and we will take care of it.')
      return fail(502, 'We could not cancel it just now. Nothing has changed. Please try again in a minute, or email info@sbwpc.org.')
    }
    if (changed) log('plan.cancelled', {plan: plan.id, kind: plan.kind})
    kick(context)
    return json({ok: true, ...(await summary(mine))})
  } catch (err) {
    log('plan.cancel_error', {message: err.message})
    return fail(502, 'Something went wrong on our side. Please reload the page to see whether it was cancelled.')
  }
}

export const config = {path: '/api/plan/cancel', method: 'POST', rateLimit: {windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain']}}
