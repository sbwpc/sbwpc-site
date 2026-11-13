// PayPal calls this address when something happens after checkout: a yearly or monthly charge goes through,
// a plan is cancelled, a charge fails, or a payment is refunded. Every message is verified with PayPal first.
import {json, fail, log} from '../lib/http.mjs'
import {db, dbReady, must, getCheckout, recordPayment} from '../lib/db.mjs'
import {verifyWebhook, paypalEnv} from '../lib/paypal.mjs'
import {completeCheckout, SANDBOX_NOTE} from '../lib/finish.mjs'


const cents = (value) => Math.round(Number(value) * 100)
const one = async (query) => (await must(query.limit(1)))[0] || null

async function recurringPayment(sale) {
  const subId = sale.billing_agreement_id
  const amountCents = cents(sale.amount?.total ?? sale.amount?.value)
  if (!subId || !sale.id || !amountCents) return 'ignored'
  if (await one(db().from('payments').select('id').eq('paypal_capture_id', sale.id))) return 'already recorded'
  const plan = await one(db().from('recurring_plans').select('*').eq('paypal_subscription_id', subId))
  if (!plan) {
    // First charge of a new plan, and the visitor's browser never told us about it
    const checkout = await one(db().from('checkouts').select('*').eq('paypal_subscription_id', subId))
    if (!checkout) return 'unknown subscription'
    await completeCheckout(checkout, {captureId: sale.id, subscriptionId: subId, method: 'paypal', amountCents})
    return 'first payment recorded'
  }
  const p = {kind: plan.kind, person_id: plan.person_id, amount_cents: amountCents, method: 'paypal', source: 'web', paypal_capture_id: sale.id, subscription_id: subId, frequency: plan.frequency, note: paypalEnv() === 'live' ? null : SANDBOX_NOTE}
  if (plan.kind === 'dues') {
    const m = await one(db().from('memberships').select('level').eq('person_id', plan.person_id).neq('state', 'cancelled').order('expires_on', {ascending: false}))
    if (!m) return 'no membership for plan'
    p.level = m.level
  }
  await recordPayment(p)
  return 'renewal recorded'
}

async function planStatus(subId, status) {
  if (!subId) return 'ignored'
  const patch = {status}
  if (status === 'cancelled') patch.cancelled_on = new Date().toISOString().slice(0, 10)
  const rows = await must(db().from('recurring_plans').update(patch).eq('paypal_subscription_id', subId).select('id'))
  if (rows[0] && status !== 'failed') await must(db().from('memberships').update({auto_renew: false}).eq('recurring_plan_id', rows[0].id))
  return rows[0] ? 'plan ' + status : 'unknown subscription'
}

async function refunded(captureId) {
  if (!captureId) return 'ignored'
  const rows = await must(db().from('payments').update({status: 'refunded'}).eq('paypal_capture_id', captureId).select('id'))
  return rows[0] ? 'payment marked refunded' : 'unknown payment'
}

export default async (req) => {
  if (!dbReady()) return fail(503, 'not configured')
  const raw = await req.text()
  if (raw.length > 200000) return fail(413, 'too large')
  let event
  try { event = JSON.parse(raw) } catch { return fail(400, 'not json') }
  let genuine = false
  try { genuine = await verifyWebhook(req, raw) } catch (err) { log('webhook.verify_error', {message: err.message}) }
  if (!genuine) {
    log('webhook.rejected', {type: event?.event_type || ''})
    return fail(401, 'signature not verified')
  }

  const r = event.resource || {}
  let outcome = 'ignored'
  try {
    switch (event.event_type) {
      case 'PAYMENT.SALE.COMPLETED':
        outcome = await recurringPayment(r)
        break
      case 'PAYMENT.CAPTURE.COMPLETED': {
        // Safety net for a one-time payment whose browser closed before we could record it
        const checkout = /^[0-9a-f-]{36}$/i.test(r.custom_id || '') ? await getCheckout(r.custom_id) : null
        if (checkout && checkout.mode === 'once' && checkout.status === 'pending' && cents(r.amount?.value) === checkout.amount_cents) {
          await completeCheckout(checkout, {captureId: r.id, orderId: checkout.paypal_order_id, method: 'paypal', amountCents: checkout.amount_cents})
          outcome = 'one-time payment recorded'
        }
        break
      }
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        outcome = await planStatus(r.id, 'cancelled')
        break
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        outcome = await planStatus(r.id, 'paused')
        break
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        outcome = await planStatus(r.id, 'failed')
        break
      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.SALE.REVERSED':
        outcome = await refunded(r.sale_id)
        break
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        const up = (r.links || []).find((l) => l.rel === 'up')
        outcome = await refunded(up ? up.href.split('/').pop() : r.supplementary_data?.related_ids?.capture_id)
        break
      }
    }
  } catch (err) {
    // A non-200 answer makes PayPal send the message again later
    log('webhook.failed', {type: event.event_type, id: event.id, message: err.message})
    return fail(500, 'could not process')
  }
  log('webhook.done', {type: event.event_type, id: event.id, outcome})
  return json({ok: true, outcome})
}

export const config = {path: '/api/paypal/webhook', method: 'POST'}
