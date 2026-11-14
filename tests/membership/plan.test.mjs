// Checks of the "manage my plan" page's server side: looking up a private link, cancelling an automatic payment
// with PayPal, the emails that follow, and the "email me my link" form. Local database, simulated PayPal and mail.
import {startSite} from './site.mjs'
import {jwt} from './browser.mjs'

const site = await startSite()
const {origin, sql, paypal, mail, settle} = site
let pass = 0, failed = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`) }
const post = async (path, body, headers = {}) => {
  const res = await fetch(origin + path, {method: 'POST', headers: {'content-type': 'application/json', origin, ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)})
  let data = null
  try { data = await res.json() } catch { /* empty */ }
  await settle()
  return {status: res.status, ...data}
}
const person = (over = {}) => ({first_name: 'Ana', last_name: 'Tester', email: 'ana@example.com', address1: '1 State St', city: 'Santa Barbara', state: 'CA', zip: '93101', occupation: 'Teacher', employer: 'SB Unified', attest: true, ...over})
const pay = async (body) => { const r = await post('/api/checkout/create', {pay: 'online', ...body}); const c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId, subscriptionId: r.subscriptionId}); return {...c, subscriptionId: r.subscriptionId} }
const hook = (type, resource) => post('/api/paypal/webhook', {id: 'WH-' + Math.random(), event_type: type, resource}, {'paypal-transmission-sig': 'good', 'paypal-transmission-id': 't1', 'paypal-transmission-time': 'now', 'paypal-cert-url': 'https://x', 'paypal-auth-algo': 'SHA256withRSA'})
const to = (addr) => mail.filter((m) => m.to === addr)
const last = (addr) => to(addr).at(-1)
const plansOf = (email) => sql(`select r.* from public.recurring_plans r join public.people p on p.id = r.person_id where p.email = $1 order by r.created_at`, [email])
const memberOf = async (email) => (await sql(`select m.* from public.memberships m join public.people p on p.id = m.person_id where p.email = $1`, [email]))[0]
const calls = (what) => paypal.calls.filter((c) => c.startsWith(what)).length
const linkIn = (m) => (m.text.match(/manage\/#plan=([0-9a-f-]{36})/) || [])[1]
const {default: mailQueue} = await import('../../web/netlify/functions/mail-queue.mjs')

console.log('\n== The private link ==')
const a1 = await pay({kind: 'dues', level: 'Advocate', frequency: 'yearly', ...person()})
const a2 = await pay({kind: 'donation', amount: 25, frequency: 'monthly', ...person()})
await pay({kind: 'donation', amount: 10, frequency: 'monthly', ...person({first_name: 'Bo', last_name: 'Other', email: 'bo@example.com'})})
const [duesPlan, giftPlan] = await plansOf('ana@example.com')
const [boPlan] = await plansOf('bo@example.com')
let r = to('ana@example.com')[0]
ok('the welcome receipt for an auto-renew membership carries the private manage link', r.subject === 'Welcome to SBWPC, Ana' && linkIn(r) === duesPlan.manage_token && r.text.includes('Manage automatic renewal:') && !r.text.includes('in your PayPal account'), r.text)
ok('a monthly gift receipt carries its own link', linkIn(last('ana@example.com')) === giftPlan.manage_token && last('ana@example.com').text.includes('Manage my monthly gift:'))
let v = await post('/api/plan/view', {token: duesPlan.manage_token})
ok('the link shows both of that person\'s plans', v.ok && v.first_name === 'Ana' && v.plans.length === 2 && v.plans.some((p) => p.kind === 'dues' && p.level === 'Advocate' && p.amount_cents === 4000 && p.frequency === 'yearly' && p.status === 'active') && v.plans.some((p) => p.kind === 'donation' && p.amount_cents === 2500 && p.frequency === 'monthly'), JSON.stringify(v))
const m0 = await memberOf('ana@example.com')
ok('it shows the next payment date from PayPal and how long the membership is good', v.plans.find((p) => p.kind === 'dues').next_on === '2027-06-15' && v.plans.find((p) => p.kind === 'dues').good_through === m0.expires_on, JSON.stringify(v.plans))
ok('it gives away no contact details, tokens or PayPal ids', !/example\.com|State St|Tester|manage_token|I-SUB|person_id/.test(JSON.stringify(v)) && !JSON.stringify(v).includes(duesPlan.manage_token))
ok('nobody else\'s plan is included', !v.plans.some((p) => p.id === boPlan.id))
ok('a made-up link shows nothing', (await post('/api/plan/view', {token: '11111111-2222-4333-8444-555555555555'})).status === 404 && (await post('/api/plan/view', {token: "x' or 1=1"})).status === 404 && (await post('/api/plan/view', {})).status === 404)
ok('another website cannot use the page\'s address', (await post('/api/plan/view', {token: duesPlan.manage_token}, {origin: 'https://evil.example'})).status === 403 && (await post('/api/plan/cancel', {token: duesPlan.manage_token}, {origin: 'https://evil.example'})).status === 403)
ok('a renewal reminder token does not work as a manage link', (await post('/api/plan/view', {token: m0.renew_token})).status === 404)

console.log('\n== Stopping automatic renewal ==')
ok('one person\'s link cannot cancel another person\'s plan', (await post('/api/plan/cancel', {token: duesPlan.manage_token, planId: boPlan.id})).status === 404 && calls('POST /v1/billing/subscriptions/' + a1.subscriptionId + '/cancel') === 0 && (await plansOf('bo@example.com'))[0].status === 'active')
paypal.subs.get(a1.subscriptionId).down = true
let before = mail.length
r = await post('/api/plan/cancel', {token: duesPlan.manage_token})
ok('if PayPal cannot be reached, nothing is marked cancelled and the member is told', r.status === 502 && /Nothing has changed/.test(r.message) && (await plansOf('ana@example.com'))[0].status === 'active' && (await memberOf('ana@example.com')).auto_renew === true && mail.length === before, JSON.stringify(r))
paypal.subs.get(a1.subscriptionId).down = false
r = await post('/api/plan/cancel', {token: duesPlan.manage_token})
let plan = (await plansOf('ana@example.com'))[0]
let m = await memberOf('ana@example.com')
ok('PayPal is told to stop charging', paypal.subs.get(a1.subscriptionId).status === 'CANCELLED' && /member on sbwpc\.org/.test(paypal.subs.get(a1.subscriptionId).reason))
ok('the plan is marked cancelled with the date', r.ok && plan.status === 'cancelled' && plan.cancelled_on && r.plans.find((p) => p.id === plan.id).status === 'cancelled' && r.plans.find((p) => p.id === plan.id).next_on === null, JSON.stringify(r))
ok('the membership stays active through the date already paid for, with auto-renew off', m.state === 'active' && m.expires_on === m0.expires_on && m.auto_renew === false)
ok('the monthly gift is untouched', (await plansOf('ana@example.com'))[1].status === 'active' && paypal.subs.get(a2.subscriptionId).status === 'ACTIVE')
let c = last('ana@example.com')
ok('the member gets a confirmation', c.subject === 'Automatic renewal is off for your SBWPC membership' && c.text.includes('PayPal will not charge you again') && c.text.includes('Advocate membership stays active through') && c.replyTo === 'info@sbwpc.org' && !c.text.includes('undefined'), c.text)
let s = last('info@sbwpc.org')
ok('the SBWPC inbox is told the member cancelled on the website', s.subject === 'Automatic payment cancelled: Ana Tester' && s.text.includes('cancelled it themselves on the website') && s.text.includes('stays active until it expires') && mail.length === before + 2, s.text)
before = mail.length
const again = await post('/api/plan/cancel', {token: duesPlan.manage_token})
await hook('BILLING.SUBSCRIPTION.CANCELLED', {id: a1.subscriptionId})
await hook('BILLING.SUBSCRIPTION.CANCELLED', {id: a1.subscriptionId})
ok('pressing the button again, and PayPal\'s own messages, send nothing twice', again.ok && mail.length === before && calls('POST /v1/billing/subscriptions/' + a1.subscriptionId + '/cancel') === 2, `${mail.length - before} extra, ${calls('POST /v1/billing/subscriptions/' + a1.subscriptionId + '/cancel')} calls`)
await hook('BILLING.SUBSCRIPTION.PAYMENT.FAILED', {id: a1.subscriptionId})
await hook('BILLING.SUBSCRIPTION.SUSPENDED', {id: a1.subscriptionId})
ok('a cancelled plan stays cancelled whatever arrives later', (await plansOf('ana@example.com'))[0].status === 'cancelled' && mail.length === before)
v = await post('/api/plan/view', {token: duesPlan.manage_token})
ok('the old link still opens the page and shows what happened', v.ok && v.plans.find((p) => p.id === duesPlan.id).status === 'cancelled' && v.plans.find((p) => p.id === duesPlan.id).cancelled_on && v.plans.length === 2)

console.log('\n== Cancelling a gift, and plans changed in PayPal ==')
before = mail.length
r = await post('/api/plan/cancel', {token: duesPlan.manage_token, planId: giftPlan.id})
c = last('ana@example.com')
ok('a link also cancels the same person\'s other plan when asked', r.ok && (await plansOf('ana@example.com'))[1].status === 'cancelled' && paypal.subs.get(a2.subscriptionId).status === 'CANCELLED')
ok('the gift confirmation thanks them and names the amount', c.subject === 'Your monthly gift to SBWPC is cancelled' && c.text.includes('$25 monthly gift') && c.text.includes('/donate') && mail.length === before + 2, c.text)
v = await post('/api/plan/view', {token: duesPlan.manage_token})
ok('cancelled plans stay on the page as a record', v.plans.length === 2 && v.plans.every((p) => p.status === 'cancelled' && p.cancelled_on && p.next_on === null))
// Bo cancels inside PayPal, and our webhook has not arrived yet
paypal.subs.get(paypal.subs.keys().toArray().at(-1)).status = 'CANCELLED'
before = mail.length
v = await post('/api/plan/view', {token: boPlan.manage_token})
await mailQueue()
ok('a plan cancelled in PayPal shows as cancelled the moment the page is opened', v.plans[0].status === 'cancelled' && (await plansOf('bo@example.com'))[0].status === 'cancelled')
ok('the inbox notice says it was changed in PayPal, and the member is not emailed by us', last('info@sbwpc.org').text.includes('This was changed in PayPal') && mail.length === before + 1 && !to('bo@example.com').some((x) => /cancelled/.test(x.subject)))
r = await post('/api/plan/cancel', {token: boPlan.manage_token})
ok('pressing stop on a plan PayPal already ended is fine', r.ok && mail.length === before + 1)
// PayPal refuses because the plan already ended there, and we had it as active
const d1 = await pay({kind: 'dues', level: 'Friend', frequency: 'yearly', ...person({first_name: 'Di', last_name: 'Late', email: 'di@example.com'})})
const [diPlan] = await plansOf('di@example.com')
paypal.subs.get(d1.subscriptionId).status = 'EXPIRED'
await sql(`update public.recurring_plans set status = 'failed' where id = $1`, [diPlan.id])
r = await post('/api/plan/cancel', {token: diPlan.manage_token})
ok('a plan that already ended in PayPal is recorded as cancelled, not as an error', r.ok && (await plansOf('di@example.com'))[0].status === 'cancelled' && last('di@example.com').subject.startsWith('Automatic renewal is off'), JSON.stringify(r))
await sql(`insert into public.recurring_plans (person_id, kind, amount_cents, frequency, status) select id, 'donation', 500, 'monthly', 'active' from public.people where email = 'di@example.com'`)
const hand = (await plansOf('di@example.com')).at(-1)
r = await post('/api/plan/cancel', {token: hand.manage_token})
ok('a plan with no PayPal record is never marked cancelled by the page', r.status === 409 && /info@sbwpc\.org/.test(r.message) && (await plansOf('di@example.com')).at(-1).status === 'active')

console.log('\n== Email me my link ==')
const e1 = await pay({kind: 'dues', level: 'Access', frequency: 'yearly', ...person({first_name: 'Eve', last_name: 'Asker', email: 'eve@example.com'})})
const [evePlan] = await plansOf('eve@example.com')
before = mail.length
const known = await post('/api/plan/link', {email: 'EVE@example.com '})
const unknown = await post('/api/plan/link', {email: 'nobody@example.com'})
const ended = await post('/api/plan/link', {email: 'bo@example.com'})
c = last('eve@example.com')
ok('a member with a plan is emailed their private link', known.ok && c.subject === 'Your link to manage your SBWPC automatic payment' && linkIn(c) === evePlan.manage_token && c.text.includes('Access membership') && c.text.includes('$125 each year'), c.text)
ok('the page says the same thing whether or not the address has a plan', known.status === 200 && unknown.status === 200 && ended.status === 200 && known.message === unknown.message && unknown.message === ended.message && mail.length === before + 1, `${mail.length - before} sent`)
ok('the emailed link works', (await post('/api/plan/view', {token: linkIn(c)})).first_name === 'Eve')
await post('/api/plan/link', {email: 'eve@example.com'})
await post('/api/plan/link', {email: 'eve@example.com'})
ok('asking again straight away does not send another email', mail.length === before + 1)
await sql(`update public.outbox set created_at = now() - interval '20 minutes' where kind = 'plan_link'`)
await post('/api/plan/link', {email: 'eve@example.com'})
ok('asking again later does', mail.length === before + 2)
ok('the spam trap and bad addresses send nothing', (await post('/api/plan/link', {email: 'eve@example.com', website: 'http://spam'})).ok && (await post('/api/plan/link', {email: 'not-an-email'})).status === 422 && (await post('/api/plan/link', {email: 'eve@example.com'}, {origin: 'https://evil.example'})).status === 403 && mail.length === before + 2)
process.env.MAIL_MODE = 'off'
r = await post('/api/plan/link', {email: 'eve@example.com'})
ok('with email switched off the form says so instead of pretending', r.status === 503 && /info@sbwpc\.org/.test(r.message))
process.env.MAIL_MODE = 'live'

console.log('\n== From the admin ==')
const rest = (path, who, init = {}) => fetch('http://localhost:54330/rest/v1/' + path, {...init, headers: {authorization: 'Bearer ' + jwt(who), 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers || {})}})
await sql(`insert into public.admins (email, role) values ('treasurer@example.com', 'treasurer') on conflict do nothing`)
before = mail.length
const sent = await rest('outbox', 'luke@coolhandlook.com', {method: 'POST', body: JSON.stringify({kind: 'plan_link', person_id: evePlan.person_id, data: {plan_id: evePlan.id}})})
await mailQueue()
ok('an admin can email a member their link', sent.status === 201 && mail.length === before + 1 && linkIn(last('eve@example.com')) === evePlan.manage_token)
const denied = await rest('outbox', 'treasurer@example.com', {method: 'POST', body: JSON.stringify({kind: 'plan_link', person_id: evePlan.person_id, data: {plan_id: evePlan.id}})})
const wrongKind = await rest('outbox', 'luke@coolhandlook.com', {method: 'POST', body: JSON.stringify({kind: 'plan_stopped', person_id: evePlan.person_id, data: {plan_id: evePlan.id}})})
ok('a read-only treasurer cannot, and an admin cannot fake a cancellation notice', denied.status === 403 && wrongKind.status === 403, `${denied.status} ${wrongKind.status}`)
const cross = await rest('outbox', 'luke@coolhandlook.com', {method: 'POST', body: JSON.stringify({kind: 'plan_link', person_id: (await plansOf('di@example.com'))[0].person_id, data: {plan_id: evePlan.id}})})
await mailQueue()
ok('a link is never sent to someone it does not belong to', cross.status === 201 && mail.length === before + 1 && (await sql(`select status from public.outbox order by created_at desc limit 1`))[0].status === 'skipped')
await post('/api/plan/cancel', {token: evePlan.manage_token})
before = mail.length
await rest('outbox', 'luke@coolhandlook.com', {method: 'POST', body: JSON.stringify({kind: 'plan_link', person_id: evePlan.person_id, data: {plan_id: evePlan.id}})})
await mailQueue()
ok('no link is sent for a plan that has already ended', mail.length === before)
ok('every email is on record', (await sql(`select count(*)::int n from public.outbox where status = 'sent'`))[0].n === mail.length && (await sql(`select count(*)::int n from public.outbox where status in ('queued', 'sending', 'failed')`))[0].n === 0)
void e1

console.log(`\n${pass} passed, ${failed} failed`)
await site.close()
process.exit(failed ? 1 : 0)
