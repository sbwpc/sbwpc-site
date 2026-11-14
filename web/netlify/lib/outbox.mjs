// The mail queue. Rows are added to the outbox table by the database (receipts, notices), by the website
// (check instructions) and by the daily reminder job. This sends them and records what happened.
import {env, log} from './http.mjs'
import {db, must} from './db.mjs'
import {mailMode, sendMail, staffInbox} from './mail.mjs'
import {receipt, checkInstructions, reminder, staffNotice} from './emails.mjs'

export const siteUrl = () => (env('URL') || 'https://sbwpc.org').replace(/\/$/, '')
const one = async (table, id) => (id ? (await must(db().from(table).select('*').eq('id', id).limit(1)))[0] || null : null)
const AUTO_REMINDERS = ['30_day', '7_day', 'day_of', 'lapsed_14', 'pre_charge']

// Build the email for one outbox row from the records as they are now. Returns null when there is nobody to send to.
async function compose(row) {
  const [person, payment, membership, checkout] = await Promise.all([one('people', row.person_id), one('payments', row.payment_id), one('memberships', row.membership_id), one('checkouts', row.checkout_id)])
  const planId = payment?.recurring_plan_id || membership?.recurring_plan_id || row.data?.plan_id
  const plan = await one('recurring_plans', planId)
  const base = {person, payment, membership, plan, checkout, siteUrl: siteUrl()}
  if (row.kind === 'receipt') {
    if (!person?.email || !payment || payment.status !== 'completed') return null
    return {to: person.email, ...receipt({...base, renewal: Boolean(row.data?.renewal)})}
  }
  if (row.kind === 'check_instructions') {
    if (!checkout?.payload?.email || checkout.status !== 'pending') return null
    return {to: checkout.payload.email, ...checkInstructions({checkout})}
  }
  if (row.kind === 'reminder') {
    if (!person?.email || !membership || membership.state !== 'active' || !membership.expires_on) return null
    // The member may have renewed between the reminder being queued and being sent
    if (row.data?.for_expires_on && row.data.for_expires_on !== membership.expires_on) return null
    return {to: person.email, replyTo: staffInbox(), ...reminder({...base, type: row.data?.type || 'manual', plan: row.data?.type === 'pre_charge' ? plan : null})}
  }
  if (row.kind === 'staff_notice') {
    const event = row.data?.event
    if (event === 'check_pledge' ? !checkout : !person || (!payment && !plan)) return null
    return {to: staffInbox(), replyTo: person?.email || checkout?.payload?.email || undefined, ...staffNotice({...base, event})}
  }
  return null
}

export async function drain({limit = 20} = {}) {
  const mode = mailMode()
  const queued = await must(db().from('outbox').select('*').eq('status', 'queued').order('created_at').limit(limit))
  const result = {mode, sent: 0, skipped: 0, failed: 0, retry: 0}
  for (const row of queued) {
    // Claim the row. If another run already took it, this update matches nothing.
    const claimed = await must(db().from('outbox').update({status: 'sending', attempts: row.attempts + 1}).eq('id', row.id).eq('status', 'queued').eq('attempts', row.attempts).select('id'))
    if (!claimed.length) continue
    const finish = (patch) => must(db().from('outbox').update(patch).eq('id', row.id))
    try {
      if (mode === 'off') { await finish({status: 'skipped', error: 'email is switched off'}); result.skipped++; continue }
      const mail = await compose(row)
      if (!mail) { await finish({status: 'skipped', error: 'nothing to send, or no email address'}); result.skipped++; continue }
      const sent = await sendMail(mail)
      await finish({status: 'sent', sent_at: new Date().toISOString(), to_email: sent.to, subject: sent.subject, error: null})
      if (row.kind === 'reminder' && row.membership_id) {
        const type = row.data?.type || 'manual'
        await must(db().from('reminders').insert({membership_id: row.membership_id, kind: AUTO_REMINDERS.includes(type) ? type : 'manual', cycle_expires_on: row.data?.for_expires_on || new Date().toISOString().slice(0, 10)})).catch(() => {})
      }
      result.sent++
    } catch (err) {
      const giveUp = row.attempts + 1 >= 3
      await finish({status: giveUp ? 'failed' : 'queued', error: String(err.message || err).slice(0, 300)}).catch(() => {})
      result[giveUp ? 'failed' : 'retry']++
      log('mail.error', {outbox: row.id, kind: row.kind, message: err.message})
    }
  }
  if (queued.length) log('mail.queue', result)
  return result
}

// Send right after a payment instead of waiting for the next scheduled run. Never lets a mail problem surface to the visitor.
export function kick(context) {
  const run = drain().catch((err) => log('mail.kick_failed', {message: err.message}))
  if (context?.waitUntil) context.waitUntil(run)
  return run
}

export const queue = (row) => must(db().from('outbox').insert(row)).catch((err) => log('mail.queue_failed', {kind: row.kind, message: err.message}))

// Which reminder, if any, a membership is due today. One per day at most; each kind once per membership year.
export function reminderDue(m, plan) {
  const d = m.days_left
  if (m.state !== 'active' || d == null) return null
  if (m.auto_renew && plan && plan.status === 'active') return d >= 8 && d <= 30 ? 'pre_charge' : null
  if (d >= 8 && d <= 30) return '30_day'
  if (d >= 1 && d <= 7) return '7_day'
  if (d === 0) return 'day_of'
  if (d <= -14 && d >= -21) return 'lapsed_14'
  return null
}

export async function queueReminders() {
  const rows = await must(db().from('membership_status').select('*').eq('state', 'active').gte('days_left', -21).lte('days_left', 30))
  const plans = new Map((await must(db().from('recurring_plans').select('id,status,amount_cents'))).map((p) => [p.id, p]))
  let queued = 0
  for (const m of rows) {
    const type = reminderDue(m, plans.get(m.recurring_plan_id))
    if (!type) continue
    const dedupe = `${m.id}:${type}:${m.expires_on}`
    const {error} = await db().from('outbox').insert({kind: 'reminder', person_id: m.person_id, membership_id: m.id, dedupe, data: {type, for_expires_on: m.expires_on, plan_id: m.recurring_plan_id}})
    if (!error) queued++
    else if (error.code !== '23505') throw new Error('database: ' + error.message)
  }
  return {checked: rows.length, queued}
}
