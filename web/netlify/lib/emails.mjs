// The wording and layout of every email the system sends. Each function returns {subject, text, html}.
// Change wording here. The client's approval document (handoff/membership-system/SBWPC-email-wording-for-approval.docx) is built from this file.
import {CHECK, JOIN_PATH, MANAGE_PATH, dollars} from '../../src/lib/giving.js'

const ORG = "Santa Barbara Women's Political Committee"
const ADDRESS = 'P.O. Box 90618, Santa Barbara, CA 93190-0618'
const CONTACT = 'info@sbwpc.org'
const METHODS = {paypal: 'PayPal', apple_pay: 'Apple Pay', card: 'Card', check: 'Check', cash: 'Cash', other: 'Other'}
// Approved wording, November 14, 2026
const NOT_DEDUCTIBLE = 'Thank you for making this work possible.'

export const longDate = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'}) : '')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]))
const first = (p) => (p?.first_name || '').trim() || 'there'
const fullName = (p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Someone'

// One shared layout: heading, paragraphs, an optional table of facts, an optional button, closing paragraphs.
function render({subject, heading, lead = [], facts = [], button, after = [], note}) {
  const sign = [ORG, ADDRESS, `${CONTACT} | sbwpc.org`]
  const text = [
    heading, '',
    ...lead.flatMap((p) => [p, '']),
    ...(facts.length ? [...facts.map(([k, v]) => `${k}: ${v}`), ''] : []),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...after.flatMap((p) => [p, '']),
    ...(note ? [note, ''] : []),
    ...sign,
  ].join('\n')
  const para = (p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#2c2e33">${esc(p)}</p>`
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eeeef3;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eeeef3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:6px solid #5e3795">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 20px;font-size:15px;font-weight:bold;letter-spacing:0.02em;color:#1e2c5b">SBWPC</p>
<h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#1e2c5b">${esc(heading)}</h1>
${lead.map(para).join('\n')}
${facts.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-top:1px solid #dcdde5">${facts.map(([k, v]) => `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid #dcdde5;font-size:15px;color:#5b5d63;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #dcdde5;font-size:15px;font-weight:bold;color:#1e2c5b;vertical-align:top">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : ''}
${button ? `<p style="margin:8px 0 24px"><a href="${esc(button.url)}" style="display:inline-block;padding:13px 22px;background:#5e3795;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:4px">${esc(button.label)}</a></p>` : ''}
${after.map(para).join('\n')}
${note ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#5b5d63">${esc(note)}</p>` : ''}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #dcdde5;font-size:13px;line-height:1.55;color:#5b5d63">${sign.map(esc).join('<br>')}</td></tr>
</table></td></tr></table></body></html>`
  return {subject, text, html}
}

const what = (payment, membership, plan) =>
  payment.kind === 'dues' ? `${membership?.level || 'SBWPC'} membership` : plan ? `${plan.frequency === 'monthly' ? 'Monthly' : 'Yearly'} donation` : 'Donation'
const paymentFacts = (payment, membership, plan) => [
  [payment.kind === 'dues' ? 'Membership' : 'Gift', what(payment, membership, plan)],
  ['Amount', dollars(payment.amount_cents) + (plan ? (plan.frequency === 'monthly' ? ' each month' : ' each year') : '')],
  ...(payment.in_honor_of ? [['Dedication', payment.in_honor_of]] : []),
  ['Date', longDate(payment.paid_on)],
  ['Paid by', METHODS[payment.method] || payment.method],
  ...(payment.paypal_capture_id ? [['Transaction number', payment.paypal_capture_id]] : []),
  ...(payment.kind === 'dues' && membership?.expires_on ? [['Membership good through', longDate(membership.expires_on)]] : []),
]
// The private link to the page where a member can see or cancel an automatic payment
export const manageUrl = (siteUrl, plan) => `${siteUrl}${MANAGE_PATH}#plan=${plan.manage_token}`
const every = (plan) => (plan.frequency === 'monthly' ? 'month' : 'year')
const testLine = (payment) => (payment.note === 'SANDBOX TEST' ? ['This was a test payment. No real money moved.'] : [])

// ---------- to members and donors ----------
export function receipt({person, payment, membership, plan, renewal, siteUrl}) {
  const byCheck = payment.method === 'check'
  if (payment.kind === 'dues') {
    const through = longDate(membership?.expires_on)
    return render({
      subject: renewal ? 'Your SBWPC membership is renewed' : `Welcome to SBWPC, ${first(person)}`,
      heading: renewal ? 'Your membership is renewed' : 'Welcome to SBWPC',
      lead: [
        ...testLine(payment),
        renewal
          ? `Thank you for renewing, ${first(person)}. ${byCheck ? 'We received your check. ' : ''}Your ${membership.level} membership now runs through ${through}.`
          : `Thank you for joining, ${first(person)}. ${byCheck ? 'We received your check. ' : ''}Your ${membership.level} membership is active through ${through}.`,
        ...(plan ? ['Your membership renews automatically each year through PayPal. You can turn that off any time with the button below.'] : []),
      ],
      facts: paymentFacts(payment, membership, plan),
      ...(plan ? {button: {label: 'Manage automatic renewal', url: manageUrl(siteUrl, plan)}} : {}),
      after: [
        ...(renewal ? [] : ['As a member you are welcome to share your input at our members-only endorsement meetings, join committees and take part in member programs. We are glad you are here.']),
        'Please keep this email as your receipt.',
      ],
      note: NOT_DEDUCTIBLE,
    })
  }
  return render({
    subject: 'Thank you for your gift to SBWPC',
    heading: 'Thank you for your gift',
    lead: [
      ...testLine(payment),
      `Thank you, ${first(person)}. ${byCheck ? 'We received your check for' : 'We received your gift of'} ${dollars(payment.amount_cents)}.`,
      'Your gift backs the candidates SBWPC members endorse and keeps voter education, advocacy and leadership training going across Santa Barbara County.',
      ...(plan ? [`This gift repeats each ${every(plan)} through PayPal. You can cancel it any time with the button below.`] : []),
    ],
    facts: paymentFacts(payment, null, plan),
    ...(plan ? {button: {label: `Manage my ${every(plan)}ly gift`, url: manageUrl(siteUrl, plan)}} : {}),
    after: ['Please keep this email as your receipt.'],
    note: NOT_DEDUCTIBLE,
  })
}

export function checkInstructions({checkout}) {
  const p = checkout.payload || {}
  const dues = checkout.kind === 'dues'
  const reference = checkout.id.slice(0, 8).toUpperCase()
  return render({
    subject: 'How to mail your check to SBWPC',
    heading: 'One more step: mail your check',
    lead: [`Thank you, ${first(p)}. We saved your details. Your ${dues ? 'membership starts' : 'gift is recorded'} when your check arrives, and we will email you a receipt then.`],
    facts: [
      ['For', dues ? `${p.level} membership` : 'Donation'],
      ['Amount', dollars(checkout.amount_cents)],
      ['Make it payable to', CHECK.payable],
      ['Mail it to', CHECK.address.join('\n')],
      ['Write on the memo line', reference],
    ],
    after: ['The memo line helps us match your check to your details. If you change your mind, you do not need to do anything.'],
    note: NOT_DEDUCTIBLE,
  })
}

export function reminder({type, person, membership, plan, siteUrl}) {
  const date = longDate(membership.expires_on)
  const url = `${siteUrl}${JOIN_PATH}?renew=${membership.renew_token}#join`
  const expired = membership.expires_on < new Date().toISOString().slice(0, 10)
  const because = 'You are getting this email because you are an SBWPC member. Questions? Just reply.'
  const checkLine = 'Prefer to mail a check? Choose "Mail a check" on the renewal page.'
  if (type === 'pre_charge') {
    return render({
      subject: `Your SBWPC membership renews on ${date}`,
      heading: 'Your membership renews soon',
      lead: [
        `Hi ${first(person)}, your ${membership.level} membership renews automatically on ${date}.`,
        `PayPal will charge ${plan ? dollars(plan.amount_cents) : 'your yearly dues'} to the payment method on your plan. You do not need to do anything.`,
      ],
      ...(plan ? {button: {label: 'Manage automatic renewal', url: manageUrl(siteUrl, plan)}} : {}),
      after: [plan ? `To stop the renewal, use the button above before ${date}, or reply to this email and we will help.` : `To stop the renewal, reply to this email before ${date} and we will help.`],
      note: because,
    })
  }
  if (type === 'lapsed_14' || (type === 'manual' && expired)) {
    return render({
      subject: 'We miss you at SBWPC',
      heading: 'Your membership has expired',
      lead: [`Hi ${first(person)}, your ${membership.level} membership expired on ${date}. We would love to have you back.`, 'Rejoining takes about two minutes.'],
      button: {label: 'Renew my membership', url},
      after: [checkLine, ...(type === 'lapsed_14' ? ['This is the last reminder we will send about this membership.'] : [])],
      note: because,
    })
  }
  const opening = {
    '30_day': `Hi ${first(person)}, your ${membership.level} membership expires on ${date}.`,
    '7_day': `Hi ${first(person)}, a quick reminder that your ${membership.level} membership expires on ${date}.`,
    day_of: `Hi ${first(person)}, your ${membership.level} membership expires today.`,
    manual: `Hi ${first(person)}, your ${membership.level} membership expires on ${date}.`,
  }[type]
  return render({
    subject: {'30_day': `Your SBWPC membership expires on ${date}`, '7_day': 'One week left on your SBWPC membership', day_of: 'Your SBWPC membership expires today', manual: `Your SBWPC membership expires on ${date}`}[type],
    heading: type === 'day_of' ? 'Your membership expires today' : 'Time to renew your membership',
    lead: [opening, 'Renewing takes about two minutes and keeps your membership running without a gap.'],
    button: {label: 'Renew my membership', url},
    after: [...(type === 'day_of' ? [] : ['If you renew early, you keep the time you have left. The new year is added to your current expiration date.']), checkLine],
    note: because,
  })
}

// The private link, sent when a member asks for it on the manage page or an admin sends it
export function planLink({person, plan, membership, siteUrl}) {
  const dues = plan.kind === 'dues'
  return render({
    subject: 'Your link to manage your SBWPC automatic payment',
    heading: 'Manage your automatic payment',
    lead: [
      `Hi ${first(person)}, here is your private link. It opens a page where you can see your automatic ${dues ? 'membership renewal' : 'gift'} and cancel it if you want to.`,
    ],
    facts: [
      [dues ? 'Membership' : 'Gift', dues ? `${membership?.level || 'SBWPC'} membership` : `${plan.frequency === 'monthly' ? 'Monthly' : 'Yearly'} donation`],
      ['Amount', `${dollars(plan.amount_cents)} each ${every(plan)}`],
    ],
    button: {label: 'Open my page', url: manageUrl(siteUrl, plan)},
    after: ['The link is private to you, so please do not forward this email.'],
    note: 'You are getting this email because someone asked for this link on sbwpc.org. If that was not you, you can ignore it. Nothing has changed.',
  })
}

// Confirmation after a member cancels an automatic payment on the manage page
export function planStopped({person, plan, membership, siteUrl}) {
  if (plan.kind === 'dues') {
    const through = longDate(membership?.expires_on)
    return render({
      subject: 'Automatic renewal is off for your SBWPC membership',
      heading: 'Automatic renewal is off',
      lead: [
        `Hi ${first(person)}, we turned off automatic renewal as you asked. PayPal will not charge you again for this membership.`,
        through ? `Your ${membership.level} membership stays active through ${through}. We will email you a reminder before it expires.` : 'Your membership stays active until its expiration date.',
      ],
      after: ['Changed your mind? You can choose automatic renewal again the next time you renew.'],
      note: 'If you did not ask for this, reply to this email and we will help.',
    })
  }
  return render({
    subject: `Your ${every(plan)}ly gift to SBWPC is cancelled`,
    heading: `Your ${every(plan)}ly gift is cancelled`,
    lead: [
      `Hi ${first(person)}, we cancelled your ${dollars(plan.amount_cents)} ${every(plan)}ly gift as you asked. PayPal will not charge you again.`,
      'Thank you for the support you have given SBWPC.',
    ],
    after: [`You are welcome back any time at ${siteUrl.replace(/^https?:\/\//, '')}/donate.`],
    note: 'If you did not ask for this, reply to this email and we will help.',
  })
}

// ---------- to the SBWPC inbox ----------
export function staffNotice({event, person, payment, membership, plan, checkout, siteUrl, by}) {
  const admin = (hash) => `${siteUrl}/admin/#/${hash}`
  if (event === 'check_pledge') {
    const p = checkout.payload || {}
    return render({
      subject: `Check on the way: ${dollars(checkout.amount_cents)} from ${fullName(p)}`,
      heading: 'Someone chose to mail a check',
      lead: [`${fullName(p)} filled in the ${checkout.kind === 'dues' ? 'membership' : 'donation'} form and chose to pay by check. Nothing counts as paid yet.`],
      facts: [['Name', fullName(p)], ['Email', p.email || ''], ['For', checkout.kind === 'dues' ? `${p.level} membership` : 'Donation'], ['Amount', dollars(checkout.amount_cents)], ['Memo reference', checkout.id.slice(0, 8).toUpperCase()]],
      button: {label: 'Open checks to confirm', url: admin('checks')},
      after: ['When the check arrives, mark it received in the admin. That creates the record and emails the receipt.'],
    })
  }
  if (event === 'plan_cancelled' || event === 'plan_failed') {
    const failed = event === 'plan_failed'
    return render({
      subject: `${failed ? 'Automatic payment failed' : 'Automatic payment cancelled'}: ${fullName(person)}`,
      heading: failed ? 'An automatic payment failed' : 'An automatic payment was cancelled',
      lead: [failed
        ? `PayPal could not collect the ${plan?.kind === 'dues' ? 'yearly dues' : 'recurring gift'} from ${fullName(person)}. PayPal will usually try again. If it keeps failing, you may want to get in touch.`
        : `${fullName(person)}'s ${plan?.kind === 'dues' ? 'membership will no longer renew automatically' : 'recurring gift has stopped'}. ${by === 'member' ? 'They cancelled it themselves on the website.' : 'This was changed in PayPal.'}${plan?.kind === 'dues' ? ' The membership stays active until it expires.' : ''}`],
      facts: [['Name', fullName(person)], ['Email', person?.email || ''], ['Plan', plan ? `${dollars(plan.amount_cents)} ${plan.frequency}` : '']],
      button: {label: 'Open their record', url: admin('person/' + person.id)},
    })
  }
  const title = event === 'donation' ? `New donation: ${dollars(payment.amount_cents)} from ${fullName(person)}` : event === 'renewal' ? `Membership renewed: ${fullName(person)}` : `New member: ${fullName(person)} (${membership?.level})`
  return render({
    subject: (payment.note === 'SANDBOX TEST' ? '[Sandbox test] ' : '') + title,
    heading: event === 'donation' ? 'A new donation came in' : event === 'renewal' ? 'A member renewed' : 'A new member joined',
    lead: [...testLine(payment), `${fullName(person)} paid ${dollars(payment.amount_cents)} on the website. The record is already in the admin and their receipt has been emailed.`],
    facts: [['Name', fullName(person)], ['Email', person?.email || ''], ...paymentFacts(payment, membership, plan)],
    button: {label: 'Open their record', url: admin('person/' + person.id)},
  })
}

// ---------- admin sign-in emails ----------
export function authEmail({action, link, code}) {
  if (action === 'invite') {
    return render({
      subject: 'You are invited to the SBWPC admin',
      heading: 'Set up your SBWPC admin sign-in',
      lead: ['You have been invited to the SBWPC members and donations admin.', 'Use the button to choose a password. Next you will set up two-step sign-in with an authenticator app on your phone, such as Google Authenticator.'],
      button: {label: 'Accept the invitation', url: link},
      after: ['The link works once. If it has expired, ask for a new invitation.'],
      note: 'If you were not expecting this, you can ignore this email.',
    })
  }
  if (action === 'recovery') {
    return render({
      subject: 'Reset your SBWPC admin password',
      heading: 'Reset your password',
      lead: ['Someone asked to reset the password for your SBWPC admin sign-in. If that was you, use the button to choose a new one.'],
      button: {label: 'Choose a new password', url: link},
      after: ['The link works once. If it has expired, ask for a new one from the sign-in page.'],
      note: 'If you did not ask for this, you can ignore this email. Your password stays the same.',
    })
  }
  return render({
    subject: 'Confirm your SBWPC admin sign-in',
    heading: 'Confirm it is you',
    lead: ['Use the button to continue to the SBWPC admin.', ...(code ? [`If you are asked for a code, enter ${code}.`] : [])],
    button: {label: 'Continue', url: link},
    note: 'If you were not expecting this, you can ignore this email.',
  })
}
