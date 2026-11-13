// Step 1 of a payment: check the form, save it, and open a PayPal order or subscription for the exact amount.
// For a check, the form is saved as "waiting for a check" and nothing is charged.
import {env, json, fail, sameOrigin, readJson, log} from '../lib/http.mjs'
import {db, dbReady, must} from '../lib/db.mjs'
import {validate, describe} from '../lib/validate.mjs'
import {paypalEnv, paypalReady, createOrder, createProduct, createPlan, createSubscription} from '../lib/paypal.mjs'
import {receiptFor} from '../lib/finish.mjs'

async function planFor(kind, frequency) {
  const key = 'paypal_plans_' + paypalEnv()
  const rows = await must(db().from('settings').select('value').eq('key', key).limit(1))
  const plans = rows[0]?.value || {}
  const slot = `${kind}_${frequency}`
  if (plans[slot]) return plans[slot]
  if (!plans.product_id) plans.product_id = (await createProduct()).id
  const names = {dues_yearly: 'SBWPC membership, yearly', donation_monthly: 'SBWPC donation, monthly', donation_yearly: 'SBWPC donation, yearly'}
  plans[slot] = (await createPlan(plans.product_id, names[slot], frequency === 'monthly' ? 'MONTH' : 'YEAR')).id
  await must(db().from('settings').upsert({key, value: plans, updated_at: new Date().toISOString()}))
  return plans[slot]
}

export default async (req) => {
  if (!sameOrigin(req)) return fail(403, 'This request did not come from our website.')
  if (!dbReady()) return fail(503, 'The form is not switched on yet. Please email info@sbwpc.org.')
  let body
  try { body = await readJson(req) } catch { return fail(400, 'We could not read the form. Reload the page and try again.') }
  // Hidden field that people never see or fill in. Automated spam does.
  if (body.website) return json({ok: true, mode: 'check', receipt: null})

  const v = validate(body)
  if (!v.ok) return fail(422, 'Some details need another look.', {errors: v.errors})
  if (v.mode !== 'check' && !paypalReady()) return fail(503, 'Online payment is not switched on yet. You can mail a check instead.')

  try {
    const [checkout] = await must(db().from('checkouts').insert({kind: v.kind, mode: v.mode, amount_cents: v.amountCents, payload: v.payload}).select())
    if (v.mode === 'check') {
      log('checkout.check', {checkout: checkout.id, kind: v.kind, cents: v.amountCents})
      return json({ok: true, mode: 'check', checkoutId: checkout.id, receipt: receiptFor(checkout, {method: 'check'})})
    }
    if (v.mode === 'once') {
      const order = await createOrder(checkout.id, v.amountCents, describe(v.kind, v.level, v.frequency))
      await must(db().from('checkouts').update({paypal_order_id: order.id}).eq('id', checkout.id))
      log('checkout.order', {checkout: checkout.id, kind: v.kind, cents: v.amountCents})
      return json({ok: true, mode: 'once', checkoutId: checkout.id, orderId: order.id})
    }
    const planId = await planFor(v.kind, v.frequency)
    const sub = await createSubscription({planId, checkoutId: checkout.id, amountCents: v.amountCents, person: v.payload, siteUrl: env('URL') || new URL(req.url).origin})
    await must(db().from('checkouts').update({paypal_subscription_id: sub.id}).eq('id', checkout.id))
    log('checkout.subscription', {checkout: checkout.id, kind: v.kind, cents: v.amountCents, frequency: v.frequency})
    return json({ok: true, mode: 'subscription', checkoutId: checkout.id, subscriptionId: sub.id})
  } catch (err) {
    log('checkout.create_failed', {message: err.message, issue: err.issue || '', debug: err.debugId || ''})
    return fail(502, 'We could not start the payment. Nothing was charged. Please try again in a minute.')
  }
}

export const config = {path: '/api/checkout/create', method: 'POST', rateLimit: {windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain']}}
