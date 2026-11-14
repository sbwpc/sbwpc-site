// The "manage my automatic payment" page. Reads the private link, asks the server what to show, and lets the
// member stop a plan after confirming. The server checks the link every time. Nothing here is trusted.
import {dollars} from '../lib/giving.js'

const root = document.querySelector('[data-manage]')
if (root) start(root)

function start(section) {
  const q = (sel) => section.querySelector(sel)
  const els = {note: q('.mg-note'), plans: q('.mg-plans'), list: q('.mg-list'), ask: q('.mg-ask'), email: q('#mg-email'), emailErr: q('#mg-email-err')}
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v
      else if (k === 'text') el.textContent = v
      else if (k === 'hidden') el.hidden = v
      else el.setAttribute(k, v)
    }
    el.append(...kids.filter(Boolean))
    return el
  }
  const longDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'}) : '')
  const say = (text, focus = false) => {
    els.note.textContent = text
    els.note.hidden = !text
    if (text && focus) els.note.focus({preventScroll: false})
  }
  async function post(path, body) {
    let res
    try {
      res = await fetch('/api/plan/' + path, {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json'}, body: JSON.stringify(body)})
    } catch {
      return {ok: false, message: 'We could not reach the server. Check your connection and try again.'}
    }
    let data = null
    try { data = await res.json() } catch { /* not json */ }
    if (res.status === 429) return {ok: false, message: 'Too many tries. Please wait a minute and try again.'}
    return data || {ok: false, message: 'Something went wrong. Please try again.'}
  }

  // The private link arrives after the # so it is never sent to a server as part of the address. It is taken
  // out of the address bar straight away and kept only for this tab.
  let token = ''
  function readLink() {
    const found = new URLSearchParams(location.hash.slice(1)).get('plan') || new URLSearchParams(location.search).get('plan') || ''
    if (found) {
      try { sessionStorage.setItem('sbwpc-plan', found) } catch { /* private mode */ }
      history.replaceState(null, '', location.pathname)
      return found
    }
    try { return sessionStorage.getItem('sbwpc-plan') || '' } catch { return '' }
  }
  const forget = () => { token = ''; try { sessionStorage.removeItem('sbwpc-plan') } catch { /* private mode */ } }

  // ---------- plans ----------
  const each = (p) => (p.frequency === 'monthly' ? 'month' : 'year')
  const title = (p) => (p.kind === 'dues' ? `${p.level || 'SBWPC'} membership` : `${p.frequency === 'monthly' ? 'Monthly' : 'Yearly'} gift`)
  function status(p) {
    if (p.status === 'cancelled') return p.kind === 'dues' ? `Automatic renewal is off${p.cancelled_on ? ' (stopped ' + longDate(p.cancelled_on) + ')' : ''}` : `Cancelled${p.cancelled_on ? ' on ' + longDate(p.cancelled_on) : ''}`
    if (p.status === 'failed') return 'PayPal could not collect the last payment. It usually tries again.'
    if (p.status === 'paused') return 'Paused in PayPal'
    return p.kind === 'dues' ? 'Renews automatically each year' : `Repeats each ${each(p)}`
  }
  function card(p) {
    const dues = p.kind === 'dues'
    const open = p.status !== 'cancelled'
    const facts = [
      ['Status', status(p)],
      ['Amount', `${dollars(p.amount_cents)} each ${each(p)}`],
      open && p.next_on && ['Next payment', longDate(p.next_on)],
      dues && p.good_through && ['Membership good through', longDate(p.good_through)],
      p.started_on && ['Started', longDate(p.started_on)],
    ].filter(Boolean)
    const heading = h('h2', {class: 'h3 give-form-title', id: 'mg-t-' + p.id, text: title(p)})
    const dl = h('dl', {class: 'co-facts'}, ...facts.map(([k, v]) => h('div', {}, h('dt', {text: k}), h('dd', {text: v}))))
    const el = h('article', {class: 'give-form-card co-card mg-plan', 'aria-labelledby': heading.id, 'data-status': p.status}, heading, dl)
    if (!open) {
      if (dues && p.good_through) el.append(h('p', {class: 'mg-after', text: `Your membership stays active through ${longDate(p.good_through)}. We will email you a reminder before it expires.`}))
      return el
    }
    const what = dues ? 'Stop automatic renewal' : 'Cancel this gift'
    const stop = h('button', {type: 'button', class: 'btn secondary mg-stop', text: what})
    const yes = h('button', {type: 'button', class: 'btn mg-yes', text: dues ? 'Yes, stop automatic renewal' : 'Yes, cancel this gift'})
    const no = h('button', {type: 'button', class: 'btn secondary mg-no', text: 'No, keep it'})
    const question = h('p', {class: 'mg-question', id: 'mg-q-' + p.id, tabindex: '-1'},
      h('strong', {text: dues ? 'Stop automatic renewal?' : `Cancel your ${each(p)}ly gift?`}),
      ' PayPal will not charge you again.' + (dues && p.good_through ? ` Your membership stays active through ${longDate(p.good_through)}.` : ''))
    const confirm = h('div', {class: 'mg-confirm', role: 'group', 'aria-labelledby': question.id, hidden: true}, question, h('div', {class: 'mg-actions'}, yes, no))
    const err = h('p', {class: 'co-err mg-err', role: 'alert', hidden: true})
    const actions = h('div', {class: 'mg-actions'}, stop)
    stop.addEventListener('click', () => { actions.hidden = true; confirm.hidden = false; err.hidden = true; question.focus() })
    no.addEventListener('click', () => { confirm.hidden = true; actions.hidden = false; stop.focus() })
    yes.addEventListener('click', async () => {
      yes.disabled = no.disabled = true
      yes.textContent = 'Working...'
      const res = await post('cancel', {token, planId: p.id})
      if (!res.ok) {
        yes.disabled = no.disabled = false
        yes.textContent = dues ? 'Yes, stop automatic renewal' : 'Yes, cancel this gift'
        err.textContent = res.message || 'We could not cancel it just now. Please try again.'
        err.hidden = false
        return
      }
      show(res)
      say(dues ? 'Done. Automatic renewal is off, and PayPal will not charge you again. We emailed you a confirmation.' : 'Done. Your gift is cancelled, and PayPal will not charge you again. We emailed you a confirmation.', true)
    })
    el.append(actions, confirm, err)
    return el
  }
  function show(data) {
    els.list.replaceChildren(...data.plans.map(card))
    els.plans.hidden = false
    els.ask.hidden = true
  }

  async function load() {
    token = readLink()
    if (!token) { els.plans.hidden = true; els.ask.hidden = false; return }
    say('Loading your details...')
    const res = await post('view', {token})
    if (!res.ok) {
      forget()
      say(res.message || 'We could not load your details. Enter your email below and we will send you a new link.')
      els.plans.hidden = true
      els.ask.hidden = false
      return
    }
    say(res.first_name ? `Hi ${res.first_name}. Here is what we have on file.` : 'Here is what we have on file.')
    show(res)
  }

  // ---------- email me my link ----------
  els.ask.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = els.email.value.trim()
    const bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
    els.emailErr.textContent = bad ? 'Enter a valid email address.' : ''
    els.emailErr.hidden = !bad
    if (bad) { els.email.setAttribute('aria-invalid', 'true'); els.email.focus(); return }
    els.email.removeAttribute('aria-invalid')
    const button = els.ask.querySelector('button[type="submit"]')
    button.disabled = true
    const res = await post('link', {email, website: els.ask.elements.website.value})
    button.disabled = false
    if (!res.ok) {
      els.emailErr.textContent = res.message || 'Something went wrong. Please try again.'
      els.emailErr.hidden = false
      return
    }
    els.ask.hidden = true
    say(res.message, true)
  })
  els.email.addEventListener('input', () => { els.emailErr.hidden = true; els.email.removeAttribute('aria-invalid') })

  addEventListener('hashchange', () => { if (location.hash.includes('plan=')) load() })
  load()
}
