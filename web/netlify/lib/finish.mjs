// Turn a confirmed payment into records: person, membership, payment, and a receipt for the page.
import {db, must, recordPayment} from './db.mjs'
import {paypalEnv} from './paypal.mjs'

export const SANDBOX_NOTE = 'SANDBOX TEST'
export const todayPT = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(new Date())

export function receiptFor(checkout, extra = {}) {
  const p = checkout.payload || {}
  return {
    kind: checkout.kind,
    mode: checkout.mode,
    level: p.level || null,
    frequency: p.frequency || 'once',
    amount_cents: checkout.amount_cents,
    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    email: p.email || '',
    in_honor_of: p.in_honor_of || null,
    reference: checkout.id.slice(0, 8).toUpperCase(),
    ...extra,
  }
}

// Record a payment PayPal has confirmed and close the checkout. Safe to call twice for the same payment.
export async function completeCheckout(checkout, {captureId, orderId = null, subscriptionId = null, method = 'paypal', amountCents}) {
  const result = await recordPayment({
    ...checkout.payload,
    kind: checkout.kind,
    amount_cents: amountCents,
    method,
    source: 'web',
    paypal_order_id: orderId,
    paypal_capture_id: captureId,
    subscription_id: subscriptionId,
    // Payments made with PayPal's test money are labelled so they can be found and removed before going live
    note: paypalEnv() === 'live' ? null : SANDBOX_NOTE,
  })
  const receipt = {method, transaction_id: captureId, paid_on: todayPT(), expires_on: result.expires_on || null, renewal: Boolean(result.renewal), amount_cents: amountCents}
  await must(db().from('checkouts').update({status: 'completed', completed_at: new Date().toISOString(), payment_id: result.payment_id, payload: {...checkout.payload, receipt}}).eq('id', checkout.id))
  return receiptFor(checkout, receipt)
}
