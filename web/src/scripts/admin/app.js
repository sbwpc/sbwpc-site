// SBWPC admin: sign-in with required two-factor, then a summary dashboard.
// The database enforces access. This script only decides which screen to show.
import {createClient} from '@supabase/supabase-js'
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from '../../lib/members-config.js'

const $ = (id) => document.getElementById(id)
const VIEWS = ['signin', 'forgot', 'password', 'enroll', 'verify', 'denied', 'dash']
const IDLE_MS = 30 * 60 * 1000

// What kind of email link brought the person here (invite, password reset), read before the client clears it
const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
let linkType = hash.get('type')
const linkError = hash.get('error_description')

// The session lives only in this browser tab and ends when the tab closes
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
})

let factorId = null
let needsPassword = linkType === 'invite' || linkType === 'recovery'

function show(view) {
  $('a-loading').hidden = true
  for (const v of VIEWS) $('v-' + v).hidden = v !== view
  const el = $('v-' + view)
  const target = el.querySelector('input:not([type=hidden])') || el.querySelector('h1')
  if (target) {
    if (target.tagName === 'H1') target.tabIndex = -1
    target.focus()
  }
}
function fail(id, msg) {
  const el = $(id)
  el.textContent = msg
  el.hidden = !msg
}
function busy(form, on) {
  const b = form.querySelector('button[type=submit]')
  if (on) { b.dataset.label = b.textContent; b.textContent = 'Working...'; b.disabled = true }
  else { b.textContent = b.dataset.label || b.textContent; b.disabled = false }
}
const friendly = (err) => {
  const m = (err && err.message) || ''
  if (/invalid login/i.test(m)) return 'That email and password do not match.'
  if (/invalid totp|invalid.*code|expired/i.test(m)) return 'That code did not work. Wait for a new code and try again.'
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.'
  if (/weak|pwned|should be/i.test(m)) return 'Choose a longer, harder to guess password.'
  if (/network|fetch/i.test(m)) return 'Could not reach the server. Check your connection and try again.'
  return m || 'Something went wrong. Try again.'
}
const money = (cents) => '$' + Math.round(cents / 100).toLocaleString('en-US')

// Decide which screen comes next for the current session
async function route() {
  const {data: {session}} = await sb.auth.getSession()
  $('a-user').hidden = !session
  if (!session) return show('signin')
  $('a-user-email').textContent = session.user.email

  const [{data: aal}, {data: factors}] = await Promise.all([
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    sb.auth.mfa.listFactors(),
  ])
  const verified = (factors && factors.totp) || []
  const atAal2 = aal && aal.currentLevel === 'aal2'

  if (verified.length && !atAal2) {
    factorId = verified[0].id
    return show('verify')
  }
  if (needsPassword) return show('password')
  if (!verified.length) return startEnroll(factors)
  return loadDash()
}

async function startEnroll(factors) {
  // Clear half-finished setups so a fresh code can be issued
  for (const f of ((factors && factors.all) || []).filter((f) => f.status === 'unverified')) {
    await sb.auth.mfa.unenroll({factorId: f.id})
  }
  const {data, error} = await sb.auth.mfa.enroll({factorType: 'totp', friendlyName: 'SBWPC admin ' + new Date().toISOString().slice(0, 10)})
  show('enroll')
  if (error) return fail('e-enroll', friendly(error))
  factorId = data.id
  // Re-encode the QR image so characters like # in the SVG cannot break it
  const raw = data.totp.qr_code || ''
  const comma = raw.indexOf(',')
  const svg = raw.startsWith('data:image/svg+xml') && comma > -1 ? raw.slice(comma + 1) : raw
  $('en-qr').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('%3C') ? decodeURIComponent(svg) : svg)
  $('en-secret').textContent = data.totp.secret
}

async function loadDash() {
  const {data: role, error: roleErr} = await sb.rpc('staff_role')
  if (roleErr || !role) return show('denied')
  show('dash')
  const year = new Date().getFullYear()
  const [members, pays, totals, log, admins] = await Promise.all([
    sb.from('membership_status').select('status'),
    sb.from('payments').select('kind,amount_cents').eq('status', 'completed').gte('paid_on', `${year}-01-01`),
    sb.from('contributor_totals').select('person_id').eq('year', year).eq('reportable', true),
    sb.from('audit_log').select('at,actor,action,table_name').order('at', {ascending: false}).limit(12),
    sb.from('admins').select('email,role,active').order('email'),
  ])
  const count = (s) => (members.data || []).filter((m) => m.status === s).length
  $('n-active').textContent = count('active') + count('expiring_soon')
  $('n-expiring').textContent = count('expiring_soon')
  $('n-expired').textContent = count('expired')
  const sum = (k) => (pays.data || []).filter((p) => p.kind === k).reduce((a, p) => a + p.amount_cents, 0)
  $('n-dues').textContent = money(sum('dues'))
  $('n-gifts').textContent = money(sum('donation'))
  $('n-report').textContent = (totals.data || []).length
  $('dash-sub').textContent = `Signed in as ${role === 'admin' ? 'an admin' : 'treasurer'} with two-factor. Figures are for ${year}.`

  const rows = log.data || []
  $('log-empty').hidden = rows.length > 0
  $('log-table').hidden = rows.length === 0
  const body = $('log-body')
  body.replaceChildren()
  const labels = {people: 'person', memberships: 'membership', payments: 'payment', recurring_plans: 'recurring plan', admins: 'admin'}
  const verbs = {insert: 'Added a', update: 'Changed a', delete: 'Removed a'}
  for (const r of rows) {
    const tr = document.createElement('tr')
    const cells = [new Date(r.at).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'}), r.actor, `${verbs[r.action] || r.action} ${labels[r.table_name] || r.table_name}`]
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td) }
    body.appendChild(tr)
  }
  const list = $('admin-list')
  list.replaceChildren()
  for (const a of admins.data || []) {
    const li = document.createElement('li')
    li.textContent = `${a.email} (${a.role}${a.active ? '' : ', turned off'})`
    list.appendChild(li)
  }
}

// ---------- forms ----------
$('f-signin').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.currentTarget
  fail('e-signin', '')
  busy(f, true)
  const {error} = await sb.auth.signInWithPassword({email: f.email.value.trim(), password: f.password.value})
  busy(f, false)
  f.password.value = ''
  if (error) return fail('e-signin', friendly(error))
  route()
})

$('a-forgot').addEventListener('click', () => show('forgot'))
$('a-back-signin').addEventListener('click', () => show('signin'))
$('f-forgot').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.currentTarget
  fail('e-forgot', '')
  busy(f, true)
  const {error} = await sb.auth.resetPasswordForEmail(f.email.value.trim(), {redirectTo: location.origin + '/admin/'})
  busy(f, false)
  if (error && /rate limit|too many/i.test(error.message)) return fail('e-forgot', friendly(error))
  $('ok-forgot').hidden = false
})

$('f-password').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.currentTarget
  const a = f['new-password'].value
  const b = f['new-password-again'].value
  fail('e-password', '')
  if (a.length < 12) return fail('e-password', 'Use at least 12 characters.')
  if (a !== b) return fail('e-password', 'The two passwords do not match.')
  busy(f, true)
  const {error} = await sb.auth.updateUser({password: a})
  busy(f, false)
  if (error) return fail('e-password', friendly(error))
  f.reset()
  needsPassword = false
  route()
})

async function submitCode(form, errId) {
  const code = form.code.value.replace(/\D/g, '')
  fail(errId, '')
  if (code.length !== 6) return fail(errId, 'Enter the 6-digit code.')
  busy(form, true)
  const {error} = await sb.auth.mfa.challengeAndVerify({factorId, code})
  busy(form, false)
  form.code.value = ''
  if (error) return fail(errId, friendly(error))
  route()
}
$('f-enroll').addEventListener('submit', (e) => { e.preventDefault(); submitCode(e.currentTarget, 'e-enroll') })
$('f-verify').addEventListener('submit', (e) => { e.preventDefault(); submitCode(e.currentTarget, 'e-verify') })

async function signOut() {
  await sb.auth.signOut()
  needsPassword = false
  factorId = null
  route()
}
$('a-signout').addEventListener('click', signOut)
$('a-denied-out').addEventListener('click', signOut)

// Sign out after 30 minutes without activity
let idle
const resetIdle = () => {
  clearTimeout(idle)
  idle = setTimeout(async () => {
    const {data: {session}} = await sb.auth.getSession()
    if (session) signOut()
  }, IDLE_MS)
}
for (const ev of ['pointerdown', 'keydown', 'scroll']) addEventListener(ev, resetIdle, {passive: true})
resetIdle()

// ---------- start ----------
sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') { needsPassword = true; linkType = 'recovery' }
})
if (linkError) {
  show('signin')
  fail('e-signin', linkError.replace(/\+/g, ' ') + '. Ask for a new link and try again.')
} else {
  // Give the client a moment to pick up a session from an email link
  sb.auth.getSession().then(() => route())
}
