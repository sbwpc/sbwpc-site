// The studio-login function: who gets in from the Studio, and what it writes. Uses the simulated Sanity and Supabase Auth.
import {startSite} from './site.mjs'
import {authState} from './shim.mjs'

const site = await startSite()
const {origin, sql} = site
let pass = 0, failed = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`) }
const login = (token, headers = {}) => fetch(origin + '/api/admin/studio-login', {method: 'POST', headers: {'content-type': 'application/json', origin, ...headers}, body: JSON.stringify({token})})
await sql(`insert into public.admins (email, role) values ('luke@coolhandlook.com','admin'), ('treasurer@example.com','treasurer') on conflict do nothing`)

authState.reset()
let r = await login('MEMBER-luke-0000000000000000')
let out = await r.json()
ok('a Sanity project member on the admin list gets a one-time code', r.status === 200 && out.ok && /^HASH-/.test(out.token_hash), JSON.stringify(out))
const luke = authState.users.find((u) => u.email === 'luke@coolhandlook.com')
ok('their account is created on first use and marked with the Studio sign-in time', luke && Math.abs(luke.app_metadata.studio_login_at - Date.now() / 1000) < 10, JSON.stringify(luke))
ok('the one-time code belongs to that account', authState.links.get(out.token_hash) === luke.id)
await login('MEMBER-luke-0000000000000000')
ok('a second sign-in reuses the account', authState.users.filter((u) => u.email === 'luke@coolhandlook.com').length === 1)

r = await login('MEMBER-treasurer-00000000000')
ok('a treasurer can sign in too (the database keeps them view-only)', r.status === 200)

authState.reset()
r = await login('MEMBER-notadmin-0000000000000')
ok('a project member who is not on the admin list is refused', r.status === 403 && authState.users.length === 0)
r = await login('OUTSIDER-luke-000000000000000')
ok('a Sanity account that is not in the SBWPC project is refused, even with an admin email', r.status === 403 && authState.users.length === 0)
r = await login('NOT-A-REAL-SESSION-000000000')
ok('an unknown or expired Sanity session is refused', r.status === 401)
r = await login('short')
ok('an empty or malformed token is refused without calling Sanity', r.status === 401)
r = await login('MEMBER-luke-0000000000000000', {origin: 'https://evil.example'})
ok('a request from another website is refused', r.status === 403)
await sql(`update public.admins set active = false where email = 'luke@coolhandlook.com'`)
r = await login('MEMBER-luke-0000000000000000')
ok('a deactivated admin is refused', r.status === 403)
const bodies = JSON.stringify(await Promise.all([r.clone().json()]))
ok('refusals do not say which check failed', !/not_admin|not_project|sanity_session|deactivated/i.test(bodies), bodies)

console.log(`\n${pass} passed, ${failed} failed`)
await site.close()
process.exit(failed ? 1 : 0)
