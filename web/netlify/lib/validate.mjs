// Checks everything a visitor sends before any of it is stored or charged.
// Prices always come from our own list, never from the browser.
import {LEVELS, COMMITTEES, DONATION_MIN, DONATION_MAX} from '../../src/lib/giving.js'

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP'.split(' ')

export function validate(input) {
  const errors = {}
  const need = (key, value, message) => { if (!value) errors[key] = message }
  const b = input && typeof input === 'object' ? input : {}

  const kind = b.kind === 'dues' ? 'dues' : b.kind === 'donation' ? 'donation' : ''
  need('kind', kind, 'Choose membership or donation.')
  const pay = b.pay === 'check' ? 'check' : 'online'
  const frequency = ['once', 'monthly', 'yearly'].includes(b.frequency) ? b.frequency : 'once'
  if (kind === 'dues' && frequency === 'monthly') errors.frequency = 'Membership renews once a year.'
  if (pay === 'check' && frequency !== 'once') errors.frequency = 'A check covers one payment. Choose one time, or pay online to repeat it.'

  let amountCents = 0
  let level = ''
  if (kind === 'dues') {
    const found = LEVELS.find((l) => l.name === b.level)
    if (found) { level = found.name; amountCents = found.amount * 100 }
    else errors.level = 'Choose a membership level.'
  } else if (kind === 'donation') {
    const n = Number(String(b.amount ?? '').replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n) || n < DONATION_MIN) errors.amount = `Enter an amount of $${DONATION_MIN} or more.`
    else if (n > DONATION_MAX) errors.amount = `For gifts over $${DONATION_MAX.toLocaleString('en-US')}, please email info@sbwpc.org.`
    else amountCents = Math.round(n * 100)
  }

  const p = {
    first_name: clean(b.first_name, 80),
    last_name: clean(b.last_name, 80),
    email: clean(b.email, 160).toLowerCase(),
    phone: clean(b.phone, 30),
    address1: clean(b.address1, 120),
    address2: clean(b.address2, 120),
    city: clean(b.city, 80),
    state: clean(b.state, 2).toUpperCase(),
    zip: clean(b.zip, 10),
    occupation: clean(b.occupation, 120),
    employer: clean(b.employer, 120),
    email_opt_in: b.email_opt_in === true,
  }
  need('first_name', p.first_name, 'Enter your first name.')
  need('last_name', p.last_name, 'Enter your last name.')
  if (!EMAIL.test(p.email)) errors.email = 'Enter a valid email address.'
  need('address1', p.address1, 'Enter your street address.')
  need('city', p.city, 'Enter your city.')
  if (!STATES.includes(p.state)) errors.state = 'Enter a two-letter state, such as CA.'
  if (!/^\d{5}(-\d{4})?$/.test(p.zip)) errors.zip = 'Enter a 5-digit ZIP code.'
  need('occupation', p.occupation, 'Enter your occupation. If you are retired or not working, say so.')
  need('employer', p.employer, 'Enter your employer. If you are self-employed, enter your business name. If none, write None.')
  if (b.attest !== true) errors.attest = 'Please confirm the statement above before you continue.'

  if (kind === 'dues') {
    p.level = level
    p.committees = Array.isArray(b.committees) ? COMMITTEES.filter((c) => b.committees.includes(c)) : []
    const household = clean(b.household_name, 160)
    if (household) p.household_name = household
    const referred = clean(b.referred_by, 160)
    if (referred) p.referred_by = referred
  } else {
    const honoree = clean(b.in_honor_of, 160)
    if (honoree) p.in_honor_of = `${b.honor_type === 'memory' ? 'In memory of' : 'In honor of'} ${honoree}`
  }

  const mode = pay === 'check' ? 'check' : frequency === 'once' ? 'once' : 'subscription'
  if (mode === 'subscription') p.frequency = frequency
  return {ok: Object.keys(errors).length === 0, errors, kind, mode, frequency, amountCents, level, payload: p}
}

export const describe = (kind, level, frequency) =>
  kind === 'dues' ? `SBWPC ${level} membership${frequency === 'yearly' ? ', renews yearly' : ''}` : `SBWPC ${frequency === 'monthly' ? 'monthly ' : frequency === 'yearly' ? 'yearly ' : ''}donation`
