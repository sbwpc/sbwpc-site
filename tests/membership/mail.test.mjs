// Email checks: receipts, check instructions, notices to the SBWPC inbox, renewal reminders and admin sign-in
// emails, against the local database, the simulated PayPal and a simulated Google mail service.
import {createHmac} from 'node:crypto'
import {startSite} from './site.mjs'
import {jwt} from './browser.mjs'

const site = await startSite()
const {origin, sql, paypal, mail, google, settle} = site
let pass = 0, failed = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`) }
const post = async (path, body, headers = {}) => {
  const res = await fetch(origin + path, {method: 'POST', headers: {'content-type': 'application/json', origin, ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)})
  let data = null
  try { data = await res.json() } catch { /* empty */ }
  return {status: res.status, ...data}
}
const person = (over = {}) => ({first_name: 'Ana', last_name: 'Tester', email: 'ana@example.com', address1: '1 State St', city: 'Santa Barbara', state: 'CA', zip: '93101', occupation: 'Teacher', employer: 'SB Unified', attest: true, ...over})
const pay = async (body) => { const r = await post('/api/checkout/create', {pay: 'online', ...body}); const c = await post('/api/checkout/capture', {checkoutId: r.checkoutId, orderId: r.orderId, subscriptionId: r.subscriptionId}); await settle(); return c }
const to = (addr) => mail.filter((m) => m.to === addr)
const last = (addr) => to(addr).at(-1)
const count = async (where) => (await sql(`select count(*)::int n from public.outbox where ${where}`))[0].n
const {default: mailQueue} = await import('../../web/netlify/functions/mail-queue.mjs')
const {default: reminders} = await import('../../web/netlify/functions/reminders.mjs')
const admin = (path, init = {}) => fetch('http://localhost:54330/rest/v1/' + path, {...init, headers: {authorization: 'Bearer ' + jwt('luke@coolhandlook.com'), 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers || {})}})
const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(new Date())
const shift = (days) => new Date(new Date(today + 'T12:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10)

console.log('\n== Receipts and notices after an online payment ==')
await pay({kind: 'dues', level: 'Advocate', ...person()})
let r = last('ana@example.com')
ok('new member gets a welcome receipt from info@sbwpc.org', r && r.from === 'SBWPC <info@sbwpc.org>' && r.subject === 'Welcome to SBWPC, Ana' && r.text.includes('Advocate membership is active through') && r.text.includes('Amount: $40') && r.text.includes('Paid by: PayPal') && /Transaction number: CAP\d+/.test(r.text), JSON.stringify(r)?.slice(0, 400))
ok('the receipt has a designed version and a plain text version', r.html.includes('<h1') && r.html.includes('Welcome to SBWPC') && !r.html.includes('undefined') && !r.text.includes('undefined') && !r.text.includes('null'))
ok('test payments say so in the receipt', r.text.includes('This was a test payment. No real money moved.'))
let s = last('info@sbwpc.org')
ok('the SBWPC inbox gets a notice with a link to the record', s && s.subject === '[Sandbox test] New member: Ana Tester (Advocate)' && /admin\/#\/person\/[0-9a-f-]{36}/.test(s.text) && s.replyTo === 'ana@example.com', JSON.stringify(s)?.slice(0, 300))
ok('Google was asked to send as info@sbwpc.org with send-only permission', google.state.tokens === 1)
await pay({kind: 'dues', level: 'Access', ...person()})
ok('a renewal gets its own receipt', last('ana@example.com').subject === 'Your SBWPC membership is renewed' && last('ana@example.com').text.includes('Access membership now runs through') && last('info@sbwpc.org').subject.includes('Membership renewed: Ana Tester'))
await pay({kind: 'donation', amount: 25, frequency: 'monthly', ...person({first_name: 'Bo', email: 'bo@example.com'})})
r = last('bo@example.com')
ok('a monthly gift receipt explains how to change or cancel it', r.subject === 'Thank you for your gift to SBWPC' && r.text.includes('$25 each month') && r.text.includes('repeats each month through PayPal'), r.text)
await pay({kind: 'donation', amount: 250, in_honor_of: 'Susan Rose', honor_type: 'memory', ...person({first_name: 'Di', email: 'di@example.com'})})
ok('a dedication shows on the receipt and the notice', last('di@example.com').text.includes('Dedication: In memory of Susan Rose') && last('info@sbwpc.org').subject.includes('New donation: $250 from Di Tester'))
ok('every email is recorded as sent with its recipient', (await count(`status = 'sent' and to_email is not null and sent_at is not null`)) === mail.length && (await count(`status <> 'sent'`)) === 0)

console.log('\n== Mail a check ==')
const before = mail.length
const chk = await post('/api/checkout/create', {kind: 'dues', level: 'Voice', pay: 'check', ...person({first_name: 'Cy', last_name: 'Mailer', email: 'cy@example.com'})})
await settle()
r = last('cy@example.com')
ok('the person is emailed where to mail the check', r && r.subject === 'How to mail your check to SBWPC' && r.text.includes('P.O. Box 90618') && r.text.includes("Santa Barbara Women's Political Committee") && r.text.includes('Amount: $300') && r.text.includes(chk.receipt.reference), r?.text)
ok('the SBWPC inbox is told a check is on the way', last('info@sbwpc.org').subject === 'Check on the way: $300 from Cy Mailer' && last('info@sbwpc.org').text.includes('admin/#/checks') && mail.length === before + 2)
const confirm = await admin('rpc/confirm_check', {method: 'POST', body: JSON.stringify({p_checkout: chk.checkoutId, p: {note: 'Check 77'}})})
ok('an admin marks the check received', confirm.status === 200)
ok('the receipt waits in the queue until the mail job runs', (await count(`status = 'queued' and kind = 'receipt'`)) === 1 && to('cy@example.com').length === 1)
await mailQueue()
r = last('cy@example.com')
ok('the mail job then sends the receipt for the check', r.subject === 'Welcome to SBWPC, Cy' && r.text.includes('We received your check.') && r.text.includes('Paid by: Check') && !r.text.includes('test payment'), r.text)
ok('no second notice to the inbox when an admin records it', to('info@sbwpc.org').filter((m) => m.subject.includes('Cy Mailer')).length === 1)
const manual = await admin('rpc/record_payment', {method: 'POST', body: JSON.stringify({p: {person_id: (await sql(`select id from public.people where email = 'di@example.com'`))[0].id, kind: 'donation', amount_cents: 5000, method: 'cash', source: 'manual', send_receipt: false}})})
await mailQueue()
ok('an admin can record a payment without emailing a receipt', manual.status === 200 && to('di@example.com').length === 1)

console.log('\n== Renewal reminders ==')
const mk = async (first, days, extra = {}) => { await pay({kind: 'dues', level: 'Friend', ...extra, ...person({first_name: first, last_name: 'Member', email: `${first.toLowerCase()}@example.com`})}); await sql(`update public.memberships set expires_on = $1 where person_id = (select id from public.people where email = $2)`, [shift(days), `${first.toLowerCase()}@example.com`]) }
await mk('Thirty', 30); await mk('Twenty', 20); await mk('Seven', 7); await mk('Today', 0); await mk('Lapsed', -14); await mk('Later', 200); await mk('Gap', -5); await mk('Old', -60)
await mk('Auto', 25, {frequency: 'yearly'})
const b4 = mail.length
await reminders()
const subj = (first) => to(`${first.toLowerCase()}@example.com`).slice(1).map((m) => m.subject)
ok('30 days before: a renewal reminder', subj('Thirty').length === 1 && subj('Thirty')[0].startsWith('Your SBWPC membership expires on ') && subj('Twenty').length === 1)
ok('7 days before: one week left', subj('Seven').join() === 'One week left on your SBWPC membership')
ok('on the day: expires today', subj('Today').join() === 'Your SBWPC membership expires today')
ok('14 days after: one lapsed notice, marked as the last', subj('Lapsed').join() === 'We miss you at SBWPC' && last('lapsed@example.com').text.includes('last reminder'))
ok('nobody else is emailed: not due yet, between reminders, or long expired', subj('Later').length + subj('Gap').length + subj('Old').length === 0)
r = last('auto@example.com')
ok('auto-renew members get a heads-up about the charge instead', subj('Auto').length === 1 && r.subject.startsWith('Your SBWPC membership renews on ') && r.text.includes('PayPal will charge $16') && !r.text.includes('Renew my membership'), r.text)
ok('reminders reply to the SBWPC inbox', last('thirty@example.com').replyTo === 'info@sbwpc.org')
await reminders(); await reminders()
ok('running the job again the same day sends nothing twice', mail.length === b4 + 6, `${mail.length - b4}`)
ok('each reminder is logged against the membership', (await sql(`select count(*)::int n from public.reminders`))[0].n === 6)
const link = last('seven@example.com').text.match(/http:\/\/localhost:4321(\/join-preview\/\?renew=([0-9a-f-]{36})#join)/)
const pre = link && await (await fetch(`${origin}/api/checkout/renew?token=${link[2]}`)).json()
ok('the renew link opens the Join form knowing only name, email and level', pre?.ok && JSON.stringify(Object.keys(pre.member).sort()) === '["email","first_name","last_name","level"]' && pre.member.first_name === 'Seven' && pre.member.level === 'Friend', JSON.stringify(pre))
await pay({kind: 'dues', level: 'Advocate', ...person({first_name: 'Seven', last_name: 'Member', email: 'seven@example.com'})})
ok('after renewing, the old renew link stops working', (await fetch(`${origin}/api/checkout/renew?token=${link[2]}`)).status === 404)
ok('a made-up renew link is refused', (await fetch(`${origin}/api/checkout/renew?token=00000000-0000-4000-8000-000000000000`)).status === 404 && (await fetch(`${origin}/api/checkout/renew?token=x`)).status === 404)
await sql(`update public.memberships set expires_on = $1 where person_id = (select id from public.people where email = 'twenty@example.com')`, [shift(6)])
await reminders()
ok('a week later the same member gets the 7-day reminder, once', subj('Twenty').length === 2 && subj('Twenty')[1] === 'One week left on your SBWPC membership')
// Renewed between queueing and sending: the reminder is dropped
await sql(`update public.memberships set expires_on = $1 where person_id = (select id from public.people where email = 'later@example.com')`, [shift(28)])
const {queueReminders} = await import('../../web/netlify/lib/outbox.mjs')
await queueReminders()
await pay({kind: 'dues', level: 'Friend', ...person({first_name: 'Later', last_name: 'Member', email: 'later@example.com'})})
await mailQueue()
ok('a reminder is dropped if the member renews before it goes out', !to('later@example.com').some((m) => m.subject.includes('expires on')) && (await count(`kind = 'reminder' and status = 'skipped'`)) === 1)
const tid = (await sql(`select m.id, m.person_id, m.expires_on::text e from public.memberships m join public.people p on p.id = m.person_id where p.email = 'thirty@example.com'`))[0]
const ins = await admin('outbox', {method: 'POST', body: JSON.stringify({kind: 'reminder', person_id: tid.person_id, membership_id: tid.id, data: {type: 'manual', for_expires_on: tid.e}})})
await mailQueue()
ok('an admin can send a reminder by hand from the person page', ins.status === 201 && subj('Thirty').length === 2 && (await sql(`select count(*)::int n from public.reminders where kind = 'manual'`))[0].n === 1)
const forged = await admin('outbox', {method: 'POST', body: JSON.stringify({kind: 'reminder', person_id: tid.person_id, to_email: 'attacker@example.com'})})
ok('an admin cannot point an email at a different address', forged.status === 403)

console.log('\n== Plans that stop ==')
const sub = [...paypal.subs.values()].find((x) => x.value === '25.00')
const hook = (type, resource) => post('/api/paypal/webhook', {id: 'WH' + Math.random(), event_type: type, resource}, {'paypal-transmission-sig': 'good', 'paypal-transmission-id': 't', 'paypal-transmission-time': 'now', 'paypal-cert-url': 'https://x', 'paypal-auth-algo': 'SHA256withRSA'})
await hook('BILLING.SUBSCRIPTION.PAYMENT.FAILED', {id: sub.id}); await settle()
ok('a failed automatic payment is reported to the SBWPC inbox', last('info@sbwpc.org').subject === 'Automatic payment failed: Bo Tester')
await hook('BILLING.SUBSCRIPTION.CANCELLED', {id: sub.id}); await settle()
ok('so is a cancelled plan', last('info@sbwpc.org').subject === 'Automatic payment cancelled: Bo Tester' && last('info@sbwpc.org').text.includes('$25 monthly'))
await hook('PAYMENT.SALE.COMPLETED', {id: 'SALE-M2', billing_agreement_id: [...paypal.subs.values()].find((x) => x.value === '16.00').id, amount: {total: '16.00'}}); await settle()
ok('a yearly automatic renewal emails its own receipt', last('auto@example.com').subject === 'Your SBWPC membership is renewed' && last('auto@example.com').text.includes('renews automatically each year'))

console.log('\n== When mail goes wrong ==')
google.state.failFor = 'unlucky@example.com'
const c = await pay({kind: 'donation', amount: 40, ...person({first_name: 'Unlucky', email: 'unlucky@example.com'})})
ok('a mail failure never blocks the payment', c.ok && (await sql(`select count(*)::int n from public.payments y join public.people p on p.id = y.person_id where p.email = 'unlucky@example.com'`))[0].n === 1)
await mailQueue(); await mailQueue(); await mailQueue()
const bad = (await sql(`select status, attempts, error from public.outbox where kind = 'receipt' and person_id = (select id from public.people where email = 'unlucky@example.com')`))[0]
ok('it is retried, then marked failed with the reason for the admin to see', bad.status === 'failed' && bad.attempts === 3 && bad.error.includes('gmail'), JSON.stringify(bad))
google.state.failFor = null

console.log('\n== Test mode and off ==')
process.env.MAIL_MODE = 'test'; process.env.MAIL_TEST_TO = 'luke-test@example.com'
await pay({kind: 'donation', amount: 30, ...person({first_name: 'Real', email: 'real.member@example.com'})})
ok('in test mode nothing reaches real people: it all goes to the test inbox, labelled', to('real.member@example.com').length === 0 && last('luke-test@example.com').subject.startsWith('[TEST for ') && to('luke-test@example.com').length === 2, to('luke-test@example.com').map((m) => m.subject).join(' | '))
delete process.env.MAIL_MODE
const n0 = mail.length
await pay({kind: 'donation', amount: 35, ...person({first_name: 'Quiet', email: 'quiet@example.com'})})
await sql(`update public.memberships set expires_on = $1 where person_id = (select id from public.people where email = 'gap@example.com')`, [shift(3)])
await reminders(); await mailQueue()
ok('with email switched off nothing is sent and nothing piles up for later', mail.length === n0 && (await count(`status = 'queued'`)) === 0 && (await count(`status = 'skipped' and error = 'email is switched off'`)) === 2 && (await sql(`select count(*)::int n from public.payments y join public.people p on p.id = y.person_id where p.email = 'quiet@example.com'`))[0].n === 1)

console.log('\n== Admin sign-in emails ==')
process.env.MAIL_MODE = 'test'
const hookBody = JSON.stringify({user: {email: 'info@sbwpc.org'}, email_data: {token: '305805', token_hash: 'abc123hash', redirect_to: 'https://sbwpc.org/admin/', email_action_type: 'invite', site_url: 'https://rbvhmrsepsategvrmqcv.supabase.co/auth/v1'}})
const sign = (body, id = 'msg_1', ts = Math.floor(Date.now() / 1000), secret = 'local-test-hook-secret') => ({'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': 'v1,' + createHmac('sha256', Buffer.from(secret)).update(`${id}.${ts}.${body}`).digest('base64')})
let a = await post('/api/auth/email', hookBody, sign(hookBody))
r = last('info@sbwpc.org')
ok('an invitation from Supabase is sent from info@sbwpc.org with a working link', a.status === 200 && r.subject === 'You are invited to the SBWPC admin' && r.text.includes('http://localhost:54330/auth/v1/verify?token=abc123hash&type=invite&redirect_to=https%3A%2F%2Fsbwpc.org%2Fadmin%2F'), JSON.stringify(a) + r?.text)
ok('sign-in emails always go to the real admin, even in test mode', r.to === 'info@sbwpc.org' && !r.subject.includes('TEST'))
const rec = JSON.stringify({user: {email: 'luke@coolhandlook.com'}, email_data: {token: '111222', token_hash: 'rechash', redirect_to: 'https://sbwpc.org/admin/', email_action_type: 'recovery'}})
await post('/api/auth/email', rec, sign(rec))
ok('a password reset email is sent', last('luke@coolhandlook.com')?.subject === 'Reset your SBWPC admin password' && last('luke@coolhandlook.com').text.includes('type=recovery'))
const m0 = mail.length
a = await post('/api/auth/email', hookBody, sign(hookBody, 'msg_2', undefined, 'wrong-secret'))
const tampered = await post('/api/auth/email', hookBody.replace('info@sbwpc.org', 'attacker@example.com'), sign(hookBody))
const stale = await post('/api/auth/email', hookBody, sign(hookBody, 'msg_3', Math.floor(Date.now() / 1000) - 3600))
const bare = await post('/api/auth/email', hookBody)
ok('a call that is unsigned, wrongly signed, altered or old sends nothing', [a.status, tampered.status, stale.status, bare.status].every((x) => x === 401) && mail.length === m0)

console.log(`\n${pass} passed, ${failed} failed`)
await site.close()
process.exit(failed ? 1 : 0)
