// Automatic payments (PayPal subscriptions): what a member sees on the manage page, and stopping one.
// A member reaches their plans with the private manage link from their emails. Nothing here trusts the browser
// for anything except that link.
import {db, must} from './db.mjs'
import {log} from './http.mjs'
import {cancelSubscription, getSubscription, paypalReady} from './paypal.mjs'
import {queue} from './outbox.mjs'
import {todayPT} from './finish.mjs'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Plans a member can still do something about
const OPEN = ['active', 'paused', 'failed']
const one = async (query) => (await must(query.limit(1)))[0] || null
const datePT = (iso) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(new Date(iso))

export const planByToken = (token) => (UUID.test(token || '') ? one(db().from('recurring_plans').select('*').eq('manage_token', token)) : null)

// Record a plan's new status. Returns the plan if this call changed it, or null if it was already that way.
// PayPal often tells us the same thing more than once, and a member cancelling here is followed by PayPal's
// own message, so everything that hangs off a change (emails) happens only on the first one.
export async function setPlanStatus(subId, status, {by = 'paypal'} = {}) {
  if (!subId) return null
  const patch = {status}
  if (status === 'cancelled') patch.cancelled_on = todayPT()
  let change = db().from('recurring_plans').update(patch).eq('paypal_subscription_id', subId).neq('status', status)
  // A cancelled plan stays cancelled, whatever arrives later
  if (status !== 'cancelled') change = change.neq('status', 'cancelled')
  const plan = (await must(change.select('*')))[0]
  if (!plan) return null
  if (status !== 'failed') await must(db().from('memberships').update({auto_renew: false}).eq('recurring_plan_id', plan.id))
  if (status !== 'paused') await queue({kind: 'staff_notice', person_id: plan.person_id, data: {event: status === 'failed' ? 'plan_failed' : 'plan_cancelled', plan_id: plan.id, by}})
  return plan
}

// What PayPal says about a plan right now: its status and the next charge date. Null if PayPal cannot be reached.
async function live(plan) {
  if (!plan.paypal_subscription_id || !paypalReady()) return null
  try {
    const sub = await getSubscription(plan.paypal_subscription_id)
    return {status: sub?.status || '', next: sub?.billing_info?.next_billing_time ? datePT(sub.billing_info.next_billing_time) : null}
  } catch (err) {
    log('plan.lookup_failed', {plan: plan.id, message: err.message})
    return null
  }
}

// Everything the manage page shows for the person behind a link: first name and their plans. No contact details.
export async function summary(plan) {
  const person = await one(db().from('people').select('first_name').eq('id', plan.person_id))
  let plans = await must(db().from('recurring_plans').select('*').eq('person_id', plan.person_id).order('created_at', {ascending: false}))
  // Running plans first, then ended ones as a record of what happened
  plans = [...plans.filter((p) => OPEN.includes(p.status)), ...plans.filter((p) => !OPEN.includes(p.status) && p.status !== 'pending')].slice(0, 12)
  const memberships = plans.some((p) => p.kind === 'dues')
    ? await must(db().from('memberships').select('level,expires_on,state,recurring_plan_id').eq('person_id', plan.person_id).neq('state', 'cancelled').order('expires_on', {ascending: false}))
    : []
  const out = []
  for (const p of plans) {
    let status = p.status
    let cancelledOn = p.cancelled_on
    let next = p.next_charge_on
    if (OPEN.includes(status)) {
      const now = await live(p)
      // Cancelled in PayPal and we have not heard yet: record it now so the page tells the truth
      if (now && ['CANCELLED', 'EXPIRED'].includes(now.status)) {
        await setPlanStatus(p.paypal_subscription_id, 'cancelled')
        status = 'cancelled'
        cancelledOn = todayPT()
      } else if (now?.next) next = now.next
    }
    const m = p.kind === 'dues' ? memberships.find((x) => x.recurring_plan_id === p.id) || memberships[0] || null : null
    out.push({
      id: p.id, kind: p.kind, level: m?.level || null, amount_cents: p.amount_cents, frequency: p.frequency, status,
      started_on: p.started_on, next_on: status === 'active' ? next || null : null, good_through: m?.expires_on || null, cancelled_on: cancelledOn,
    })
  }
  return {first_name: person?.first_name || '', plans: out}
}

// Stop a plan because the member asked. PayPal is told first. Nothing is marked cancelled unless PayPal agrees.
export async function stopPlan(plan) {
  if (plan.status === 'cancelled') return false
  if (!plan.paypal_subscription_id) throw Object.assign(new Error('plan has no PayPal subscription'), {manual: true})
  try {
    await cancelSubscription(plan.paypal_subscription_id, 'Cancelled by the member on sbwpc.org')
  } catch (err) {
    // PayPal refuses to cancel a plan that has already ended. That is the result the member wanted.
    const sub = err.status === 422 ? await getSubscription(plan.paypal_subscription_id).catch(() => null) : null
    if (!['CANCELLED', 'EXPIRED'].includes(sub?.status)) throw err
  }
  await setPlanStatus(plan.paypal_subscription_id, 'cancelled', {by: 'member'})
  // One confirmation to the member, however many times the button is pressed
  const membership = plan.kind === 'dues' ? await one(db().from('memberships').select('id').eq('recurring_plan_id', plan.id)) : null
  const {error} = await db().from('outbox').insert({kind: 'plan_stopped', person_id: plan.person_id, membership_id: membership?.id || null, dedupe: 'plan_stopped:' + plan.id, data: {plan_id: plan.id}})
  if (error && error.code !== '23505') log('mail.queue_failed', {kind: 'plan_stopped', message: error.message})
  return true
}

// The plans a person could manage, newest first. Used when someone asks to be emailed their link.
export async function openPlansFor(email) {
  // The email column ignores letter case, so a plain match is enough
  const people = await must(db().from('people').select('id').eq('email', email))
  if (!people.length) return []
  return must(db().from('recurring_plans').select('id,person_id,status').in('person_id', people.map((p) => p.id)).in('status', OPEN).order('created_at', {ascending: false}))
}
