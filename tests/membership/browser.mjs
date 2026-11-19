// Shared Playwright setup for the local tests.
import {chromium, devices} from 'playwright'
import fs from 'node:fs'
export const OUT = (process.env.SHOTS_DIR || new URL('./shots', import.meta.url).pathname).replace(/\/?$/, '/')
fs.mkdirSync(OUT, {recursive: true})
export const SUPA = 'https://rbvhmrsepsategvrmqcv.supabase.co'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export const jwt = (email, studioLoginAt = Math.floor(Date.now() / 1000)) => `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: '11111111-1111-4111-8111-111111111111', email, aal: 'aal1', amr: [{method: 'otp', timestamp: 1}], app_metadata: studioLoginAt ? {studio_login_at: studioLoginAt} : {}, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: 's1'})}.sig`
export const DESK = {viewport: {width: 1360, height: 900}, deviceScaleFactor: 2}
export const PHONE = {...devices['iPhone 13']}

export async function open(opts) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})
  const ctx = await browser.newContext({...opts, acceptDownloads: true})
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message.slice(0, 300)))
  return {browser, ctx, page, errors}
}

// Supabase sign-in is simulated. Database calls go to the local copy with the same access rules.
export async function fakeSupabase(page, email) {
  const user = () => ({id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email, role: 'authenticated'})
  const session = () => ({access_token: jwt(email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: user()})
  await page.route(SUPA + '/**', async (r) => {
    const req = r.request()
    const u = new URL(req.url())
    const cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
    const j = (o, s = 200) => r.fulfill({status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o)})
    if (req.method() === 'OPTIONS') return r.fulfill({status: 204, headers: cors})
    if (u.pathname === '/auth/v1/token') return j(session())
    if (u.pathname === '/auth/v1/user') return j(user())
    // The one-time code from the studio-login function is exchanged for a session
    if (u.pathname === '/auth/v1/verify') return String(req.postData() || '').includes('HASH-') ? j(session()) : j({message: 'bad code'}, 403)
    if (u.pathname === '/auth/v1/logout') return r.fulfill({status: 204, headers: cors})
    if (u.pathname.startsWith('/rest/v1/')) {
      const res = await fetch('http://localhost:54330' + u.pathname + u.search, {method: req.method(), headers: {authorization: req.headers().authorization || '', apikey: req.headers().apikey || '', prefer: req.headers().prefer || '', 'content-type': 'application/json'}, body: req.postData() || undefined})
      return r.fulfill({status: res.status, contentType: 'application/json', headers: cors, body: await res.text()})
    }
    return j({}, 404)
  })
}
// Opens the admin the way the Studio does: with the person's Sanity session after the # in the address
export async function signIn(page, origin, token = 'MEMBER-luke-0000000000000000') {
  await page.goto(origin + '/admin/#studio=' + token)
  await page.waitForSelector('#app h1')
}
export const shot = async (page, name, full = true) => { await page.waitForTimeout(250); await page.screenshot({path: OUT + name + '.png', fullPage: full}) }
