// PayPal REST calls. The secret stays on the server. The browser only ever sees order and subscription ids.
import {env} from './http.mjs'

export const paypalEnv = () => (env('PAYPAL_ENV') === 'live' ? 'live' : 'sandbox')
export const paypalReady = () => Boolean(env('PAYPAL_CLIENT_ID') && env('PAYPAL_SECRET'))
const base = () => env('PAYPAL_API_BASE') || (paypalEnv() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

let token = {value: '', expires: 0}
async function accessToken() {
  if (token.value && Date.now() < token.expires) return token.value
  const res = await fetch(base() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {authorization: 'Basic ' + Buffer.from(`${env('PAYPAL_CLIENT_ID')}:${env('PAYPAL_SECRET')}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('paypal: could not sign in (' + res.status + ')')
  const data = await res.json()
  token = {value: data.access_token, expires: Date.now() + Math.max(60, (data.expires_in || 300) - 120) * 1000}
  return token.value
}

export async function paypal(method, path, body, headers = {}) {
  const res = await fetch(base() + path, {
    method,
    headers: {authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json', ...headers},
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!res.ok) {
    const err = new Error(`paypal: ${method} ${path.split('?')[0]} failed (${res.status})`)
    err.status = res.status
    err.issue = data?.details?.[0]?.issue || data?.name || ''
    err.debugId = data?.debug_id || ''
    throw err
  }
  return data
}

const usd = (cents) => (cents / 100).toFixed(2)

export const createOrder = (checkoutId, amountCents, description) =>
  paypal('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{reference_id: checkoutId, custom_id: checkoutId, description: description.slice(0, 127), amount: {currency_code: 'USD', value: usd(amountCents)}}],
    application_context: {brand_name: 'SBWPC', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW'},
  }, {'paypal-request-id': 'order-' + checkoutId})

export const getOrder = (orderId) => paypal('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`)
export const captureOrder = (orderId, checkoutId) =>
  paypal('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, {'paypal-request-id': 'capture-' + checkoutId, prefer: 'return=representation'})

// One product, and one plan per kind and frequency. The price is set on each subscription.
export const createProduct = () => paypal('POST', '/v1/catalogs/products', {name: 'SBWPC membership and donations', type: 'SERVICE'})
export const createPlan = (productId, name, unit) =>
  paypal('POST', '/v1/billing/plans', {
    product_id: productId,
    name,
    status: 'ACTIVE',
    billing_cycles: [{frequency: {interval_unit: unit, interval_count: 1}, tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, pricing_scheme: {fixed_price: {value: '1.00', currency_code: 'USD'}}}],
    payment_preferences: {auto_bill_outstanding: true, payment_failure_threshold: 2},
  })
export const createSubscription = ({planId, checkoutId, amountCents, person, siteUrl}) =>
  paypal('POST', '/v1/billing/subscriptions', {
    plan_id: planId,
    custom_id: checkoutId,
    plan: {billing_cycles: [{sequence: 1, total_cycles: 0, pricing_scheme: {fixed_price: {value: usd(amountCents), currency_code: 'USD'}}}]},
    subscriber: {name: {given_name: person.first_name, surname: person.last_name}, email_address: person.email},
    application_context: {brand_name: 'SBWPC', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW', return_url: siteUrl + '/', cancel_url: siteUrl + '/'},
  }, {'paypal-request-id': 'sub-' + checkoutId})
export const getSubscription = (id) => paypal('GET', `/v1/billing/subscriptions/${encodeURIComponent(id)}`)
export async function firstPayment(id) {
  const end = new Date(Date.now() + 86400000).toISOString()
  const start = new Date(Date.now() - 3 * 86400000).toISOString()
  const data = await paypal('GET', `/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions?start_time=${start}&end_time=${end}`)
  return (data?.transactions || []).find((t) => t.status === 'COMPLETED') || null
}

// Ask PayPal whether a webhook message really came from PayPal. The event must be passed back byte for byte.
export async function verifyWebhook(req, rawBody) {
  const webhookId = env('PAYPAL_WEBHOOK_ID')
  if (!webhookId) return false
  const h = (n) => req.headers.get(n) || ''
  const head = JSON.stringify({
    auth_algo: h('paypal-auth-algo'),
    cert_url: h('paypal-cert-url'),
    transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'),
    transmission_time: h('paypal-transmission-time'),
    webhook_id: webhookId,
  })
  const body = head.slice(0, -1) + ',"webhook_event":' + rawBody + '}'
  const data = await paypal('POST', '/v1/notifications/verify-webhook-signature', body)
  return data?.verification_status === 'SUCCESS'
}
