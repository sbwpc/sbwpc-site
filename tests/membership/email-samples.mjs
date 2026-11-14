// Renders every email with made-up example data. Used to preview the designs and to build the wording
// document the client approves. Run: node email-samples.mjs <output folder>
import fs from 'node:fs'
import path from 'node:path'
import {receipt, checkInstructions, reminder, staffNotice, authEmail} from '../../web/netlify/lib/emails.mjs'

const out = process.argv[2] || './email-samples'
fs.mkdirSync(out, {recursive: true})
const siteUrl = 'https://sbwpc.org'
const person = {id: '3f0c2a1e-0000-4000-8000-000000000001', first_name: 'Maria', last_name: 'Alvarez', email: 'maria@example.com'}
const membership = {level: 'Advocate', expires_on: '2027-11-14', renew_token: '11111111-2222-4333-8444-555555555555', state: 'active'}
const dues = {kind: 'dues', amount_cents: 4000, paid_on: '2026-11-14', method: 'paypal', paypal_capture_id: '8XK42719DP583021A'}
const gift = {kind: 'donation', amount_cents: 10000, paid_on: '2026-11-14', method: 'paypal', paypal_capture_id: '5RT90212KL447710B', in_honor_of: 'In honor of Susan Rose'}
const yearly = {kind: 'dues', frequency: 'yearly', amount_cents: 4000}
const monthly = {kind: 'donation', frequency: 'monthly', amount_cents: 2500}
const checkout = {id: 'a1b2c3d4-0000-4000-8000-000000000002', kind: 'dues', amount_cents: 4000, payload: {...person, level: 'Advocate'}}
const soon = {...membership, expires_on: '2027-11-14'}

const list = [
  ['Members and donors', 'receipt-new-member', 'Welcome receipt', 'Right after someone joins and pays online, or when an admin marks their check received.', receipt({person, payment: dues, membership, siteUrl})],
  ['Members and donors', 'receipt-renewal', 'Renewal receipt', 'Right after a member renews.', receipt({person, payment: dues, membership: {...membership, expires_on: '2028-11-14'}, renewal: true, siteUrl})],
  ['Members and donors', 'receipt-auto-renew', 'Welcome receipt, with automatic renewal', 'When someone joins and chooses to renew automatically each year.', receipt({person, payment: dues, membership, plan: yearly, siteUrl})],
  ['Members and donors', 'receipt-donation', 'Donation receipt', 'Right after a one-time gift.', receipt({person, payment: gift, siteUrl})],
  ['Members and donors', 'receipt-monthly', 'Donation receipt, monthly gift', 'After each monthly or yearly gift is charged.', receipt({person, payment: {...gift, amount_cents: 2500, in_honor_of: null}, plan: monthly, siteUrl})],
  ['Members and donors', 'receipt-check', 'Receipt for a mailed check', 'When an admin marks a check received.', receipt({person, payment: {...dues, method: 'check', paypal_capture_id: null}, membership, siteUrl})],
  ['Members and donors', 'check-instructions', 'How to mail your check', 'Right after someone fills in the form and chooses "Mail a check".', checkInstructions({checkout})],
  ['Renewal reminders', 'reminder-30', 'Reminder, 30 days before', '30 days before a membership expires. Not sent to members on automatic renewal.', reminder({type: '30_day', person, membership: soon, siteUrl})],
  ['Renewal reminders', 'reminder-7', 'Reminder, 7 days before', '7 days before a membership expires, if they have not renewed.', reminder({type: '7_day', person, membership: soon, siteUrl})],
  ['Renewal reminders', 'reminder-day', 'Reminder, on the day', 'The day a membership expires, if they have not renewed.', reminder({type: 'day_of', person, membership: soon, siteUrl})],
  ['Renewal reminders', 'reminder-lapsed', 'Reminder, 14 days after', '14 days after a membership expired. This is the last one.', reminder({type: 'lapsed_14', person, membership: {...membership, expires_on: '2026-10-01'}, siteUrl})],
  ['Renewal reminders', 'reminder-auto', 'Automatic renewal heads-up', 'About 30 days before PayPal charges a member on automatic renewal.', reminder({type: 'pre_charge', person, membership: soon, plan: yearly, siteUrl})],
  ['Notices to the SBWPC inbox', 'notice-new-member', 'New member', 'To info@sbwpc.org when someone joins on the website.', staffNotice({event: 'new_member', person, payment: dues, membership, siteUrl})],
  ['Notices to the SBWPC inbox', 'notice-renewal', 'Membership renewed', 'To info@sbwpc.org when a member renews on the website.', staffNotice({event: 'renewal', person, payment: dues, membership: {...membership, expires_on: '2028-11-14'}, siteUrl})],
  ['Notices to the SBWPC inbox', 'notice-donation', 'New donation', 'To info@sbwpc.org when a gift comes in on the website.', staffNotice({event: 'donation', person, payment: gift, siteUrl})],
  ['Notices to the SBWPC inbox', 'notice-check', 'Check on the way', 'To info@sbwpc.org when someone chooses "Mail a check".', staffNotice({event: 'check_pledge', checkout, siteUrl})],
  ['Notices to the SBWPC inbox', 'notice-failed', 'Automatic payment failed', 'To info@sbwpc.org when PayPal cannot collect a recurring payment.', staffNotice({event: 'plan_failed', person, plan: monthly, siteUrl})],
  ['Notices to the SBWPC inbox', 'notice-cancelled', 'Automatic payment cancelled', 'To info@sbwpc.org when someone cancels a recurring payment in PayPal.', staffNotice({event: 'plan_cancelled', person, plan: yearly, siteUrl})],
  ['Admin sign-in', 'auth-invite', 'Admin invitation', 'When a new admin is invited to the members and donations admin.', authEmail({action: 'invite', link: 'https://sbwpc.org/admin/ (private link)'})],
  ['Admin sign-in', 'auth-reset', 'Password reset', 'When an admin asks to reset their password.', authEmail({action: 'recovery', link: 'https://sbwpc.org/admin/ (private link)'})],
]
const index = []
for (const [group, slug, name, when, mail] of list) {
  fs.writeFileSync(path.join(out, slug + '.html'), mail.html)
  index.push({group, slug, name, when, subject: mail.subject, text: mail.text.replace(/https:\/\/sbwpc\.org\/[a-z-]+\/\?renew=[0-9a-f-]+#join/, 'https://sbwpc.org/join/ (with their private renewal code)')})
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1))
console.log(index.length, 'emails written to', out)
