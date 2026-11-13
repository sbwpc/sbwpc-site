// End-to-end checks of the payment server against the local database and the simulated PayPal.
import {startSite} from './site.mjs'
import {randomBytes} from 'node:crypto'

const site = await startSite()
const {origin, sql, paypal} = site
let pass = 0, failed = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`) }
const post = async (path, body, headers = {}) => {
  const res = await fetch(origin + path, {method: 'POST', headers: {'content-type': 'application/json', origin, ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)})
  let data = null
  try { data = await res.json() } catch { /* empty */ }
  return {status: res.status, ...data}
}
const person = (over = {}) => ({first_name: 'Ana', last_name: 'Tester', email: 'ana@example.com', phone: '805-555-0100', address1: '1 State St', city: 'Santa Barbara', state: 'CA', zip: '93101', occupation: 'Teacher', employer: 'SB Unified', attest: true, email_opt_in: true, ...over})
const count = async (table, where = 'true') => (await sql(`select count(*)::int as n from public.${table} where ${where}`))[0].n
const hook = (type, resource, sig = 'good') => post('/api/paypal/webhook', {id: 'WH-' + Math.random(), event_type: type, resource}, {'paypal-transmission-sig': sig, 'paypal-transmission-id': 't1', 'paypal-transmission-time': 'now', 'paypal-cert-url': 'https://x', 'paypal-auth-algo': 'SHA256withRSA'})

console.log('\n== Setup and guards ==')
const cfg = await (await fetch(origin + '/api/checkout/config')).json()
ok('config reports sandbox and never a secret', cfg.env === 'sandbox' && cfg.clientId === 'test-client' && !JSON.stringify(cfg).includes('secret'))
ok('a request from another website is refused', (await post('/api/checkout/create', {kind: 'dues', level: 'Advocate', ...person()}, {origin: 'https://evil.example'})).status === 403)
let r = await post('/api/checkout/create', {kind: 'dues', pay: 'online', ...person({email: 'nope', zip: '9', occupation: '', attest: false})})
ok('bad details are refused with a message per field', r.status === 422 && r.errors.level && r.errors.email && r.errors.zip && r.errors.occupation && r.errors.attest, JSON.stringify(r))
ok('nothing was stored for the refused form', (await count('checkouts')) === 0)
r = await post('/api/checkout/create', {kind: 'donation', amount: 50, pay: 'online', website: 'http://spam', ...person()})
ok('spam trap: filled hidden field stores nothing', r.ok && (await count('checkouts')) === 0)
r = await post('/api/checkout/create', {kind: 'donation', amount: 0.5, pay: 'online', ...person()})
ok('donation below the minimum is refused', r.status === 422 && r.errors.amount)
r = await post('/api/checkout/create', {kind: 'donation', amount: 9999999, pay: 'online', ...person()})
ok('donation above the safety limit is refused', r.status === 422 && r.errors.amount)

console.log('\n== New member pays once ==')
r = await post('/api/checkout/create', {kind: 'dues', level: 'Advocate', amount: 1, pay: 'online', committees: ['Media', 'Not a committee'], ...person()})
ok('order opened', r.ok && r.orderId && r.checkoutId, JSON.stringify(r))
const o1 = paypal.orders.get(r.orderId)
ok('price comes from the server list, not the browser ($40, not $1)', o1.unit.amount.value === '40.00')
ok('nothing counts as paid before PayPal confirms', (await count('people')) === 0 && (await count('payments')) === 0)
ok('a capture with the wrong order number is refused', (await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: 'ORDER999'})).status === 400)
let c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
ok('payment confirmed and receipt returned', c.ok && c.receipt.transaction_id && c.receipt.level === 'Advocate' && c.receipt.amount_cents === 4000, JSON.stringify(c))
let m = (await sql(`select m.*, p.email, p.email_opt_in from public.memberships m join public.people p on p.id = m.person_id`))[0]
ok('member record created: active for 12 months, committees cleaned', m.state === 'active' && m.level === 'Advocate' && m.committees.join() === 'Media' && c.receipt.expires_on === m.expires_on && m.email_opt_in === true, JSON.stringify(m))
const firstExpiry = m.expires_on
const c2 = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
ok('confirming the same payment twice records it once', c2.ok && c2.receipt.transaction_id === c.receipt.transaction_id && (await count('payments')) === 1)

console.log('\n== Renewal by the same email ==')
r = await post('/api/checkout/create', {kind: 'dues', level: 'Access', pay: 'online', ...person({email: 'ANA@Example.com', address1: '22 New Ave'})})
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
m = (await sql(`select m.*, p.address1 from public.memberships m join public.people p on p.id = m.person_id`))
ok('no duplicate person or membership', (await count('people')) === 1 && m.length === 1)
ok('early renewal adds a year to the current expiration date', c.receipt.renewal === true && Number(m[0].expires_on.slice(0, 4)) === Number(firstExpiry.slice(0, 4)) + 1 && m[0].expires_on.slice(4) === firstExpiry.slice(4), m[0].expires_on + ' vs ' + firstExpiry)
ok('level and address updated from the new form', m[0].level === 'Access' && m[0].address1 === '22 New Ave')

console.log('\n== Things that go wrong ==')
r = await post('/api/checkout/create', {kind: 'donation', amount: 13.13, pay: 'online', ...person({email: 'declined@example.com'})})
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
ok('declined card: clear message, nothing recorded', c.status === 402 && /declined/i.test(c.message) && (await count('people', `email = 'declined@example.com'`)) === 0)
r = await post('/api/checkout/create', {kind: 'donation', amount: 17.17, pay: 'online', ...person({email: 'pending@example.com'})})
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
ok('payment PayPal is still reviewing is not marked paid', c.status === 202 && c.pending && (await count('payments', `amount_cents = 1717`)) === 0)
r = await post('/api/checkout/create', {kind: 'donation', amount: 100, pay: 'online', ...person({email: 'tamper@example.com'})})
paypal.orders.get(r.orderId).tamper = '1.00'
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
ok('amount PayPal collected must match: mismatch is refused and not recorded', c.status === 409 && (await count('people', `email = 'tamper@example.com'`)) === 0)
ok('unknown checkout id is refused', (await post('/api/checkout/capture', {checkoutId: '00000000-0000-4000-8000-000000000000', orderId: 'X'})).status === 404)

console.log('\n== One-time donation with a dedication ==')
r = await post('/api/checkout/create', {kind: 'donation', amount: '250', pay: 'online', in_honor_of: 'Susan Rose', honor_type: 'honor', ...person()})
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId})
let pay = (await sql(`select * from public.payments where kind = 'donation' order by created_at desc limit 1`))[0]
ok('donation recorded for the existing person with the dedication', c.ok && pay.amount_cents === 25000 && pay.in_honor_of === 'In honor of Susan Rose' && pay.membership_id === null && (await count('people')) === 1)
const tot = (await sql(`select * from public.contributor_totals`))[0]
ok('yearly total adds dues and gifts and flags $100 or more', tot.total_cents === 4000 + 12500 + 25000 && tot.reportable === true)

console.log('\n== Monthly donation (PayPal subscription) ==')
r = await post('/api/checkout/create', {kind: 'donation', amount: 25, frequency: 'monthly', pay: 'online', ...person({first_name: 'Bo', email: 'bo@example.com'})})
ok('subscription opened at the chosen amount', r.ok && r.subscriptionId && paypal.subs.get(r.subscriptionId).value === '25.00', JSON.stringify(r))
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, subscriptionId: r.subscriptionId})
let plan = (await sql(`select * from public.recurring_plans`))[0]
ok('first payment and plan recorded', c.ok && !c.receipt.pending && plan.status === 'active' && plan.frequency === 'monthly' && plan.amount_cents === 2500 && (await count('payments', `recurring_plan_id is not null`)) === 1, JSON.stringify(c))
const sub = paypal.subs.get(r.subscriptionId)
let h = await hook('PAYMENT.SALE.COMPLETED', {id: sub.sale, billing_agreement_id: sub.id, amount: {total: '25.00', currency: 'USD'}})
ok('PayPal webhook for the same charge does not double count', h.ok && h.outcome === 'already recorded' && (await count('payments', `recurring_plan_id is not null`)) === 1, JSON.stringify(h))
h = await hook('PAYMENT.SALE.COMPLETED', {id: 'SALE-MONTH2', billing_agreement_id: sub.id, amount: {total: '25.00', currency: 'USD'}})
ok('next month: webhook records the new charge', h.outcome === 'renewal recorded' && (await count('payments', `recurring_plan_id is not null`)) === 2)
h = await hook('PAYMENT.SALE.COMPLETED', {id: 'SALE-FAKE', billing_agreement_id: sub.id, amount: {total: '25.00'}}, 'forged')
ok('a webhook PayPal does not vouch for is rejected', h.status === 401 && (await count('payments', `paypal_capture_id = 'SALE-FAKE'`)) === 0)
h = await hook('PAYMENT.SALE.REFUNDED', {id: 'REF1', sale_id: 'SALE-MONTH2'})
ok('refund webhook marks the payment refunded', (await sql(`select status from public.payments where paypal_capture_id = 'SALE-MONTH2'`))[0].status === 'refunded')
h = await hook('BILLING.SUBSCRIPTION.CANCELLED', {id: sub.id})
plan = (await sql(`select * from public.recurring_plans`))[0]
ok('cancel webhook stops the plan', plan.status === 'cancelled' && plan.cancelled_on)
ok('PayPal plans are created once and reused', paypal.calls.filter((x) => x === 'POST /v1/billing/plans').length === 1 && (await count('settings')) === 1)

console.log('\n== Yearly auto-renew membership, PayPal slow to post the first charge ==')
// The mock treats $77 as slow, so use a level price via a temporary slow flag instead
r = await post('/api/checkout/create', {kind: 'dues', level: 'Feminist Household', frequency: 'yearly', pay: 'online', household_name: 'Dee Rivers', ...person({first_name: 'Cy', last_name: 'Rivers', email: 'cy@example.com'})})
const slow = paypal.subs.get(r.subscriptionId)
slow.value = '77.00'
const t0 = Date.now()
c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, subscriptionId: r.subscriptionId})
ok('visitor gets a "processing" receipt and nothing is marked paid yet', c.ok && c.receipt.pending === true && (await count('people', `email = 'cy@example.com'`)) === 0, JSON.stringify(c) + ` ${Date.now() - t0}ms`)
h = await hook('PAYMENT.SALE.COMPLETED', {id: slow.sale, billing_agreement_id: slow.id, amount: {total: '60.00', currency: 'USD'}})
m = (await sql(`select m.* from public.memberships m join public.people p on p.id = m.person_id where p.email = 'cy@example.com'`))[0]
ok('webhook then records the member with auto-renew on', h.outcome === 'first payment recorded' && m && m.auto_renew === true && m.household_name === 'Dee Rivers' && m.level === 'Feminist Household', JSON.stringify(h))
const exp1 = m.expires_on
h = await hook('PAYMENT.SALE.COMPLETED', {id: 'SALE-YEAR2', billing_agreement_id: slow.id, amount: {total: '60.00', currency: 'USD'}})
m = (await sql(`select m.* from public.memberships m join public.people p on p.id = m.person_id where p.email = 'cy@example.com'`))[0]
ok('next yearly charge extends the same membership by a year', h.outcome === 'renewal recorded' && Number(m.expires_on.slice(0, 4)) === Number(exp1.slice(0, 4)) + 1)
h = await hook('BILLING.SUBSCRIPTION.PAYMENT.FAILED', {id: slow.id})
ok('failed charge is flagged on the plan', (await sql(`select status from public.recurring_plans where paypal_subscription_id = $1`, [slow.id]))[0].status === 'failed')
r = await post('/api/checkout/create', {kind: 'dues', level: 'Friend', frequency: 'monthly', pay: 'online', ...person()})
ok('monthly membership is not offered', r.status === 422 && r.errors.frequency)

console.log('\n== Pay by check ==')
const before = {people: await count('people'), payments: await count('payments')}
r = await post('/api/checkout/create', {kind: 'dues', level: 'Voice', pay: 'check', ...person({first_name: 'Di', last_name: 'Mailer', email: 'di@example.com'})})
ok('check pledge saved with mailing reference, no PayPal call', r.ok && r.mode === 'check' && r.receipt.method === 'check' && r.receipt.amount_cents === 30000 && r.receipt.reference.length === 8, JSON.stringify(r))
ok('nothing counts as paid until the check is confirmed', (await count('people')) === before.people && (await count('payments')) === before.payments && (await count('checkouts', `mode = 'check' and status = 'pending'`)) === 1)
ok('a check cannot be "captured" through the website', (await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: 'x'})).status === 404)
r = await post('/api/checkout/create', {kind: 'donation', amount: 40, frequency: 'monthly', pay: 'check', ...person()})
ok('a check cannot be set to repeat', r.status === 422 && r.errors.frequency)

console.log('\n== Public cannot read anything through the database address ==')
const anon = async (path) => (await fetch('http://localhost:54330/rest/v1/' + path, {headers: {apikey: 'sb_publishable_test'}})).status
ok('people, payments, checkouts and audit log are closed to the public', [await anon('people'), await anon('payments'), await anon('checkouts'), await anon('audit_log'), await anon('settings')].every((s) => s === 401))
const anonRpc = await fetch('http://localhost:54330/rest/v1/rpc/record_payment', {method: 'POST', headers: {apikey: 'sb_publishable_test', 'content-type': 'application/json'}, body: JSON.stringify({p: {kind: 'donation', amount_cents: 100, email: 'x@example.com'}})})
ok('public cannot record a payment directly', anonRpc.status === 401)

console.log('\n== Nightly encrypted backup ==')
process.env.BACKUP_KEY = randomBytes(32).toString('base64')
const {runBackup} = await import('../../web/netlify/functions/backup.mjs')
const {open, keyFrom} = await import('../../web/netlify/lib/backup-crypto.mjs')
const blobs = new Map([['backup-2026-01-01.sbk', new ArrayBuffer(4)]])
const store = {set: async (k, v) => blobs.set(k, v), list: async () => ({blobs: [...blobs.keys()].map((key) => ({key}))}), delete: async (k) => blobs.delete(k)}
await sql(`insert into public.checkouts (kind, mode, amount_cents, payload, created_at) values ('donation','once',500,'{"first_name":"Old"}', now() - interval '45 days'), ('donation','check',500,'{"first_name":"OldCheck"}', now() - interval '45 days')`)
const b = await runBackup(store)
const file = Buffer.from(blobs.get(b.name))
ok('backup file is unreadable without the key', !file.toString('latin1').includes('ana@example.com') && !file.toString('latin1').includes('Tester'))
const restored = open(file, keyFrom(process.env.BACKUP_KEY))
ok('backup opens with the key and holds every table', restored.tables.people.length === (await count('people')) && restored.tables.payments.length === (await count('payments')) && restored.tables.audit_log.length > 0 && restored.tables.memberships.length === 2)
let wrong = false
try { open(file, randomBytes(32)) } catch { wrong = true }
ok('a wrong key cannot open it', wrong)
ok('backups older than 30 days are removed', b.removed === 1 && !blobs.has('backup-2026-01-01.sbk'))
ok('unfinished online checkouts older than 30 days are cleared, waiting checks are kept', b.purged === 1 && (await count('checkouts', `payload->>'first_name' = 'OldCheck'`)) === 1)

console.log(`\n${pass} passed, ${failed} failed`)
await site.close()
process.exit(failed ? 1 : 0)
