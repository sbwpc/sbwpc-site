// SBWPC admin: sign-in comes from the Sanity Studio, then the admin screens (console.js).
// The Studio opens this page with the person's Sanity session in the address after the #.
// That part of an address is never sent to a server. It is read once, removed from the address bar,
// and sent to our own studio-login function, which checks it with Sanity and returns a one-time code.
// The database enforces access. This script only decides which screen to show.
import {createClient} from '@supabase/supabase-js'
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from '../../lib/members-config.js'
import {startConsole, stopConsole} from './console.js'

const $ = (id) => document.getElementById(id)
const VIEWS = ['signin', 'denied', 'dash']
const IDLE_MS = 30 * 60 * 1000

// Take the Studio hand-off out of the address right away
const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
const studioToken = hash.get('studio')
if (studioToken !== null) history.replaceState(null, '', location.pathname + location.search)

// The session lives only in this browser tab and ends when the tab closes
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false},
})

function show(view) {
  $('a-loading').hidden = true
  for (const v of VIEWS) $('v-' + v).hidden = v !== view
  document.body.classList.toggle('wide', view === 'dash')
  if (view === 'dash') return
  const el = $('v-' + view)
  const target = el.querySelector('a, button') || el.querySelector('h1')
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

// Exchange the Studio hand-off for a database session. Returns an error message, or '' on success.
async function studioSignIn(token) {
  $('a-loading').textContent = 'Signing you in...'
  $('a-loading').hidden = false
  let res, out
  try {
    res = await fetch('/api/admin/studio-login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({token})})
    out = await res.json()
  } catch {
    return 'Could not reach the server. Check your connection and try again from the Studio.'
  }
  if (!res.ok || !out.ok) return out.message || 'We could not sign you in. Try again from the Studio.'
  const {error} = await sb.auth.verifyOtp({token_hash: out.token_hash, type: 'email'})
  return error ? 'The sign-in code did not work. Try again from the Studio.' : ''
}

// Decide which screen comes next for the current session
async function route() {
  const {data: {session}} = await sb.auth.getSession()
  $('a-user').hidden = !session
  if (!session) return show('signin')
  $('a-user-email').textContent = session.user.email
  const {data: role, error: roleErr} = await sb.rpc('staff_role')
  if (roleErr || !role) return show('denied')
  show('dash')
  await startConsole(sb, role)
}

async function signOut() {
  stopConsole()
  await sb.auth.signOut()
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
;(async () => {
  if (studioToken) {
    const problem = await studioSignIn(studioToken)
    if (problem) {
      await sb.auth.signOut()
      show('signin')
      return fail('e-signin', problem)
    }
  }
  route()
})()
