// Step 2 of a payment: the visitor approved it in PayPal or Apple Pay. Collect it, confirm the amount with
// PayPal, and only then record the person, membership and payment.
import {json, fail, sameOrigin, readJson, log} from '../lib/http.mjs'
import {dbReady, getCheckout} from '../lib/db.mjs'
import {captureOrder, getOrder, getSubscription, firstPayment} from '../lib/paypal.mjs'
import {completeCheckout, receiptFor} from '../lib/finish.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const cents = (value) => Math.round(Number(value) * 100)
const methodOf = (order) => {
  const src = order?.payment_source || {}
  return src.apple_pay ? 'apple_pay' : src.card ? 'card' : 'paypal'
}

export default async (req) => {
  if (!sameOrigin(req)) return fail(403, 'This request did not come from our website.')
  if (!dbReady()) return fail(503, 'The form is not switched on yet.')
  let body
  try { body = await readJson(req, 2000) } catch { return fail(400, 'We could not read the request.') }
  if (!UUID.test(body.checkoutId || '')) return fail(400, 'That payment was not found.')

  try {
    const checkout = await getCheckout(body.checkoutId)
    if (!checkout || checkout.mode === 'check') return fail(404, 'That payment was not found.')
    if (checkout.status === 'completed') return json({ok: true, receipt: receiptFor(checkout, checkout.payload.receipt || {})})

    if (checkout.mode === 'once') {
      if (!checkout.paypal_order_id || checkout.paypal_order_id !== body.orderId) return fail(400, 'That payment does not match this form.')
      let order
      try {
        order = await captureOrder(checkout.paypal_order_id, checkout.id)
      } catch (err) {
        if (err.issue === 'INSTRUMENT_DECLINED') return fail(402, 'That card or account was declined. Nothing was charged. Please try another way to pay.', {retry: true})
        if (err.issue !== 'ORDER_ALREADY_CAPTURED') throw err
        order = await getOrder(checkout.paypal_order_id)
      }
      const unit = order?.purchase_units?.[0]
      const capture = unit?.payments?.captures?.[0]
      if (!capture || order.status !== 'COMPLETED' || capture.status !== 'COMPLETED') {
        log('checkout.capture_pending', {checkout: checkout.id, status: capture?.status || order?.status || ''})
        return fail(202, 'PayPal is still reviewing this payment. We will record it as soon as PayPal confirms it. You do not need to pay again.', {pending: true})
      }
      // The amount PayPal collected must be exactly what this checkout was for
      if (capture.amount?.currency_code !== 'USD' || cents(capture.amount.value) !== checkout.amount_cents || (unit.custom_id && unit.custom_id !== checkout.id)) {
        log('checkout.amount_mismatch', {checkout: checkout.id, capture: capture.id})
        return fail(409, 'The payment amount did not match. Please email info@sbwpc.org so we can sort it out.')
      }
      const receipt = await completeCheckout(checkout, {captureId: capture.id, orderId: order.id, method: methodOf(order), amountCents: checkout.amount_cents})
      log('checkout.paid', {checkout: checkout.id, kind: checkout.kind, cents: checkout.amount_cents, method: receipt.method})
      return json({ok: true, receipt})
    }

    // Recurring: PayPal has the visitor's approval. Confirm it, then record the first payment once PayPal lists it.
    if (!checkout.paypal_subscription_id || checkout.paypal_subscription_id !== body.subscriptionId) return fail(400, 'That payment does not match this form.')
    const sub = await getSubscription(checkout.paypal_subscription_id)
    if (!['ACTIVE', 'APPROVED'].includes(sub?.status) || (sub.custom_id && sub.custom_id !== checkout.id)) return fail(409, 'PayPal has not confirmed this plan yet. Nothing was recorded. Please try again.')
    for (let i = 0; i < 4; i++) {
      const tx = await firstPayment(sub.id)
      if (tx) {
        const paid = cents(tx.amount_with_breakdown?.gross_amount?.value)
        if (paid !== checkout.amount_cents) {
          log('checkout.amount_mismatch', {checkout: checkout.id, capture: tx.id})
          return fail(409, 'The payment amount did not match. Please email info@sbwpc.org so we can sort it out.')
        }
        const receipt = await completeCheckout(checkout, {captureId: tx.id, subscriptionId: sub.id, method: 'paypal', amountCents: paid})
        log('checkout.paid', {checkout: checkout.id, kind: checkout.kind, cents: paid, method: 'paypal', recurring: true})
        return json({ok: true, receipt})
      }
      await wait(1500)
    }
    // PayPal sometimes takes a few minutes to post the first charge. The webhook records it when it lands.
    log('checkout.subscription_waiting', {checkout: checkout.id})
    return json({ok: true, receipt: receiptFor(checkout, {method: 'paypal', pending: true})})
  } catch (err) {
    log('checkout.capture_failed', {checkout: body.checkoutId, message: err.message, issue: err.issue || '', debug: err.debugId || ''})
    return fail(502, 'We could not confirm the payment. Please do not pay again. Email info@sbwpc.org and we will check it.')
  }
}

export const config = {path: '/api/checkout/capture', method: 'POST', rateLimit: {windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain']}}
