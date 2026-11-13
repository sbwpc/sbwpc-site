// Small helpers for the admin screens. All text goes in with textContent, never as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'value') el.value = v
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, v)
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    el.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return el
}

export const money = (cents) => {
  const n = (cents || 0) / 100
  return '$' + n.toLocaleString('en-US', {minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2})
}
export const toCents = (text) => {
  const n = Number(String(text ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}
export const day = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '')
export const when = (iso) => new Date(iso).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'})
export const todayPT = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(new Date())
export const fullName = (p) => (p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(no name)' : '(unknown)')
export const sortName = (p) => (p ? `${p.last_name || ''} ${p.first_name || ''}`.trim().toLowerCase() : '')

export const STATUS = {active: 'Active', expiring_soon: 'Expiring soon', expired: 'Expired', pending: 'Pending', cancelled: 'Cancelled'}
export const METHODS = {paypal: 'PayPal', apple_pay: 'Apple Pay', card: 'Card', check: 'Check', cash: 'Cash', other: 'Other'}
export const chip = (text, tone = '') => h('span', {class: 'a-chip ' + tone, text})
export const statusChip = (s) => chip(STATUS[s] || s, s === 'active' ? 'good' : s === 'expiring_soon' ? 'warn' : s === 'expired' ? 'bad' : '')

// Labelled form field
export function field(label, input, {hint, optional, wide} = {}) {
  const id = input.id || (input.id = 'f-' + Math.random().toString(36).slice(2, 9))
  return h('div', {class: 'a-field' + (wide ? ' wide' : '')},
    h('label', {for: id}, label, optional && h('span', {class: 'a-opt', text: ' (optional)'})),
    input,
    hint && h('p', {class: 'a-hint', text: hint}))
}
export const input = (name, value = '', attrs = {}) => h('input', {name, value: value ?? '', ...attrs})
export function select(name, options, value, attrs = {}) {
  const el = h('select', {name, ...attrs}, options.map((o) => {
    const [v, label] = Array.isArray(o) ? o : [o, o]
    return h('option', {value: v, text: label})
  }))
  el.value = value ?? ''
  return el
}

// A table that sorts when a column heading is pressed. On phones each row becomes a card.
export function table({columns, rows, sort, onSort, empty = 'Nothing to show.', label}) {
  if (!rows.length) return h('p', {class: 'a-empty', text: empty})
  const head = h('tr', {}, columns.map((c) => {
    const active = sort && sort.key === c.key
    const th = h('th', {scope: 'col', class: c.num ? 'num' : '', 'aria-sort': c.sort ? (active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none') : null})
    if (c.sort && onSort) th.append(h('button', {type: 'button', class: 'a-sort', onclick: () => onSort(c.key)}, c.label, h('span', {'aria-hidden': 'true', text: active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''})))
    else th.textContent = c.label
    return th
  }))
  const body = rows.map((r) => h('tr', {}, columns.map((c) => h('td', {'data-label': c.label, class: c.num ? 'num' : ''}, c.cell(r)))))
  // Phones hide the column headings, so offer the same sorting as a menu
  const sortable = columns.filter((c) => c.sort)
  const pick = onSort && sort && sortable.length ? h('div', {class: 'a-sortpick'},
    field('Sort by', (() => { const el = select('sortby', sortable.map((c) => [c.key, c.label]), sort.key); el.addEventListener('change', () => onSort(el.value)); return el })()),
    h('button', {type: 'button', class: 'a-btn ghost small', text: sort.dir === 1 ? 'Reverse order' : 'Reverse order', onclick: () => onSort(sort.key)})) : null
  return h('div', {class: 'a-scroll'}, pick, h('table', {class: 'a-table cards', 'aria-label': label}, h('thead', {}, head), h('tbody', {}, body)))
}
export function sortRows(rows, columns, sort) {
  const col = columns.find((c) => c.key === sort.key)
  if (!col || !col.sort) return rows
  return [...rows].sort((a, b) => {
    const x = col.sort(a), y = col.sort(b)
    if (x == null || x === '') return 1
    if (y == null || y === '') return -1
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
  })
}

// CSV download made in the browser. Cells that could be read as formulas by a spreadsheet are defused.
export function downloadCsv(filename, header, rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const text = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([text], {type: 'text/csv;charset=utf-8'}))
  const a = h('a', {href: url, download: filename})
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
