// SBWPC admin screens: overview, members, donors and payments, checks to confirm, and one page per person.
// Everything is read and written through the database's own access rules. This script cannot bypass them.
import {h, money, toCents, day, when, todayPT, fullName, sortName, STATUS, METHODS, chip, statusChip, field, input, select, table, sortRows, downloadCsv} from './ui.js'
import {LEVELS, COMMITTEES, levelAmount} from '../../lib/giving.js'

let sb = null
let role = null
let root = null
let started = false
const S = {people: [], memberships: [], payments: [], checks: [], plans: [], log: [], admins: [], person: new Map(), totals: new Map(), memberOf: new Map()}
const canEdit = () => role === 'admin'
const thisYear = () => Number(todayPT().slice(0, 4))
const REPORT_CENTS = 10000

// ---------- data ----------
async function all(table, order) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select('*')
    if (order) q = q.order(order[0], {ascending: order[1] !== 'desc'})
    const {data, error} = await q.range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
async function load() {
  const [people, memberships, payments, checks, plans, log, admins] = await Promise.all([
    all('people', ['last_name']),
    all('membership_status', ['expires_on']),
    all('payments', ['paid_on', 'desc']),
    sb.from('checkouts').select('*').eq('mode', 'check').eq('status', 'pending').order('created_at', {ascending: false}),
    all('recurring_plans'),
    sb.from('audit_log').select('*').order('at', {ascending: false}).limit(15),
    sb.from('admins').select('*').order('email'),
  ])
  for (const r of [checks, log, admins]) if (r.error) throw r.error
  Object.assign(S, {people, memberships, payments, checks: checks.data, plans, log: log.data, admins: admins.data})
  S.person = new Map(people.map((p) => [p.id, p]))
  S.totals = new Map()
  for (const p of payments) {
    if (p.status !== 'completed') continue
    const k = p.person_id + '|' + p.paid_on.slice(0, 4)
    S.totals.set(k, (S.totals.get(k) || 0) + p.amount_cents)
  }
  // Each person's current membership: the one that runs latest
  S.memberOf = new Map()
  for (const m of memberships) {
    const cur = S.memberOf.get(m.person_id)
    if (!cur || (m.expires_on || '') > (cur.expires_on || '')) S.memberOf.set(m.person_id, m)
  }
  const n = document.getElementById('nav-checks-n')
  n.textContent = S.checks.length ? String(S.checks.length) : ''
  n.hidden = !S.checks.length
}
const yearTotal = (personId, year) => S.totals.get(personId + '|' + year) || 0
const nice = (e) => {
  const m = (e && e.message) || String(e || '')
  if (/row-level security|permission denied|only an admin/i.test(m)) return 'Your account can view records but cannot change them.'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Could not reach the server. Check your connection and try again.'
  if (/JWT|expired/i.test(m)) return 'Your session ended. Sign in again.'
  if (/people_email|duplicate key/i.test(m)) return 'That record already exists.'
  return m || 'Something went wrong. Try again.'
}

// ---------- shell ----------
let flashTimer
function flash(message) {
  const el = document.getElementById('a-flash')
  el.textContent = message
  el.hidden = false
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { el.hidden = true }, 6000)
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash }
function parse() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  return {parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '')}
}
function page(title, sub, ...content) {
  return h('div', {}, h('h1', {tabindex: '-1', text: title}), sub ? h('p', {class: 'a-sub'}, sub) : null, content)
}
const panel = (title, ...content) => h('section', {class: 'a-panel'}, title ? h('h2', {text: title}) : null, content)
const linkTo = (hash, text, cls = '') => h('a', {href: hash, class: cls, text})
const personLink = (p) => (p ? linkTo('#/person/' + p.id, fullName(p), 'a-name') : '(unknown)')

function form(fields, {submit = 'Save', cancel, onSubmit, note}) {
  const err = h('p', {class: 'a-error', role: 'alert', tabindex: '-1', hidden: true})
  const btn = h('button', {type: 'submit', class: 'a-btn inline', text: submit})
  const f = h('form', {class: 'a-form', novalidate: true}, h('div', {class: 'a-grid'}, fields), note ? h('p', {class: 'a-hint', text: note}) : null, err,
    h('div', {class: 'a-actions'}, btn, cancel ? h('a', {class: 'a-btn ghost inline', href: cancel, text: 'Cancel'}) : null))
  f.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.hidden = true
    btn.disabled = true
    try {
      await onSubmit(new FormData(f), f)
    } catch (ex) {
      err.textContent = nice(ex)
      err.hidden = false
      err.focus()
    } finally {
      btn.disabled = false
    }
  })
  return f
}
const blank = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
const must = async (query) => { const {data, error} = await query; if (error) throw error; return data }

// ---------- overview ----------
function overview() {
  const year = thisYear()
  const count = (s) => S.memberships.filter((m) => m.status === s).length
  const sum = (kind) => S.payments.filter((p) => p.kind === kind && p.status === 'completed' && p.paid_on.startsWith(String(year))).reduce((a, p) => a + p.amount_cents, 0)
  const reportable = [...S.totals].filter(([k, v]) => k.endsWith('|' + year) && v >= REPORT_CENTS).length
  const tile = (num, label, href, tone = '') => h('a', {class: 'a-tile ' + tone, href}, h('p', {class: 'a-num', text: num}), h('p', {class: 'a-lab', text: label}))
  const verbs = {insert: 'Added', update: 'Changed', delete: 'Removed'}
  const things = {people: 'a person', memberships: 'a membership', payments: 'a payment', recurring_plans: 'a recurring plan', admins: 'an admin', checkouts: 'a check'}
  const subject = (r) => {
    const row = r.after || r.before || {}
    const p = r.table_name === 'people' ? S.person.get(r.row_id) || row : S.person.get(row.person_id) || (row.payload ? row.payload : null)
    return p && (p.first_name || p.last_name) ? (p.id ? personLink(p) : fullName(p)) : ''
  }
  return page('Members and donations', `Signed in as ${role === 'admin' ? 'an admin' : 'treasurer (view only)'} with two-factor. Money figures are for ${year}.`,
    h('div', {class: 'a-tiles'},
      tile(count('active') + count('expiring_soon'), 'Active members', '#/members?status=current'),
      tile(count('expiring_soon'), 'Expiring in 30 days', '#/members?status=expiring_soon', 'warn'),
      tile(count('expired'), 'Expired', '#/members?status=expired', 'bad'),
      tile(money(sum('dues')), 'Dues this year', '#/payments?kind=dues'),
      tile(money(sum('donation')), 'Donations this year', '#/payments?kind=donation'),
      tile(reportable, 'Contributors at $100 or more', '#/payments?view=people&flag=1'),
      tile(S.checks.length, 'Checks to confirm', '#/checks', S.checks.length ? 'warn' : '')),
    panel('Download lists',
      h('p', {class: 'a-hint', text: 'Files open in Excel, Numbers or Google Sheets. They hold personal details, so store them carefully and delete them when you are done.'}),
      h('div', {class: 'a-actions'},
        h('button', {type: 'button', class: 'a-btn ghost inline', text: 'Members', onclick: () => exportMembers(S.memberships)}),
        h('button', {type: 'button', class: 'a-btn ghost inline', text: `Payments with FPPC details, ${year}`, onclick: () => exportPayments(year)}),
        h('button', {type: 'button', class: 'a-btn ghost inline', text: `Payments with FPPC details, ${year - 1}`, onclick: () => exportPayments(year - 1)}),
        h('button', {type: 'button', class: 'a-btn ghost inline', text: 'Email list (permission given)', onclick: exportEmails}))),
    panel('Recent activity', table({
      label: 'Recent activity', empty: 'No changes recorded yet.', rows: S.log,
      columns: [
        {key: 'at', label: 'When', cell: (r) => when(r.at)},
        {key: 'actor', label: 'Who', cell: (r) => (r.actor === 'system' ? 'Website or import' : r.actor)},
        {key: 'what', label: 'What', cell: (r) => `${verbs[r.action] || r.action} ${things[r.table_name] || r.table_name}`},
        {key: 'for', label: 'For', cell: subject},
      ],
    })),
    panel('Admins', h('ul', {class: 'a-list'}, S.admins.map((a) => h('li', {text: `${a.email} (${a.role === 'admin' ? 'admin' : 'treasurer, view only'}${a.active ? '' : ', turned off'})`}))),
      h('p', {class: 'a-hint', text: 'Admins are added and removed in the Supabase dashboard, not here.'})))
}

// ---------- members ----------
const M = {q: '', status: '', level: '', committee: '', sort: {key: 'name', dir: 1}}
const memberCols = [
  {key: 'name', label: 'Name', sort: (m) => sortName(S.person.get(m.person_id)), cell: (m) => personLink(S.person.get(m.person_id))},
  {key: 'email', label: 'Email', sort: (m) => (S.person.get(m.person_id)?.email || '').toLowerCase(), cell: (m) => S.person.get(m.person_id)?.email || ''},
  {key: 'level', label: 'Level', sort: (m) => LEVELS.findIndex((l) => l.name === m.level), cell: (m) => m.level},
  {key: 'status', label: 'Status', sort: (m) => Object.keys(STATUS).indexOf(m.status), cell: (m) => statusChip(m.status)},
  {key: 'expires', label: 'Expires', sort: (m) => m.expires_on || '', cell: (m) => day(m.expires_on)},
  {key: 'renew', label: 'Auto-renew', sort: (m) => (m.auto_renew ? 0 : 1), cell: (m) => (m.auto_renew ? 'Yes' : 'No')},
  {key: 'committees', label: 'Committees', sort: (m) => (m.committees || []).join(', ').toLowerCase(), cell: (m) => (m.committees || []).join(', ')},
]
function filteredMembers() {
  const q = M.q.trim().toLowerCase()
  return S.memberships.filter((m) => {
    const p = S.person.get(m.person_id) || {}
    if (M.status === 'current' ? !['active', 'expiring_soon'].includes(m.status) : M.status && m.status !== M.status) return false
    if (M.level && m.level !== M.level) return false
    if (M.committee && !(m.committees || []).includes(M.committee)) return false
    if (q && !`${p.first_name} ${p.last_name} ${p.email || ''} ${m.household_name || ''}`.toLowerCase().includes(q)) return false
    return true
  })
}
function members(q) {
  if (q.has('status')) Object.assign(M, {status: q.get('status'), q: '', level: '', committee: ''})
  const out = h('div', {})
  const count = h('p', {class: 'a-count', role: 'status'})
  const update = () => {
    const rows = sortRows(filteredMembers(), memberCols, M.sort)
    count.textContent = `${rows.length} ${rows.length === 1 ? 'membership' : 'memberships'}`
    out.replaceChildren(table({label: 'Members', columns: memberCols, rows, sort: M.sort, empty: 'No members match.', onSort: (key) => { M.sort = {key, dir: M.sort.key === key ? -M.sort.dir : 1}; update() }}))
  }
  const bind = (el, key) => { el.addEventListener('input', () => { M[key] = el.value; update() }); return el }
  update()
  return page('Members', null,
    h('div', {class: 'a-panel'},
      h('div', {class: 'a-filters'},
        field('Search name or email', bind(input('q', M.q, {type: 'search', autocomplete: 'off'}), 'q'), {wide: true}),
        field('Status', bind(select('status', [['', 'All'], ['current', 'Active (all current)'], ['expiring_soon', 'Expiring in 30 days'], ['expired', 'Expired'], ['pending', 'Pending'], ['cancelled', 'Cancelled']], M.status), 'status')),
        field('Level', bind(select('level', [['', 'All'], ...LEVELS.map((l) => l.name)], M.level), 'level')),
        field('Committee', bind(select('committee', [['', 'All'], ...COMMITTEES], M.committee), 'committee'))),
      h('div', {class: 'a-bar'}, count, h('button', {type: 'button', class: 'a-btn ghost small', text: 'Download these', onclick: () => exportMembers(sortRows(filteredMembers(), memberCols, M.sort))})),
      out))
}

// ---------- donors and payments ----------
const P = {view: 'payments', q: '', kind: '', method: '', from: '', to: '', min: '', max: '', flag: false, year: 0, sort: {key: 'date', dir: -1}, psort: {key: 'total', dir: -1}}
const reportChip = (cents) => (cents >= REPORT_CENTS ? chip('$100+ report', 'flag') : null)
const payCols = [
  {key: 'date', label: 'Date', sort: (p) => p.paid_on, cell: (p) => day(p.paid_on)},
  {key: 'name', label: 'Name', sort: (p) => sortName(S.person.get(p.person_id)), cell: (p) => personLink(S.person.get(p.person_id))},
  {key: 'kind', label: 'Type', sort: (p) => p.kind, cell: (p) => (p.kind === 'dues' ? 'Dues' : 'Donation')},
  {key: 'method', label: 'Paid by', sort: (p) => p.method, cell: (p) => METHODS[p.method] || p.method},
  {key: 'amount', label: 'Amount', num: true, sort: (p) => p.amount_cents, cell: (p) => [money(p.amount_cents), p.status !== 'completed' ? [' ', chip(p.status, 'bad')] : null]},
  {key: 'total', label: 'Total for the year', num: true, sort: (p) => yearTotal(p.person_id, p.paid_on.slice(0, 4)), cell: (p) => { const t = yearTotal(p.person_id, p.paid_on.slice(0, 4)); return [money(t), ' ', reportChip(t)] }},
]
function filteredPayments() {
  const q = P.q.trim().toLowerCase()
  const min = toCents(P.min), max = toCents(P.max)
  return S.payments.filter((p) => {
    const person = S.person.get(p.person_id) || {}
    if (P.kind && p.kind !== P.kind) return false
    if (P.method && p.method !== P.method) return false
    if (P.from && p.paid_on < P.from) return false
    if (P.to && p.paid_on > P.to) return false
    if (min && p.amount_cents < min) return false
    if (max && p.amount_cents > max) return false
    if (P.flag && yearTotal(p.person_id, p.paid_on.slice(0, 4)) < REPORT_CENTS) return false
    if (q && !`${person.first_name} ${person.last_name} ${person.email || ''} ${p.in_honor_of || ''} ${p.note || ''}`.toLowerCase().includes(q)) return false
    return true
  })
}
function donorRows() {
  const q = P.q.trim().toLowerCase()
  const by = new Map()
  for (const p of S.payments) {
    if (p.status !== 'completed' || p.paid_on.slice(0, 4) !== String(P.year)) continue
    const r = by.get(p.person_id) || {id: p.person_id, total: 0, dues: 0, gifts: 0, n: 0, last: ''}
    r.total += p.amount_cents
    r[p.kind === 'dues' ? 'dues' : 'gifts'] += p.amount_cents
    r.n++
    if (p.paid_on > r.last) r.last = p.paid_on
    by.set(p.person_id, r)
  }
  return [...by.values()].filter((r) => {
    const person = S.person.get(r.id) || {}
    if (P.flag && r.total < REPORT_CENTS) return false
    if (P.kind === 'dues' && !r.dues) return false
    if (P.kind === 'donation' && !r.gifts) return false
    if (q && !`${person.first_name} ${person.last_name} ${person.email || ''}`.toLowerCase().includes(q)) return false
    return true
  })
}
const donorCols = [
  {key: 'name', label: 'Name', sort: (r) => sortName(S.person.get(r.id)), cell: (r) => personLink(S.person.get(r.id))},
  {key: 'total', label: 'Total for the year', num: true, sort: (r) => r.total, cell: (r) => [money(r.total), ' ', reportChip(r.total)]},
  {key: 'dues', label: 'Dues', num: true, sort: (r) => r.dues, cell: (r) => money(r.dues)},
  {key: 'gifts', label: 'Donations', num: true, sort: (r) => r.gifts, cell: (r) => money(r.gifts)},
  {key: 'n', label: 'Payments', num: true, sort: (r) => r.n, cell: (r) => r.n},
  {key: 'last', label: 'Last payment', sort: (r) => r.last, cell: (r) => day(r.last)},
]
function payments(q) {
  if (!P.year) P.year = thisYear()
  if (q.has('kind') || q.has('view') || q.has('flag')) Object.assign(P, {view: q.get('view') || 'payments', kind: q.get('kind') || '', flag: q.get('flag') === '1', q: '', method: '', from: q.has('kind') ? `${thisYear()}-01-01` : '', to: '', min: '', max: '', year: thisYear()})
  const out = h('div', {})
  const count = h('p', {class: 'a-count', role: 'status'})
  const filters = h('div', {class: 'a-filters'})
  const years = [...new Set([thisYear(), ...S.payments.map((p) => Number(p.paid_on.slice(0, 4)))])].sort((a, b) => b - a)
  const bind = (el, key, type = 'value') => { el.addEventListener(type === 'checked' ? 'change' : 'input', () => { P[key] = type === 'checked' ? el.checked : el.value; update() }); return el }
  const flagBox = () => { const box = h('input', {type: 'checkbox', name: 'flag'}); box.checked = P.flag; return h('label', {class: 'a-checkline'}, bind(box, 'flag', 'checked'), h('span', {text: 'Only people at $100 or more for the year'})) }
  function update() {
    if (P.view === 'payments') {
      const rows = sortRows(filteredPayments(), payCols, P.sort)
      const total = rows.filter((p) => p.status === 'completed').reduce((a, p) => a + p.amount_cents, 0)
      count.textContent = `${rows.length} ${rows.length === 1 ? 'payment' : 'payments'}, ${money(total)} total`
      out.replaceChildren(table({label: 'Payments', columns: payCols, rows, sort: P.sort, empty: 'No payments match.', onSort: (key) => { P.sort = {key, dir: P.sort.key === key ? -P.sort.dir : key === 'name' ? 1 : -1}; update() }}))
    } else {
      const rows = sortRows(donorRows(), donorCols, P.psort)
      count.textContent = `${rows.length} ${rows.length === 1 ? 'person' : 'people'}, ${money(rows.reduce((a, r) => a + r.total, 0))} total in ${P.year}`
      out.replaceChildren(table({label: 'Totals by person', columns: donorCols, rows, sort: P.psort, empty: 'No one matches.', onSort: (key) => { P.psort = {key, dir: P.psort.key === key ? -P.psort.dir : key === 'name' ? 1 : -1}; update() }}))
    }
  }
  function build() {
    const common = [field('Search name or email', bind(input('q', P.q, {type: 'search', autocomplete: 'off'}), 'q'), {wide: true}),
      field('Type', bind(select('kind', [['', 'All'], ['dues', 'Dues'], ['donation', 'Donations']], P.kind), 'kind'))]
    filters.replaceChildren(...(P.view === 'payments'
      ? [...common,
          field('Paid by', bind(select('method', [['', 'All'], ...Object.entries(METHODS)], P.method), 'method')),
          field('From', bind(input('from', P.from, {type: 'date'}), 'from')),
          field('To', bind(input('to', P.to, {type: 'date'}), 'to')),
          field('Amount from', bind(input('min', P.min, {inputmode: 'decimal', placeholder: '$'}), 'min')),
          field('Amount to', bind(input('max', P.max, {inputmode: 'decimal', placeholder: '$'}), 'max')),
          flagBox()]
      : [...common, field('Year', bind(select('year', years.map((y) => [String(y), String(y)]), String(P.year)), 'year')), flagBox()]))
    update()
  }
  const tab = (view, label) => h('button', {type: 'button', class: 'a-tab', 'aria-pressed': String(P.view === view), text: label, onclick: () => { P.view = view; go('#/payments') }})
  build()
  return page('Donors and payments', null,
    h('div', {class: 'a-panel'},
      h('div', {class: 'a-tabs'}, tab('payments', 'Every payment'), tab('people', 'Totals by person')),
      filters,
      h('div', {class: 'a-bar'}, count, h('button', {type: 'button', class: 'a-btn ghost small', text: 'Download these', onclick: () => (P.view === 'payments' ? exportPayments(null, sortRows(filteredPayments(), payCols, P.sort)) : exportDonors(sortRows(donorRows(), donorCols, P.psort)))})),
      out))
}

// ---------- checks to confirm ----------
function checks() {
  const openForm = (c, host) => {
    const p = c.payload || {}
    host.replaceChildren(h('div', {class: 'a-inline-form'},
      h('h3', {text: `Check from ${fullName(p)}`}),
      form([
        field('Date received', input('paid_on', todayPT(), {type: 'date', required: true})),
        field('Amount on the check', input('amount', (c.amount_cents / 100).toFixed(2), {inputmode: 'decimal', required: true})),
        field('Check number or note', input('note', '', {maxlength: 200}), {optional: true, wide: true}),
      ], {
        submit: 'Mark received', cancel: '#/checks',
        note: c.kind === 'dues' ? `This creates or renews the ${p.level} membership from the date received.` : 'This records the donation on the date received.',
        onSubmit: async (fd) => {
          const cents = toCents(fd.get('amount'))
          if (!cents) throw new Error('Enter the amount on the check.')
          const r = await must(sb.rpc('confirm_check', {p_checkout: c.id, p: {paid_on: fd.get('paid_on'), amount_cents: cents, note: blank(fd.get('note'))}}))
          await load()
          flash(`Check recorded for ${fullName(p)}.`)
          go('#/person/' + r.person_id)
        },
      })))
    host.querySelector('input').focus()
  }
  const cancelCheck = async (c) => {
    if (!confirm(`Cancel the check promised by ${fullName(c.payload)}? Use this only if the check is not coming.`)) return
    try {
      await must(sb.from('checkouts').update({status: 'cancelled'}).eq('id', c.id))
      await load()
      flash('Check cancelled.')
      render()
    } catch (e) { flash(nice(e)) }
  }
  const host = h('div', {})
  const cols = [
    {key: 'date', label: 'Promised on', cell: (c) => day(c.created_at.slice(0, 10))},
    {key: 'name', label: 'Name', cell: (c) => { const p = c.payload || {}; return [h('strong', {text: fullName(p)}), h('br'), p.email || '', p.phone ? [h('br'), p.phone] : null] }},
    {key: 'for', label: 'For', cell: (c) => (c.kind === 'dues' ? `${c.payload.level} membership` : 'Donation')},
    {key: 'amount', label: 'Amount', num: true, cell: (c) => money(c.amount_cents)},
    {key: 'ref', label: 'Memo reference', cell: (c) => c.id.slice(0, 8).toUpperCase()},
    {key: 'do', label: 'Action', cell: (c) => (canEdit() ? h('div', {class: 'a-row-actions'},
      h('button', {type: 'button', class: 'a-btn small', text: 'Mark received', onclick: () => openForm(c, host)}),
      h('button', {type: 'button', class: 'a-btn ghost small', text: 'Cancel', onclick: () => cancelCheck(c)})) : 'View only')},
  ]
  return page('Checks to confirm', 'People who chose "Mail a check" on the website. Nothing counts as paid until you mark the check received.',
    host,
    panel(null, table({label: 'Checks to confirm', columns: cols, rows: S.checks, empty: 'No checks are waiting.'})),
    canEdit() ? h('p', {class: 'a-hint'}, 'Got a check from someone who did not use the website? ', linkTo('#/new', 'Add them by hand'), '.') : null)
}

// ---------- person ----------
const fact = (label, value) => h('div', {}, h('dt', {text: label}), h('dd', {}, value || h('span', {class: 'a-none', text: 'Not given'})))
async function person(id) {
  const p = S.person.get(id)
  if (!p) return page('Person not found', 'This record may have been removed.', linkTo('#/members', 'Back to members'))
  const mine = S.memberships.filter((m) => m.person_id === id).sort((a, b) => (b.expires_on || '').localeCompare(a.expires_on || ''))
  const pays = S.payments.filter((x) => x.person_id === id)
  const plans = S.plans.filter((x) => x.person_id === id)
  const current = S.memberOf.get(id)
  const years = [...new Set(pays.filter((x) => x.status === 'completed').map((x) => x.paid_on.slice(0, 4)))].sort().reverse()
  const address = [p.address1, p.address2, [p.city, p.state].filter(Boolean).join(', ') + (p.zip ? ' ' + p.zip : '')].filter((x) => x && x.trim())

  const notes = h('textarea', {name: 'notes', rows: '4', 'aria-label': 'Notes'})
  notes.value = p.notes || ''
  notes.readOnly = !canEdit()
  const history = h('div', {}, h('p', {class: 'a-empty', text: 'Loading...'}))
  const ids = [id, ...mine.map((m) => m.id), ...pays.map((x) => x.id)]
  sb.from('audit_log').select('*').in('row_id', ids).order('at', {ascending: false}).limit(40).then(({data}) => {
    const labels = {people: 'details', memberships: 'membership', payments: 'payment'}
    const changed = (r) => {
      if (r.action !== 'update' || !r.before || !r.after) return ''
      const keys = Object.keys(r.after).filter((k) => !['updated_at', 'created_at'].includes(k) && JSON.stringify(r.after[k]) !== JSON.stringify(r.before[k]))
      return keys.length ? ': ' + keys.map((k) => k.replace(/_/g, ' ')).join(', ') : ''
    }
    history.replaceChildren(table({label: 'Change history', empty: 'No changes recorded.', rows: data || [], columns: [
      {key: 'at', label: 'When', cell: (r) => when(r.at)},
      {key: 'who', label: 'Who', cell: (r) => (r.actor === 'system' ? 'Website or import' : r.actor)},
      {key: 'what', label: 'What', cell: (r) => `${{insert: 'Added', update: 'Changed', delete: 'Removed'}[r.action]} ${labels[r.table_name] || r.table_name}${changed(r)}`},
    ]}))
  })

  return h('div', {},
    h('p', {class: 'a-crumb'}, linkTo('#/members', 'Members'), ' / ', linkTo('#/payments', 'Donors and payments')),
    h('div', {class: 'a-head'},
      h('div', {}, h('h1', {tabindex: '-1', text: fullName(p)}),
        h('p', {class: 'a-chips'}, current ? [statusChip(current.status), ' ', chip(current.level + ' member')] : chip('Not a member'), ' ', reportChip(yearTotal(id, thisYear())))),
      canEdit() ? h('div', {class: 'a-actions'}, linkTo(`#/person/${id}/pay`, 'Record a payment', 'a-btn inline'), linkTo(`#/person/${id}/edit`, 'Edit details', 'a-btn ghost inline')) : null),
    panel('Contact', h('dl', {class: 'a-facts'},
      fact('Email', p.email ? h('a', {href: 'mailto:' + p.email, text: p.email}) : null),
      fact('Phone', p.phone),
      fact('Address', address.length ? address.map((line, i) => [i ? h('br') : null, line]) : null),
      fact('Occupation', p.occupation),
      fact('Employer', p.employer),
      fact('May we email them?', p.email_opt_in ? 'Yes' : 'No'),
      fact('Added', `${day(p.created_at.slice(0, 10))} (${{web: 'website', import: 'imported from the old sheet', manual: 'entered by hand'}[p.source] || p.source})`))),
    panel('Membership',
      mine.length ? mine.map((m) => h('div', {class: 'a-member'},
        h('dl', {class: 'a-facts'},
          fact('Level', m.level), fact('Status', statusChip(m.status)), fact('Started', day(m.starts_on)), fact('Expires', m.expires_on ? `${day(m.expires_on)}${m.days_left != null && m.status !== 'cancelled' ? ` (${m.days_left >= 0 ? m.days_left + ' days left' : -m.days_left + ' days ago'})` : ''}` : ''),
          fact('Auto-renew', m.auto_renew ? 'Yes, through PayPal' : 'No'), fact('Second household member', m.household_name), fact('Committees', (m.committees || []).join(', ')), fact('Referred by', m.referred_by)),
        canEdit() ? linkTo(`#/person/${id}/membership/${m.id}`, 'Edit membership', 'a-btn ghost small') : null))
      : h('p', {class: 'a-empty', text: 'No membership on file.'}),
      canEdit() && !mine.length ? h('p', {}, linkTo(`#/person/${id}/pay`, 'Record a dues payment to start one', 'a-btn ghost small')) : null),
    plans.length ? panel('Recurring plans', table({label: 'Recurring plans', rows: plans, columns: [
      {key: 'k', label: 'For', cell: (x) => (x.kind === 'dues' ? 'Membership dues' : 'Donation')},
      {key: 'a', label: 'Amount', num: true, cell: (x) => `${money(x.amount_cents)} ${x.frequency}`},
      {key: 's', label: 'Status', cell: (x) => chip(x.status, x.status === 'active' ? 'good' : x.status === 'failed' ? 'bad' : '')},
      {key: 'd', label: 'Started', cell: (x) => day(x.started_on)},
    ]}), h('p', {class: 'a-hint', text: 'Plans are changed or cancelled in PayPal. This list updates on its own.'})) : null,
    panel('Payments',
      years.length ? h('p', {class: 'a-totals'}, years.map((y) => h('span', {}, `${y}: `, h('strong', {text: money(yearTotal(id, y))}), ' ', reportChip(yearTotal(id, y))))) : null,
      table({label: 'Payments', empty: 'No payments on file.', rows: pays, columns: [
        {key: 'd', label: 'Date', cell: (x) => day(x.paid_on)},
        {key: 'k', label: 'Type', cell: (x) => (x.kind === 'dues' ? 'Dues' : 'Donation')},
        {key: 'm', label: 'Paid by', cell: (x) => METHODS[x.method] || x.method},
        {key: 'a', label: 'Amount', num: true, cell: (x) => [money(x.amount_cents), x.status !== 'completed' ? [' ', chip(x.status, 'bad')] : null]},
        {key: 'n', label: 'Details', cell: (x) => [x.in_honor_of, x.note, x.paypal_capture_id ? 'PayPal ' + x.paypal_capture_id : null].filter(Boolean).join(' | ')},
        {key: 'e', label: 'Change', cell: (x) => (canEdit() ? linkTo(`#/person/${id}/payment/${x.id}`, 'Edit') : '')},
      ]})),
    panel('Notes', notes, canEdit() ? h('div', {class: 'a-actions'}, h('button', {type: 'button', class: 'a-btn ghost inline', text: 'Save notes', onclick: async (e) => {
      e.target.disabled = true
      try { await must(sb.from('people').update({notes: blank(notes.value)}).eq('id', id)); p.notes = blank(notes.value); flash('Notes saved.') } catch (ex) { flash(nice(ex)) }
      e.target.disabled = false
    }})) : null),
    panel('Change history', history))
}

function personFields(p = {}) {
  const opt = h('input', {type: 'checkbox', name: 'email_opt_in'})
  opt.checked = Boolean(p.email_opt_in)
  return [
    field('First name', input('first_name', p.first_name, {required: true, maxlength: 80})),
    field('Last name', input('last_name', p.last_name, {required: true, maxlength: 80})),
    field('Email', input('email', p.email, {type: 'email', maxlength: 160}), {optional: true}),
    field('Phone', input('phone', p.phone, {type: 'tel', maxlength: 30}), {optional: true}),
    field('Street address', input('address1', p.address1, {maxlength: 120}), {wide: true}),
    field('Apartment or unit', input('address2', p.address2, {maxlength: 120}), {optional: true, wide: true}),
    field('City', input('city', p.city, {maxlength: 80})),
    h('div', {class: 'a-pair'}, field('State', input('state', p.state ?? 'CA', {maxlength: 2})), field('ZIP code', input('zip', p.zip, {maxlength: 10, inputmode: 'numeric'}))),
    field('Occupation', input('occupation', p.occupation, {maxlength: 120}), {hint: 'Needed for FPPC reports at $100 or more in a year.'}),
    field('Employer', input('employer', p.employer, {maxlength: 120})),
    h('label', {class: 'a-checkline wide'}, opt, h('span', {text: 'This person agreed to get SBWPC email'})),
  ]
}
function personValues(fd) {
  const v = {
    first_name: String(fd.get('first_name') || '').trim(), last_name: String(fd.get('last_name') || '').trim(),
    email: blank(fd.get('email'))?.toLowerCase() ?? null, phone: blank(fd.get('phone')), address1: blank(fd.get('address1')), address2: blank(fd.get('address2')),
    city: blank(fd.get('city')), state: blank(fd.get('state'))?.toUpperCase() ?? null, zip: blank(fd.get('zip')), occupation: blank(fd.get('occupation')), employer: blank(fd.get('employer')),
    email_opt_in: fd.get('email_opt_in') === 'on',
  }
  if (!v.first_name && !v.last_name) throw new Error('Enter a first or last name.')
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) throw new Error('That email address does not look right.')
  return v
}
function editPerson(id) {
  const p = S.person.get(id)
  if (!p) return page('Person not found')
  return page(`Edit ${fullName(p)}`, null, panel(null, form(personFields(p), {
    cancel: '#/person/' + id,
    onSubmit: async (fd) => {
      const v = personValues(fd)
      const clash = v.email && S.people.find((x) => x.id !== id && (x.email || '').toLowerCase() === v.email)
      if (clash) throw new Error(`${fullName(clash)} already uses that email address.`)
      await must(sb.from('people').update(v).eq('id', id))
      await load()
      flash('Details saved.')
      go('#/person/' + id)
    },
  })))
}

// Fields for a payment entered by hand. Used for a new person and for someone already on file.
function paymentFields({kind = 'donation', level = '', required = true} = {}) {
  const kindSel = select('kind', [...(required ? [] : [['', 'No payment now']]), ['dues', 'Membership dues'], ['donation', 'Donation']], required ? kind : '')
  const levelSel = select('level', LEVELS.map((l) => [l.name, `${l.name} (${money(l.amount * 100)})`]), level || 'Advocate')
  const amount = input('amount', '', {inputmode: 'decimal', placeholder: '$'})
  const wrap = {level: field('Level', levelSel), amount: field('Amount', amount), date: field('Date received', input('paid_on', todayPT(), {type: 'date'})),
    method: field('Paid by', select('method', [['check', 'Check'], ['cash', 'Cash'], ['other', 'Other']], 'check')),
    note: field('Check number or note', input('note', '', {maxlength: 200}), {optional: true}),
    honor: field('In honor or memory of', input('in_honor_of', '', {maxlength: 160}), {optional: true})}
  const sync = (touchAmount) => {
    const k = kindSel.value
    for (const [name, el] of Object.entries(wrap)) el.hidden = !k || (name === 'level' && k !== 'dues') || (name === 'honor' && k !== 'donation')
    if (touchAmount && k === 'dues') amount.value = String(levelAmount(levelSel.value))
  }
  kindSel.addEventListener('change', () => sync(true))
  levelSel.addEventListener('change', () => sync(true))
  sync(true)
  return [field('Payment', kindSel, {wide: !required}), ...Object.values(wrap)]
}
function paymentValues(fd) {
  const kind = fd.get('kind')
  if (!kind) return null
  const cents = toCents(fd.get('amount'))
  if (!cents) throw new Error('Enter the payment amount.')
  if (!fd.get('paid_on')) throw new Error('Enter the date the payment was received.')
  if (fd.get('paid_on') > todayPT()) throw new Error('The payment date cannot be in the future.')
  return {kind, level: kind === 'dues' ? fd.get('level') : null, amount_cents: cents, paid_on: fd.get('paid_on'), method: fd.get('method'), note: blank(fd.get('note')), in_honor_of: kind === 'donation' ? blank(fd.get('in_honor_of')) : null, source: 'manual'}
}
function newPerson() {
  return page('Add a person', 'For members and donors who paid by check or cash, or anyone you want on file. Website payments add people on their own.',
    panel(null, form([...personFields(), h('h2', {class: 'wide a-formhead', text: 'Their payment'}), ...paymentFields({required: false})], {
      submit: 'Add person', cancel: '#/',
      onSubmit: async (fd) => {
        const v = personValues(fd)
        const pay = paymentValues(fd)
        const clash = v.email && S.people.find((x) => (x.email || '').toLowerCase() === v.email)
        if (clash) throw new Error(`${fullName(clash)} is already on file with that email. Open their page and record the payment there.`)
        let id
        if (pay) id = (await must(sb.rpc('record_payment', {p: {...v, ...pay}}))).person_id
        else id = (await must(sb.from('people').insert({...v, source: 'manual'}).select()))[0].id
        await load()
        flash(pay ? 'Person and payment added.' : 'Person added.')
        go('#/person/' + id)
      },
    })))
}
function recordPayment(id) {
  const p = S.person.get(id)
  if (!p) return page('Person not found')
  const current = S.memberOf.get(id)
  return page(`Record a payment for ${fullName(p)}`, 'For checks, cash and other payments made outside the website.',
    panel(null, form(paymentFields({kind: current ? 'dues' : 'donation', level: current?.level}), {
      submit: 'Record payment', cancel: '#/person/' + id,
      note: 'Dues extend the membership by 12 months: from the current expiration date if it has not passed, otherwise from the date received.',
      onSubmit: async (fd) => {
        const pay = paymentValues(fd)
        const r = await must(sb.rpc('record_payment', {p: {person_id: id, ...pay}}))
        await load()
        flash(pay.kind === 'dues' ? `Payment recorded. Membership runs through ${day(r.expires_on)}.` : 'Donation recorded.')
        go('#/person/' + id)
      },
    })))
}
function editMembership(id, mid) {
  const p = S.person.get(id)
  const m = S.memberships.find((x) => x.id === mid && x.person_id === id)
  if (!p || !m) return page('Membership not found')
  const boxes = COMMITTEES.map((c) => { const box = h('input', {type: 'checkbox', name: 'committees', value: c}); box.checked = (m.committees || []).includes(c); return h('label', {class: 'a-checkline'}, box, h('span', {text: c})) })
  return page(`Edit membership for ${fullName(p)}`, 'Use this to fix a mistake. To take a payment, record the payment instead and the dates update on their own.',
    panel(null, form([
      field('Level', select('level', LEVELS.map((l) => l.name), m.level)),
      field('State', select('state', [['active', 'Active'], ['pending', 'Pending'], ['cancelled', 'Cancelled']], m.state), {hint: 'Expired is worked out from the expiration date.'}),
      field('Start date', input('starts_on', m.starts_on, {type: 'date'})),
      field('Expiration date', input('expires_on', m.expires_on, {type: 'date'})),
      field('Second household member', input('household_name', m.household_name, {maxlength: 160}), {optional: true}),
      field('Referred by', input('referred_by', m.referred_by, {maxlength: 160}), {optional: true}),
      h('fieldset', {class: 'a-set wide'}, h('legend', {text: 'Committees'}), h('div', {class: 'a-checks'}, boxes)),
    ], {
      cancel: '#/person/' + id,
      onSubmit: async (fd) => {
        if (fd.get('state') === 'active' && !fd.get('expires_on')) throw new Error('An active membership needs an expiration date.')
        await must(sb.from('memberships').update({level: fd.get('level'), state: fd.get('state'), starts_on: blank(fd.get('starts_on')), expires_on: blank(fd.get('expires_on')), household_name: blank(fd.get('household_name')), referred_by: blank(fd.get('referred_by')), committees: fd.getAll('committees')}).eq('id', mid))
        await load()
        flash('Membership saved.')
        go('#/person/' + id)
      },
    })))
}
function editPayment(id, pid) {
  const p = S.person.get(id)
  const x = S.payments.find((y) => y.id === pid && y.person_id === id)
  if (!p || !x) return page('Payment not found')
  const online = Boolean(x.paypal_capture_id)
  return page(`Edit payment from ${fullName(p)}`, `${x.kind === 'dues' ? 'Dues' : 'Donation'} of ${money(x.amount_cents)} on ${day(x.paid_on)}, paid by ${METHODS[x.method] || x.method}.`,
    panel(null, form([
      field('Status', select('status', [['completed', 'Completed'], ['refunded', 'Refunded'], ['failed', 'Failed or bounced']], x.status)),
      online ? null : field('Amount', input('amount', (x.amount_cents / 100).toFixed(2), {inputmode: 'decimal'})),
      online ? null : field('Date received', input('paid_on', x.paid_on, {type: 'date'})),
      field('Check number or note', input('note', x.note, {maxlength: 200}), {optional: true}),
      field('In honor or memory of', input('in_honor_of', x.in_honor_of, {maxlength: 160}), {optional: true}),
    ], {
      cancel: '#/person/' + id,
      note: online ? 'This payment came through PayPal, so its amount and date cannot be changed here. Refunds are made in PayPal and show up here on their own.' : 'Changing a payment does not move membership dates. Edit the membership if those need to change too.',
      onSubmit: async (fd) => {
        const patch = {status: fd.get('status'), note: blank(fd.get('note')), in_honor_of: blank(fd.get('in_honor_of'))}
        if (!online) {
          patch.amount_cents = toCents(fd.get('amount'))
          patch.paid_on = fd.get('paid_on')
          if (!patch.amount_cents || !patch.paid_on) throw new Error('Enter the amount and the date.')
        }
        await must(sb.from('payments').update(patch).eq('id', pid))
        await load()
        flash('Payment saved.')
        go('#/person/' + id)
      },
    })))
}

// ---------- downloads ----------
const stamp = () => todayPT()
function exportMembers(rows) {
  downloadCsv(`sbwpc-members-${stamp()}.csv`,
    ['Last name', 'First name', 'Email', 'Phone', 'Address', 'Address 2', 'City', 'State', 'ZIP', 'Occupation', 'Employer', 'Level', 'Status', 'Start date', 'Expiration date', 'Auto-renew', 'Second household member', 'Committees', 'Referred by', 'Email permission'],
    rows.map((m) => { const p = S.person.get(m.person_id) || {}; return [p.last_name, p.first_name, p.email, p.phone, p.address1, p.address2, p.city, p.state, p.zip, p.occupation, p.employer, m.level, STATUS[m.status] || m.status, m.starts_on, m.expires_on, m.auto_renew ? 'Yes' : 'No', m.household_name, (m.committees || []).join('; '), m.referred_by, p.email_opt_in ? 'Yes' : 'No'] }))
  flash(`Downloaded ${rows.length} memberships.`)
}
function exportPayments(year, rows) {
  const list = (rows || S.payments.filter((p) => p.paid_on.startsWith(String(year)))).slice().sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at))
  // Running total per person per year, the figure FPPC schedules call cumulative
  const running = new Map()
  const out = list.map((x) => {
    const p = S.person.get(x.person_id) || {}
    const y = x.paid_on.slice(0, 4)
    const k = x.person_id + '|' + y
    if (x.status === 'completed') running.set(k, (running.get(k) || 0) + x.amount_cents)
    const total = yearTotal(x.person_id, y)
    return [x.paid_on, p.last_name, p.first_name, [p.address1, p.address2].filter(Boolean).join(', '), p.city, p.state, p.zip, p.occupation, p.employer, (x.amount_cents / 100).toFixed(2), x.kind === 'dues' ? 'Dues' : 'Donation', METHODS[x.method] || x.method,
      ((running.get(k) || 0) / 100).toFixed(2), (total / 100).toFixed(2), total >= REPORT_CENTS ? 'Yes' : 'No', x.status, x.in_honor_of, x.paypal_capture_id, x.note, p.email]
  })
  downloadCsv(`sbwpc-payments-${year || 'selected'}-${stamp()}.csv`,
    ['Date', 'Last name', 'First name', 'Street address', 'City', 'State', 'ZIP', 'Occupation', 'Employer', 'Amount', 'Type', 'Paid by', 'Cumulative for the year', 'Year total', '$100 or more (reportable)', 'Status', 'Dedication', 'PayPal transaction', 'Note', 'Email'], out)
  flash(`Downloaded ${out.length} payments.`)
}
function exportDonors(rows) {
  downloadCsv(`sbwpc-totals-${P.year}-${stamp()}.csv`,
    ['Last name', 'First name', 'Street address', 'City', 'State', 'ZIP', 'Occupation', 'Employer', 'Year', 'Total', 'Dues', 'Donations', 'Payments', 'Last payment', '$100 or more (reportable)', 'Email'],
    rows.map((r) => { const p = S.person.get(r.id) || {}; return [p.last_name, p.first_name, [p.address1, p.address2].filter(Boolean).join(', '), p.city, p.state, p.zip, p.occupation, p.employer, P.year, (r.total / 100).toFixed(2), (r.dues / 100).toFixed(2), (r.gifts / 100).toFixed(2), r.n, r.last, r.total >= REPORT_CENTS ? 'Yes' : 'No', p.email] }))
  flash(`Downloaded ${rows.length} people.`)
}
function exportEmails() {
  const rows = S.people.filter((p) => p.email && p.email_opt_in)
  downloadCsv(`sbwpc-email-list-${stamp()}.csv`, ['Email', 'First name', 'Last name', 'Member status', 'Level'],
    rows.map((p) => { const m = S.memberOf.get(p.id); return [p.email, p.first_name, p.last_name, m ? STATUS[m.status] || m.status : 'Not a member', m ? m.level : ''] }))
  flash(`Downloaded ${rows.length} email addresses. Only people who gave permission are included.`)
}

// ---------- routing ----------
async function render() {
  if (!started) return
  const {parts, q} = parse()
  const [a, b, c, d] = parts
  let view
  const guard = (fn) => (canEdit() ? fn() : page('View only', 'Your account can view records but cannot change them.'))
  if (!a) view = overview()
  else if (a === 'members') view = members(q)
  else if (a === 'payments') view = payments(q)
  else if (a === 'checks') view = checks()
  else if (a === 'new') view = guard(newPerson)
  else if (a === 'person' && b && c === 'edit') view = guard(() => editPerson(b))
  else if (a === 'person' && b && c === 'pay') view = guard(() => recordPayment(b))
  else if (a === 'person' && b && c === 'membership' && d) view = guard(() => editMembership(b, d))
  else if (a === 'person' && b && c === 'payment' && d) view = guard(() => editPayment(b, d))
  else if (a === 'person' && b) view = await person(b)
  else view = page('Page not found', null, linkTo('#/', 'Back to the overview'))
  root.replaceChildren(view)
  const section = !a ? '' : a === 'person' ? 'none' : a
  document.querySelectorAll('.a-nav a').forEach((el) => {
    if (el.dataset.nav === section) el.setAttribute('aria-current', 'page')
    else el.removeAttribute('aria-current')
  })
  // Drop the one-time filter from the address so Back and reload keep what the person set
  if (q.toString() && ['members', 'payments'].includes(a)) history.replaceState(null, '', '#/' + a)
  scrollTo(0, 0)
  const h1 = root.querySelector('h1')
  if (h1 && render.moved) h1.focus({preventScroll: true})
  render.moved = true
}

export async function startConsole(client, staffRole) {
  sb = client
  role = staffRole
  root = document.getElementById('app')
  document.getElementById('nav-new').hidden = !canEdit()
  root.replaceChildren(h('p', {class: 'a-status', role: 'status', text: 'Loading records...'}))
  try {
    await load()
  } catch (e) {
    root.replaceChildren(h('p', {class: 'a-error', role: 'alert', text: 'Could not load records. ' + nice(e)}))
    return
  }
  started = true
  render.moved = false
  if (!location.hash.startsWith('#/')) history.replaceState(null, '', '#/')
  render()
}
export function stopConsole() {
  started = false
  Object.assign(S, {people: [], memberships: [], payments: [], checks: [], plans: [], log: [], admins: [], person: new Map(), totals: new Map(), memberOf: new Map()})
  if (root) root.replaceChildren()
  if (location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname)
}
addEventListener('hashchange', () => { if (started && location.hash.startsWith('#/')) render() })
