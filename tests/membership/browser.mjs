// Shared Playwright setup for the local tests.
import {chromium, devices} from 'playwright'
import fs from 'node:fs'
export const OUT = (process.env.SHOTS_DIR || new URL('./shots', import.meta.url).pathname).replace(/\/?$/, '/')
fs.mkdirSync(OUT, {recursive: true})
export const SUPA = 'https://rbvhmrsepsategvrmqcv.supabase.co'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export const jwt = (email, aal = 'aal2') => `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: '11111111-1111-4111-8111-111111111111', email, aal, amr: [{method: 'password', timestamp: 1}], exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: 's1'})}.sig`
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
  let aal = 'aal1'
  const user = () => ({id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email, role: 'authenticated', factors: [{id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'SBWPC admin'}]})
  const session = () => ({access_token: jwt(email, aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user: user()})
  await page.route(SUPA + '/**', async (r) => {
    const req = r.request()
    const u = new URL(req.url())
    const cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
    const j = (o, s = 200) => r.fulfill({status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o)})
    if (req.method() === 'OPTIONS') return r.fulfill({status: 204, headers: cors})
    if (u.pathname === '/auth/v1/token') return j(session())
    if (u.pathname === '/auth/v1/user') return j(user())
    if (u.pathname.endsWith('/challenge')) return j({id: 'c1', type: 'totp', expires_at: Date.now() / 1000 + 300})
    if (u.pathname.endsWith('/verify')) { aal = 'aal2'; return j(session()) }
    if (u.pathname === '/auth/v1/logout') return r.fulfill({status: 204, headers: cors})
    if (u.pathname.startsWith('/rest/v1/')) {
      const res = await fetch('http://localhost:54330' + u.pathname + u.search, {method: req.method(), headers: {authorization: req.headers().authorization || '', apikey: req.headers().apikey || '', prefer: req.headers().prefer || '', 'content-type': 'application/json'}, body: req.postData() || undefined})
      return r.fulfill({status: res.status, contentType: 'application/json', headers: cors, body: await res.text()})
    }
    return j({}, 404)
  })
}
export async function signIn(page, origin) {
  await page.goto(origin + '/admin/')
  await page.waitForSelector('#v-signin:not([hidden])')
  await page.fill('#si-email', 'someone@example.com')
  await page.fill('#si-pass', 'local-test-only')
  await page.click('#f-signin button[type=submit]')
  await page.waitForSelector('#v-verify:not([hidden])')
  await page.fill('#vf-code', '123456')
  await page.click('#f-verify button[type=submit]')
  await page.waitForSelector('#app h1')
}
export const shot = async (page, name, full = true) => { await page.waitForTimeout(250); await page.screenshot({path: OUT + name + '.png', fullPage: full}) }
