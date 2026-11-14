// "Email me my link" on the manage page. If the address has an automatic payment, its private link is emailed
// to that address. The answer on the page is the same either way, so the form cannot be used to find out
// who gives to SBWPC.
import {json, fail, sameOrigin, readJson, log} from '../lib/http.mjs'
import {db, dbReady, must} from '../lib/db.mjs'
import {mailMode} from '../lib/mail.mjs'
import {openPlansFor} from '../lib/plans.mjs'
import {kick, queue} from '../lib/outbox.mjs'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const SENT = 'If that address has an automatic payment with SBWPC, we just emailed it a link. It should arrive within a few minutes.'
// The same address cannot be sent another link for this long
const QUIET_MINUTES = 15

export default async (req, context) => {
  if (!sameOrigin(req)) return fail(403, 'This request did not come from our website.')
  if (!dbReady() || mailMode() === 'off') return fail(503, 'We cannot email links yet. Please email info@sbwpc.org and we will help.')
  let body
  try { body = await readJson(req, 2000) } catch { return fail(400, 'We could not read the form.') }
  // Hidden field that people never see or fill in. Automated spam does.
  if (body.website) return json({ok: true, message: SENT})
  const email = String(body.email || '').trim().toLowerCase().slice(0, 160)
  if (!EMAIL.test(email)) return fail(422, 'Enter a valid email address.')
  try {
    const plan = (await openPlansFor(email))[0]
    if (plan) {
      const since = new Date(Date.now() - QUIET_MINUTES * 60000).toISOString()
      const recent = await must(db().from('outbox').select('id').eq('kind', 'plan_link').eq('person_id', plan.person_id).gte('created_at', since).limit(1))
      if (!recent.length) {
        await queue({kind: 'plan_link', person_id: plan.person_id, data: {plan_id: plan.id}})
        kick(context)
      }
    }
  } catch (err) {
    log('plan.link_failed', {message: err.message})
  }
  return json({ok: true, message: SENT})
}

export const config = {path: '/api/plan/link', method: 'POST', rateLimit: {windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain']}}
