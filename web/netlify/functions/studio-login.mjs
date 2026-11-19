// Sign-in to the member admin from the Sanity Studio.
// The Studio sends the person's own Sanity session token. This function asks Sanity who it belongs to,
// checks that person is a member of the SBWPC Sanity project and is an active admin in our admins table,
// then marks their account with the time of this Studio sign-in and returns a one-time sign-in code
// for the browser to exchange for a session. The database refuses member data to any session without
// that mark (supabase/migrations/005_studio_signin.sql). The Sanity token is never stored or logged.
import {json, fail, sameOrigin, readJson, log, env} from '../lib/http.mjs'
import {db, dbReady, must} from '../lib/db.mjs'

const API = '2021-06-07'
const DENIED = 'This Sanity account does not have access to the member system. Ask an SBWPC admin to add you.'
const base = () => env('SANITY_API_BASE') || 'https://api.sanity.io'
const projectId = () => env('SANITY_PROJECT_ID') || 'coo0nu6y'

async function sanity(path, token) {
  const res = await fetch(`${base()}/v${API}${path}`, {headers: {authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(8000)})
  return res
}

// The person's Auth account, made on first use if an admin was added to the admins table but never invited
async function accountFor(email) {
  const admin = db().auth.admin
  for (let page = 1; page < 20; page++) {
    const {data, error} = await admin.listUsers({page, perPage: 200})
    if (error) throw new Error('auth: ' + error.message)
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 200) break
  }
  const {data, error} = await admin.createUser({email, email_confirm: true})
  if (error) throw new Error('auth: ' + error.message)
  return data.user
}

export default async (req) => {
  if (!sameOrigin(req)) return fail(403, 'This request did not come from our website.')
  if (!dbReady()) return fail(503, 'The member system is not switched on yet.')
  let body
  try { body = await readJson(req, 4000) } catch { return fail(400, 'We could not read the request.') }
  const token = String(body.token || '').trim()
  if (token.length < 20 || /\s/.test(token)) return fail(401, DENIED)
  try {
    // 1. Who is this Sanity session?
    const me = await sanity('/users/me', token)
    if (!me.ok) { log('studio_login.denied', {why: 'sanity_session'}); return fail(401, DENIED) }
    const who = await me.json()
    const email = String(who.email || '').trim().toLowerCase()
    if (!email) { log('studio_login.denied', {why: 'no_email'}); return fail(401, DENIED) }
    // 2. Are they a member of the SBWPC Sanity project? Any Sanity account has a session, only members can read the project.
    const proj = await sanity(`/projects/${encodeURIComponent(projectId())}`, token)
    if (!proj.ok) { log('studio_login.denied', {why: 'not_project_member'}); return fail(403, DENIED) }
    // 3. Are they an active admin of the member system?
    const rows = await must(db().from('admins').select('email, role').eq('active', true).eq('email', email).limit(1))
    if (!rows.length) { log('studio_login.denied', {why: 'not_admin'}); return fail(403, DENIED) }
    // 4. Mark the account, then issue a one-time sign-in code
    const user = await accountFor(email)
    const {error: upErr} = await db().auth.admin.updateUserById(user.id, {app_metadata: {...(user.app_metadata || {}), studio_login_at: Math.floor(Date.now() / 1000)}})
    if (upErr) throw new Error('auth: ' + upErr.message)
    const {data: link, error: linkErr} = await db().auth.admin.generateLink({type: 'magiclink', email})
    if (linkErr || !link?.properties?.hashed_token) throw new Error('auth: ' + (linkErr?.message || 'no code'))
    log('studio_login.ok', {role: rows[0].role})
    return json({ok: true, token_hash: link.properties.hashed_token})
  } catch (err) {
    log('studio_login.failed', {message: err.message})
    return fail(502, 'We could not sign you in just now. Try again in a minute.')
  }
}

export const config = {path: '/api/admin/studio-login', method: 'POST', rateLimit: {windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain']}}
