// Membership and donation checkout. The browser collects the form and shows the pay buttons.
// The server sets the price, talks to PayPal and records the payment. Nothing here is trusted by the server.
import {dollars} from '../lib/giving.js'

const API = '/api/checkout/'
const APPLE_SDK = 'https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js'

let configPromise
const getConfig = () =>
  (configPromise ||= fetch(API + 'config', {headers: {accept: 'application/json'}})
    .then((r) => (r.ok ? r.json() : {online: false, check: false}))
    .catch(() => ({online: false, check: false})))

const scripts = new Map()
function loadScript(src, attrs = {}) {
  if (scripts.has(src)) return scripts.get(src)
  const p = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.onload = resolve
    el.onerror = () => { scripts.delete(src); reject(new Error('script failed to load')) }
    document.head.appendChild(el)
  })
  scripts.set(src, p)
  return p
}
// One PayPal script for one-time payments (with Apple Pay) and another for recurring plans
async function paypalSdk(cfg, recurring) {
  const ns = recurring ? 'paypalRecurring' : 'paypalOnce'
  const q = new URLSearchParams({'client-id': cfg.clientId, currency: 'USD', 'disable-funding': 'paylater'})
  if (recurring) { q.set('components', 'buttons'); q.set('vault', 'true'); q.set('intent', 'subscription') }
  else { q.set('components', 'buttons,applepay'); q.set('intent', 'capture') }
  await loadScript('https://www.paypal.com/sdk/js?' + q, {'data-namespace': ns})
  return window[ns]
}

async function post(path, body) {
  let res
  try {
    res = await fetch(API + path, {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json'}, body: JSON.stringify(body)})
  } catch {
    return {ok: false, message: 'We could not reach the server. Check your connection and try again.'}
  }
  let data = null
  try { data = await res.json() } catch { /* not json */ }
  if (res.status === 429) return {ok: false, message: 'Too many tries. Please wait a minute and try again.'}
  return data || {ok: false, message: 'Something went wrong. Please try again.'}
}

function setup(section) {
  const kind = section.dataset.checkout
  const dues = kind === 'dues'
  const form = section.querySelector('.co-form')
  const q = (sel) => section.querySelector(sel)
  const els = {
    errors: q('.co-errors'), summary: q('.co-summary'), online: q('.co-online'), wait: q('.co-wait'), buttons: q('.co-buttons'),
    paypal: q('.co-paypal'), apple: q('.co-apple'), off: q('.co-off'), checkPay: q('.co-check-pay'), status: q('.co-status'),
    other: q('.co-other'), household: q('.co-household'), renew: q('.co-renew'), recurringNote: q('.co-recurring-note'), done: q('.co-done'),
  }
  let busy = false
  let rendered = ''
  let buttons = null
  let lastCheckout = null

  const fd = () => new FormData(form)
  function choice() {
    const f = fd()
    if (dues) {
      const input = form.querySelector('input[name=level]:checked')
      return {level: input?.value || '', cents: input ? Number(input.dataset.amount) * 100 : 0, frequency: f.get('auto_renew') && f.get('pay') !== 'check' ? 'yearly' : 'once'}
    }
    const preset = f.get('preset')
    const raw = preset === 'other' ? String(f.get('amount') || '').replace(/[$,\s]/g, '') : preset
    const n = Number(raw)
    return {cents: raw && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0, frequency: f.get('pay') === 'check' ? 'once' : f.get('frequency') || 'once'}
  }
  function payload(pay) {
    const f = fd()
    const c = choice()
    const text = (k) => String(f.get(k) || '').trim()
    return {
      kind, pay, frequency: c.frequency, level: c.level, amount: c.cents / 100,
      first_name: text('first_name'), last_name: text('last_name'), email: text('email'), phone: text('phone'),
      address1: text('address1'), address2: text('address2'), city: text('city'), state: text('state'), zip: text('zip'),
      occupation: text('occupation'), employer: text('employer'), email_opt_in: f.get('email_opt_in') === 'on',
      committees: f.getAll('committees'), household_name: els.household && !els.household.hidden ? text('household_name') : '', referred_by: text('referred_by'),
      in_honor_of: text('in_honor_of'), honor_type: f.get('honor_type'), attest: f.get('attest') === 'on', website: text('website'),
    }
  }

  // ---------- errors ----------
  const LABELS = {level: 'Membership level', amount: 'Amount', first_name: 'First name', last_name: 'Last name', email: 'Email', address1: 'Street address', city: 'City', state: 'State', zip: 'ZIP code', occupation: 'Occupation', employer: 'Employer', attest: 'Confirmation', frequency: 'How often'}
  function fieldFor(key) {
    if (key === 'level') return form.querySelector('input[name=level]')
    if (key === 'amount') return els.other && !els.other.hidden ? form.elements.amount : form.querySelector('input[name=preset]')
    if (key === 'frequency') return form.querySelector('input[name=frequency]') || form.querySelector('input[name=pay]')
    return form.elements[key] instanceof RadioNodeList ? form.elements[key][0] : form.elements[key]
  }
  function clearErrors() {
    els.errors.hidden = true
    els.errors.querySelector('ul').replaceChildren()
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'))
    form.querySelectorAll('.co-err').forEach((el) => { el.hidden = true; el.textContent = '' })
    form.querySelectorAll('.co-err.auto').forEach((el) => el.remove())
  }
  function showErrors(errors, focus = true) {
    clearErrors()
    const list = els.errors.querySelector('ul')
    for (const [key, message] of Object.entries(errors)) {
      const field = fieldFor(key)
      const li = document.createElement('li')
      if (field) {
        if (!field.id) field.id = `${form.id}-${key}`
        const a = document.createElement('a')
        a.href = '#' + field.id
        a.textContent = message
        a.addEventListener('click', (e) => { e.preventDefault(); field.focus() })
        li.appendChild(a)
        field.setAttribute('aria-invalid', 'true')
        // Put the message next to the field as well
        const slot = key === 'level' || (key === 'amount' && els.other?.hidden) ? q(`#${form.id}-choice-err`) : key === 'attest' ? q(`#${form.id}-attest-err`) : key === 'amount' ? q(`#${form.id}-amount-err`) : null
        if (slot) { slot.textContent = message; slot.hidden = false }
        else if (field.closest('.co-field')) {
          const p = document.createElement('p')
          p.className = 'co-err auto'
          p.id = field.id + '-err'
          p.textContent = message
          const host = field.closest('.co-pair > div') || field.closest('.co-field')
          host.appendChild(p)
          field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), p.id].filter((v) => v && v !== p.id).concat(p.id).join(' '))
        }
      } else li.textContent = message
      list.appendChild(li)
    }
    els.errors.hidden = false
    if (focus) { els.errors.focus(); els.errors.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}) }
  }
  // The same checks the server makes, so most mistakes are caught before PayPal opens
  function check() {
    const p = payload('online')
    const e = {}
    if (dues && !p.level) e.level = 'Choose a membership level.'
    if (!dues && !choice().cents) e.amount = 'Choose or enter an amount.'
    if (!p.first_name) e.first_name = 'Enter your first name.'
    if (!p.last_name) e.last_name = 'Enter your last name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) e.email = 'Enter a valid email address.'
    if (!p.address1) e.address1 = 'Enter your street address.'
    if (!p.city) e.city = 'Enter your city.'
    if (!/^\d{5}(-\d{4})?$/.test(p.zip)) e.zip = 'Enter a 5-digit ZIP code.'
    if (!p.occupation) e.occupation = 'Enter your occupation. If you are retired or not working, say so.'
    if (!p.employer) e.employer = 'Enter your employer. If none, write None.'
    if (!p.attest) e.attest = 'Please confirm the statement before you continue.'
    return e
  }
  function valid() {
    const e = check()
    if (Object.keys(e).length) { showErrors(e); return false }
    clearErrors()
    return true
  }
  function status(message) {
    els.status.textContent = message || ''
    els.status.hidden = !message
  }
  function fail(message) {
    busy = false
    form.removeAttribute('aria-busy')
    status('')
    showErrors({form: message})
  }

  // ---------- server steps ----------
  async function start(pay) {
    const res = await post('create', payload(pay))
    if (!res.ok) {
      if (res.errors) showErrors(res.errors)
      else showErrors({form: res.message})
      throw new Error('create failed')
    }
    lastCheckout = res
    return res
  }
  async function finish(ids) {
    busy = true
    form.setAttribute('aria-busy', 'true')
    status('Confirming your payment. Please keep this page open.')
    const res = await post('capture', {checkoutId: lastCheckout.checkoutId, ...ids})
    if (!res.ok) { fail(res.message); return false }
    receipt(res.receipt)
    return true
  }

  // ---------- receipt ----------
  const longDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})
  function receipt(r) {
    const isCheck = r.method === 'check'
    const what = r.kind === 'dues' ? `${r.level} membership` : r.frequency === 'monthly' ? 'Monthly donation' : r.frequency === 'yearly' ? 'Yearly donation' : 'Donation'
    const first = (r.name || '').split(' ')[0]
    q('.co-done-title').textContent = isCheck ? 'One more step: mail your check' : `Thank you${first ? ', ' + first : ''}`
    q('.co-done-lede').textContent = isCheck
      ? `We saved your details. Your ${r.kind === 'dues' ? 'membership starts' : 'gift will be recorded'} when your check arrives.`
      : r.pending
        ? 'PayPal approved your plan and is finishing the first payment. It will appear on your PayPal receipt within a few minutes.'
        : r.kind === 'dues' ? (r.renewal ? 'Your membership is renewed.' : 'Welcome to SBWPC. Your membership is active.') : 'Your gift is on its way to work in Santa Barbara County.'
    const methods = {paypal: 'PayPal', apple_pay: 'Apple Pay', card: 'Card', check: 'Check by mail'}
    const facts = [
      ['Name', r.name],
      [r.kind === 'dues' ? 'Membership' : 'Gift', what],
      [isCheck ? 'Amount to send' : 'Amount paid', dollars(r.amount_cents) + (r.frequency === 'monthly' ? ' each month' : r.frequency === 'yearly' ? ' each year' : '')],
      r.in_honor_of && ['Dedication', r.in_honor_of],
      !isCheck && r.paid_on && ['Date', longDate(r.paid_on)],
      [isCheck ? 'Paying by' : 'Paid with', methods[r.method] || 'PayPal'],
      r.expires_on && ['Membership good through', longDate(r.expires_on)],
      r.transaction_id && ['Transaction number', r.transaction_id],
      isCheck && ['Reference', r.reference],
    ].filter(Boolean)
    const dl = q('.co-facts')
    dl.replaceChildren()
    for (const [k, v] of facts) {
      const row = document.createElement('div')
      const dt = document.createElement('dt')
      const dd = document.createElement('dd')
      dt.textContent = k
      dd.textContent = v
      row.append(dt, dd)
      dl.appendChild(row)
    }
    q('.co-mail').hidden = !isCheck
    if (isCheck) q('.co-mail-memo').textContent = `Please write ${r.reference} on the memo line so we can match it to your details.`
    q('.co-done-note').textContent = (isCheck ? '' : 'Print or save this page for your records. If you paid with PayPal, PayPal also emails you a receipt. ') + `${r.kind === 'dues' ? 'Membership dues' : 'Contributions to SBWPC'} are not tax deductible. Questions? Email info@sbwpc.org.`
    form.hidden = true
    els.done.hidden = false
    const card = q('.co-receipt')
    card.focus({preventScroll: true})
    const top = els.done.getBoundingClientRect().top + scrollY - 120
    scrollTo({top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})
    busy = false
  }

  // ---------- pay buttons ----------
  async function renderButtons() {
    const c = choice()
    const pay = fd().get('pay')
    const recurring = c.frequency !== 'once'
    const key = pay === 'online' && c.cents ? (recurring ? 'recurring' : 'once') : ''
    els.online.hidden = pay !== 'online'
    els.checkPay.hidden = pay !== 'check'
    if (els.renew) els.renew.hidden = pay === 'check'
    if (els.recurringNote) els.recurringNote.hidden = dues || fd().get('frequency') === 'once'
    if (pay !== 'online') return
    if (!key) { els.wait.hidden = false; els.buttons.hidden = true; return }
    if (key === rendered) return
    rendered = key
    const cfg = await getConfig()
    if (key !== rendered) return
    if (!cfg.online || !cfg.clientId) { els.wait.hidden = true; els.buttons.hidden = true; els.off.hidden = false; return }
    let sdk
    try { sdk = await paypalSdk(cfg, recurring) } catch { rendered = ''; els.wait.hidden = true; els.off.hidden = false; return }
    if (key !== rendered) return
    if (buttons) { try { buttons.close() } catch { /* already gone */ } }
    els.paypal.replaceChildren()
    const common = {
      style: {layout: 'vertical', shape: 'rect', height: 48, label: recurring ? 'subscribe' : dues ? 'pay' : 'donate'},
      onClick: (data, actions) => (busy || !valid() ? actions.reject() : actions.resolve()),
      onCancel: () => status('Payment cancelled. Nothing was charged.'),
      onError: () => { if (els.errors.hidden) fail('PayPal could not complete the payment. Nothing was charged. Please try again.') },
    }
    buttons = sdk.Buttons(recurring
      ? {...common, createSubscription: async () => (await start('online')).subscriptionId, onApprove: (data) => finish({subscriptionId: data.subscriptionID})}
      : {...common, createOrder: async () => (await start('online')).orderId, onApprove: (data) => finish({orderId: data.orderID})})
    await buttons.render(els.paypal)
    els.wait.hidden = true
    els.off.hidden = true
    els.buttons.hidden = false
    els.apple.hidden = true
    if (!recurring) applePay(sdk).catch(() => { els.apple.hidden = true })
  }

  // Apple Pay shows only on Apple devices with a card set up, and only for one-time payments
  async function applePay(sdk) {
    if (!window.ApplePaySession || !sdk.Applepay) return
    await loadScript(APPLE_SDK)
    if (!ApplePaySession.canMakePayments()) return
    const applepay = sdk.Applepay()
    const cfg = await applepay.config()
    if (!cfg.isEligible) return
    els.apple.replaceChildren()
    const btn = document.createElement('apple-pay-button')
    btn.setAttribute('buttonstyle', 'black')
    btn.setAttribute('type', dues ? 'pay' : 'donate')
    btn.setAttribute('locale', 'en')
    btn.addEventListener('click', () => {
      if (busy || !valid()) return
      const c = choice()
      const session = new ApplePaySession(4, {
        countryCode: cfg.countryCode, currencyCode: 'USD', merchantCapabilities: cfg.merchantCapabilities, supportedNetworks: cfg.supportedNetworks,
        requiredBillingContactFields: ['postalAddress'],
        total: {label: 'SBWPC', type: 'final', amount: (c.cents / 100).toFixed(2)},
      })
      session.onvalidatemerchant = (event) =>
        applepay.validateMerchant({validationUrl: event.validationURL, displayName: 'SBWPC'})
          .then((r) => session.completeMerchantValidation(r.merchantSession))
          .catch(() => { session.abort(); fail('Apple Pay could not start. Nothing was charged. Please try PayPal or a card.') })
      session.onpaymentauthorized = async (event) => {
        try {
          const created = await start('online')
          await applepay.confirmOrder({orderId: created.orderId, token: event.payment.token, billingContact: event.payment.billingContact})
          const ok = await finish({orderId: created.orderId})
          session.completePayment(ok ? ApplePaySession.STATUS_SUCCESS : ApplePaySession.STATUS_FAILURE)
        } catch {
          session.completePayment(ApplePaySession.STATUS_FAILURE)
          if (els.errors.hidden) fail('Apple Pay could not complete the payment. Please try PayPal or a card.')
        }
      }
      session.oncancel = () => status('Payment cancelled. Nothing was charged.')
      session.begin()
    })
    els.apple.appendChild(btn)
    els.apple.hidden = false
  }

  // ---------- wiring ----------
  function refresh() {
    const c = choice()
    if (els.other) els.other.hidden = fd().get('preset') !== 'other'
    if (els.household) els.household.hidden = c.level !== 'Feminist Household'
    const freq = c.frequency === 'monthly' ? ' each month' : c.frequency === 'yearly' ? ' each year' : ''
    els.summary.textContent = !c.cents
      ? dues ? 'Choose a level above to see your total.' : 'Choose an amount above to see your total.'
      : dues ? `${c.level} membership: ${dollars(c.cents)}${c.frequency === 'yearly' ? ' each year, renewing automatically' : ' for one year'}` : `Your gift: ${dollars(c.cents)}${freq}`
    els.summary.classList.toggle('set', Boolean(c.cents))
    status('')
    renderButtons()
  }
  form.addEventListener('change', (e) => {
    if (e.target.name === 'preset' && e.target.value === 'other') requestAnimationFrame(() => form.elements.amount.focus())
    refresh()
  })
  form.addEventListener('input', (e) => { if (e.target.name === 'amount') refresh() })
  // Once someone fixes a field, take its warning away
  const settle = (e) => {
    const el = e.target
    const name = el.name === 'preset' ? 'amount' : el.name
    const first = fieldFor(name)
    if (!first || !first.hasAttribute('aria-invalid')) return
    first.removeAttribute('aria-invalid')
    const auto = document.getElementById(first.id + '-err')
    if (auto && auto.classList.contains('auto')) auto.remove()
    for (const id of name === 'level' || name === 'amount' ? [`${form.id}-choice-err`, `${form.id}-amount-err`] : name === 'attest' ? [`${form.id}-attest-err`] : []) {
      const slot = document.getElementById(id)
      if (slot) { slot.hidden = true; slot.textContent = '' }
    }
    els.errors.querySelector(`a[href="#${CSS.escape(first.id)}"]`)?.closest('li').remove()
    if (!els.errors.querySelector('li')) els.errors.hidden = true
  }
  form.addEventListener('input', settle)
  form.addEventListener('change', settle)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (busy || fd().get('pay') !== 'check' || !valid()) return
    busy = true
    status('Saving your details.')
    try {
      const res = await start('check')
      if (res.receipt) receipt(res.receipt)
      else { busy = false; status('') }
    } catch { busy = false; status('') }
  })
  q('.co-print').addEventListener('click', () => print())
  refresh()
}

document.querySelectorAll('[data-checkout]').forEach(setup)
