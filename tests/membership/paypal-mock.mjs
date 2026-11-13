// Test-only simulated PayPal API. Lets the checkout be exercised end to end without real money or a real account.
import http from 'node:http'

export function startPayPalMock(port = 54331) {
  const orders = new Map()
  const subs = new Map()
  let n = 0
  const calls = []
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const url = new URL(req.url, 'http://x')
    const path = url.pathname
    const body = raw && raw.startsWith('{') ? JSON.parse(raw) : {}
    const send = (status, obj) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(obj)) }
    calls.push(`${req.method} ${path}`)
    if (path.startsWith('/_test/apple/')) { const o = orders.get(path.split('/').pop()); if (o) o.source = 'apple_pay'; res.writeHead(200, {'access-control-allow-origin': '*'}); return res.end('ok') }
    if (path === '/v1/oauth2/token') return send(/^Basic /.test(req.headers.authorization || '') ? 200 : 401, {access_token: 'T', expires_in: 3600})
    if (req.headers.authorization !== 'Bearer T') return send(401, {name: 'AUTHENTICATION_FAILURE'})
    let m
    if (path === '/v2/checkout/orders' && req.method === 'POST') {
      const id = 'ORDER' + ++n
      const unit = body.purchase_units[0]
      orders.set(id, {id, status: 'CREATED', unit, source: 'paypal'})
      return send(201, {id, status: 'CREATED'})
    }
    if ((m = path.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/))) {
      const o = orders.get(m[1])
      if (!o) return send(404, {name: 'RESOURCE_NOT_FOUND'})
      if (m[2]) {
        if (o.status === 'COMPLETED') return send(422, {name: 'UNPROCESSABLE_ENTITY', details: [{issue: 'ORDER_ALREADY_CAPTURED'}]})
        if (o.unit.amount.value === '13.13') return send(422, {name: 'UNPROCESSABLE_ENTITY', details: [{issue: 'INSTRUMENT_DECLINED'}], debug_id: 'dbg1'})
        o.status = 'COMPLETED'
        o.capture = {id: 'CAP' + ++n, status: o.unit.amount.value === '17.17' ? 'PENDING' : 'COMPLETED', amount: o.tamper ? {currency_code: 'USD', value: o.tamper} : o.unit.amount}
      }
      const out = {id: o.id, status: o.status, payment_source: {[o.source]: {}}, purchase_units: [{reference_id: o.unit.reference_id, custom_id: o.unit.custom_id, payments: o.capture ? {captures: [o.capture]} : undefined}]}
      return send(m[2] ? 201 : 200, out)
    }
    if (path === '/v1/catalogs/products') return send(201, {id: 'PROD' + ++n})
    if (path === '/v1/billing/plans') return send(201, {id: 'PLAN-' + body.billing_cycles[0].frequency.interval_unit + ++n})
    if (path === '/v1/billing/subscriptions' && req.method === 'POST') {
      const id = 'I-SUB' + ++n
      subs.set(id, {id, status: 'ACTIVE', custom_id: body.custom_id, plan_id: body.plan_id, value: body.plan.billing_cycles[0].pricing_scheme.fixed_price.value, sale: 'SALE' + ++n})
      return send(201, {id, status: 'APPROVAL_PENDING'})
    }
    if ((m = path.match(/^\/v1\/billing\/subscriptions\/([^/]+)(\/transactions)?$/))) {
      const s = subs.get(m[1])
      if (!s) return send(404, {name: 'RESOURCE_NOT_FOUND'})
      if (!m[2]) return send(200, {id: s.id, status: s.status, custom_id: s.custom_id, plan_id: s.plan_id})
      // A plan for exactly $77 simulates PayPal being slow to post the first charge
      return send(200, {transactions: s.value === '77.00' ? [] : [{id: s.sale, status: 'COMPLETED', amount_with_breakdown: {gross_amount: {currency_code: 'USD', value: s.value}}}]})
    }
    if (path === '/v1/notifications/verify-webhook-signature') {
      const ok = body.transmission_sig === 'good' && body.webhook_id === 'WH-TEST' && typeof body.webhook_event === 'object'
      return send(200, {verification_status: ok ? 'SUCCESS' : 'FAILURE'})
    }
    send(404, {name: 'NOT_MOCKED', path})
  })
  return new Promise((resolve) => server.listen(port, () => resolve({server, orders, subs, calls})))
}
