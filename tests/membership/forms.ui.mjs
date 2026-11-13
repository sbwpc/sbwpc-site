// Drives the new membership and donation forms in a real browser. PayPal's browser buttons are simulated;
// everything behind them (our server functions, the database rules, the simulated PayPal API) is the real code.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {startSite} from './site.mjs'
import {open, shot, DESK, PHONE} from './browser.mjs'

const site = await startSite()
const {origin, sql, paypal} = site
let pass = 0, failed = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`) }
const sdk = fs.readFileSync(new URL('./fake-paypal-sdk.js', import.meta.url), 'utf8')
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
async function axe(page, label, scope = '.s-checkout') {
  await page.evaluate(axeSrc)
  const r = await page.evaluate(async (scope) => (await window.axe.run(scope, {runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa']})).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target}`), scope)
  ok(`accessibility scan: ${label}`, r.length === 0, r.join(' | '))
}
async function prepare(opts, {apple = false} = {}) {
  const b = await open(opts)
  await b.page.route('https://www.paypal.com/sdk/js*', (r) => r.fulfill({contentType: 'text/javascript', body: sdk}))
  await b.page.route('https://applepay.cdn-apple.com/**', (r) => r.fulfill({contentType: 'text/javascript', body: `customElements.define('apple-pay-button', class extends HTMLElement { connectedCallback() { this.style.cssText = 'display:flex;align-items:center;justify-content:center;height:48px;border-radius:4px;background:#000;color:#fff;font:600 17px/1 -apple-system,Arial,sans-serif;cursor:pointer'; this.textContent = (this.getAttribute('type') === 'donate' ? 'Donate with' : 'Pay with') + ' Apple Pay (simulated)'; this.setAttribute('role', 'button'); this.tabIndex = 0 } })`}))
  await b.page.route(/googletagmanager|constantcontact|ctctcdn|jotfor/, (r) => r.abort())
  if (apple) await b.page.addInitScript(() => {
    // Simulated Apple Pay sheet: approves at once, the way a Face ID confirmation would
    window.ApplePaySession = class { static canMakePayments() { return true } constructor(v, req) { this.req = req; window.__appleRequest = req } begin() { setTimeout(async () => { await this.onvalidatemerchant({validationURL: 'https://apple.example'}); await this.onpaymentauthorized({payment: {token: {}, billingContact: {}}}) }, 50) } completeMerchantValidation() {} completePayment(s) { window.__appleResult = s } abort() {} }
    window.ApplePaySession.STATUS_SUCCESS = 0; window.ApplePaySession.STATUS_FAILURE = 1
  })
  return b
}
const fill = async (page, over = {}) => {
  const v = {first_name: 'Jordan', last_name: 'Rivera', email: 'jordan.rivera@example.com', phone: '805-555-0142', address1: '415 Garden St', city: 'Santa Barbara', zip: '93101', occupation: 'Librarian', employer: 'City of Santa Barbara', ...over}
  for (const [k, val] of Object.entries(v)) await page.fill(`.co-form [name=${k}]`, val)
}

async function join(name, opts) {
  const {browser, page, errors} = await prepare(opts, {apple: name === 'phone'})
  await page.goto(origin + '/join-preview/')
  await page.waitForSelector('.co-form')
  ok(`${name}: preview page is hidden from search engines`, (await page.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow')
  await page.locator('.s-checkout').scrollIntoViewIfNeeded()
  await page.addStyleTag({content: '[data-reveal]{opacity:1!important;transform:none!important} .site-header,body>header{position:static!important} .consent,[class*=consent]{display:none!important}'})
  const clip = async (n) => { await page.waitForTimeout(300); await page.locator('.s-checkout').screenshot({path: (await import('./browser.mjs')).OUT + `form-join-${name}-${n}.png`}) }
  ok(`${name}: no pay buttons before a level is chosen`, await page.locator('.co-buttons').isHidden() && (await page.locator('.co-wait').isVisible()))
  await clip('1-start')
  await page.click('label.co-tile:has-text("Advocate")')
  await page.waitForSelector('.co-paypal .sim-pay')
  ok(`${name}: pay buttons appear once the level is set`, (await page.locator('.co-summary').innerText()).includes('Advocate membership: $40 for one year'))
  await page.click('.co-paypal .sim-pay >> nth=0')
  await page.waitForSelector('.co-errors:not([hidden])')
  const errs = await page.$$eval('.co-errors li', (l) => l.map((x) => x.innerText))
  ok(`${name}: paying with an empty form shows what to fix and opens no PayPal order`, errs.length >= 8 && paypal.orders.size === (join.orders || 0) && (await page.evaluate(() => document.activeElement.className)).includes('co-errors'), errs.join(' / '))
  ok(`${name}: each problem is marked on its field`, (await page.locator('.co-form [aria-invalid=true]').count()) >= 8 && (await page.locator('.co-err:not([hidden])').count()) >= 8)
  await clip('2-errors')
  await axe(page, `${name} join form with errors showing`)
  await fill(page)
  await page.click('label.co-tile:has-text("Feminist Household")')
  ok(`${name}: household level asks for the second name`, await page.locator('[name=household_name]').isVisible())
  await page.fill('[name=household_name]', 'Sam Rivera')
  await page.check('input[value="Media"]'); await page.check('input[value="Young Femmes"]')
  await page.check('[name=email_opt_in]'); await page.check('[name=attest]')
  ok(`${name}: warnings clear as each field is fixed`, (await page.locator('.co-form [aria-invalid=true]').count()) === 0 && (await page.locator('.co-errors').isHidden()))
  await clip('3-filled')
  await axe(page, `${name} join form filled in`)
  if (name === 'phone') {
    await page.waitForSelector('apple-pay-button')
    await page.locator('.co-pay-title').evaluate((el) => el.scrollIntoView({block: 'start', behavior: 'instant'})); await page.waitForTimeout(400)
    await page.screenshot({path: (await import('./browser.mjs')).OUT + `form-join-${name}-4-pay-buttons.png`})
    await page.click('apple-pay-button')
  } else {
    await page.locator('.co-pay-title').evaluate((el) => el.scrollIntoView({block: 'start', behavior: 'instant'})); await page.waitForTimeout(400)
    await page.screenshot({path: (await import('./browser.mjs')).OUT + `form-join-${name}-4-pay-buttons.png`})
    await page.click('.co-paypal .sim-pay >> nth=0')
  }
  await page.waitForSelector('.co-done:not([hidden])')
  const receipt = await page.locator('.co-receipt').innerText()
  const m = (await sql(`select m.level, m.state, m.household_name, m.committees, m.expires_on::text e, y.method, y.amount_cents, p.email_opt_in from public.people p join public.memberships m on m.person_id = p.id join public.payments y on y.person_id = p.id where p.email = 'jordan.rivera@example.com' order by y.created_at desc limit 1`))[0]
  ok(`${name}: payment goes through and the receipt shows`, /Thank you, Jordan/.test(receipt) && receipt.includes('Feminist Household membership') && receipt.includes('$60') && receipt.includes('Membership good through') && receipt.includes('not tax deductible'), receipt)
  ok(`${name}: the member record matches what was entered`, m && m.level === 'Feminist Household' && m.state === 'active' && m.household_name === 'Sam Rivera' && m.committees.length === 2 && m.amount_cents === 6000 && m.email_opt_in === true && m.method === (name === 'phone' ? 'apple_pay' : 'paypal'), JSON.stringify(m))
  if (name === 'phone') ok('phone: Apple Pay sheet was asked for the right total and told it succeeded', (await page.evaluate(() => window.__appleRequest.total.amount + '|' + window.__appleResult)) === '60.00|0')
  await page.waitForTimeout(900)
  await page.locator('.co-receipt').screenshot({path: (await import('./browser.mjs')).OUT + `form-join-${name}-5-receipt.png`})
  await axe(page, `${name} receipt`)

  // Same person again, auto-renew this time, then a check
  await page.reload(); await page.waitForSelector('.co-form'); await page.addStyleTag({content: '[data-reveal]{opacity:1!important;transform:none!important} .site-header,body>header{position:static!important} .consent,[class*=consent]{display:none!important}'})
  await page.click('label.co-tile:has-text("Access")')
  await fill(page); await page.check('[name=attest]'); await page.check('[name=auto_renew]')
  await page.waitForSelector('.co-paypal .sim-pay:has-text("Subscribe")')
  ok(`${name}: choosing auto-renew switches to a yearly PayPal plan and hides Apple Pay`, (await page.locator('.co-summary').innerText()).includes('each year, renewing automatically') && (await page.locator('.co-apple').isHidden()))
  await page.click('.co-paypal .sim-pay')
  await page.waitForSelector('.co-done:not([hidden])')
  const again = await sql(`select m.level, m.auto_renew, m.expires_on::text e, (select count(*)::int from public.people where email = 'jordan.rivera@example.com') people, (select count(*)::int from public.memberships mm where mm.person_id = m.person_id) ms from public.memberships m join public.people p on p.id = m.person_id where p.email = 'jordan.rivera@example.com'`)
  ok(`${name}: renewing with the same email updates the member, no duplicate, one more year`, again.length === 1 && again[0].people === 1 && again[0].ms === 1 && again[0].level === 'Access' && again[0].auto_renew === true && Number(again[0].e.slice(0, 4)) === Number(m.e.slice(0, 4)) + 1 && (await page.locator('.co-receipt').innerText()).includes('renewed'), JSON.stringify(again))

  await page.reload(); await page.waitForSelector('.co-form'); await page.addStyleTag({content: '[data-reveal]{opacity:1!important;transform:none!important} .site-header,body>header{position:static!important} .consent,[class*=consent]{display:none!important}'})
  await page.click('label.co-tile:has-text("Voice")')
  await fill(page, {first_name: 'Check', last_name: 'Writer' + name, email: `check.${name}@example.com`}); await page.check('[name=attest]')
  await page.click('.co-how label:has-text("Mail a check")')
  ok(`${name}: choosing a check hides the pay buttons and the auto-renew box`, await page.locator('.co-online').isHidden() && (await page.locator('.co-renew').isHidden()) && (await page.locator('.co-check-pay').isVisible()))
  await page.locator('.co-pay-title').evaluate((el) => el.scrollIntoView({block: 'start', behavior: 'instant'})); await page.waitForTimeout(400)
  await page.screenshot({path: (await import('./browser.mjs')).OUT + `form-join-${name}-6-check-option.png`})
  await page.click('.co-check-pay button')
  await page.waitForSelector('.co-done:not([hidden])')
  const chk = await page.locator('.co-receipt').innerText()
  ok(`${name}: check confirmation shows where to mail it and how much`, /mail your check/i.test(chk) && chk.includes('P.O. Box 90618') && chk.includes('$300') && chk.includes('memo line') && !chk.includes('Transaction number'), chk)
  ok(`${name}: the check is waiting for an admin, with no member or payment yet`, (await sql(`select count(*)::int n from public.checkouts where mode = 'check' and status = 'pending' and payload->>'email' = $1`, [`check.${name}@example.com`]))[0].n === 1 && (await sql(`select count(*)::int n from public.people where email = $1`, [`check.${name}@example.com`]))[0].n === 0)
  await page.waitForTimeout(900)
  await page.locator('.co-receipt').screenshot({path: (await import('./browser.mjs')).OUT + `form-join-${name}-7-check-confirmation.png`})
  ok(`${name}: join page has no script errors`, errors.length === 0, errors.join(' || '))
  join.orders = paypal.orders.size
  await browser.close()
}

async function donate(name, opts) {
  const {browser, page, errors} = await prepare(opts)
  const O = (await import('./browser.mjs')).OUT
  await page.goto(origin + '/donate-preview/')
  await page.waitForSelector('.co-form')
  await page.addStyleTag({content: '[data-reveal]{opacity:1!important;transform:none!important} .site-header,body>header{position:static!important} .consent,[class*=consent]{display:none!important}'})
  await page.locator('.s-checkout').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.locator('.s-checkout').screenshot({path: O + `form-donate-${name}-1-start.png`})
  await axe(page, `${name} donate form`)
  await page.click('label.co-tile:has-text("Another amount")')
  await page.fill('[name=amount]', '75')
  await page.click('.co-seg label:has-text("Monthly")')
  await page.waitForSelector('.co-paypal .sim-pay:has-text("Subscribe")')
  ok(`${name}: custom amount and monthly giving set the total`, (await page.locator('.co-summary').innerText()) === 'Your gift: $75 each month')
  await page.click('.co-how label:has-text("Mail a check")')
  ok(`${name}: a check is offered for one payment only, and says so`, (await page.locator('.co-summary').innerText()) === 'Your gift: $75' && (await page.locator('.co-recurring-note').isVisible()))
  await page.click('.co-how label:has-text("Pay online")')
  await page.click('.co-seg label:has-text("One time")')
  await page.waitForSelector('.co-paypal .sim-pay:has-text("PayPal (simulated)")')
  await fill(page, {first_name: 'Morgan', last_name: 'Lee', email: `morgan.${name}@example.com`})
  await page.fill('[name=in_honor_of]', 'Lois Phillips')
  await page.check('input[name=honor_type][value=memory]')
  await page.check('[name=attest]')
  await page.locator('.s-checkout').screenshot({path: O + `form-donate-${name}-2-filled.png`})
  // Cancel in PayPal: nothing charged, form still there
  await page.evaluate(() => { window.__simCancel = true })
  await page.click('.co-paypal .sim-pay >> nth=0')
  await page.waitForSelector('.co-status:not([hidden])')
  ok(`${name}: cancelling in PayPal says nothing was charged and keeps the form`, (await page.locator('.co-status').innerText()).includes('Nothing was charged') && (await page.locator('.co-form').isVisible()) && (await sql(`select count(*)::int n from public.payments y join public.people p on p.id = y.person_id where p.email = $1`, [`morgan.${name}@example.com`]))[0].n === 0)
  // A declined card (the simulated PayPal declines $13.13)
  await page.fill('[name=amount]', '13.13')
  await page.click('.co-paypal .sim-pay >> nth=1')
  await page.waitForSelector('.co-errors:not([hidden])')
  ok(`${name}: a declined card shows a clear message and records nothing`, (await page.locator('.co-errors').innerText()).includes('declined') && (await page.locator('.co-form').isVisible()))
  await page.locator('.co-card').first().screenshot({path: O + `form-donate-${name}-3-declined.png`})
  await page.fill('[name=amount]', '75')
  await page.click('.co-paypal .sim-pay >> nth=1')
  await page.waitForSelector('.co-done:not([hidden])')
  const r = await page.locator('.co-receipt').innerText()
  const pay = (await sql(`select y.amount_cents, y.in_honor_of, y.kind, y.method, y.paypal_capture_id from public.payments y join public.people p on p.id = y.person_id where p.email = $1`, [`morgan.${name}@example.com`]))
  ok(`${name}: donation goes through once, with the dedication`, pay.length === 1 && pay[0].amount_cents === 7500 && pay[0].in_honor_of === 'In memory of Lois Phillips' && r.includes('In memory of Lois Phillips') && r.includes('$75') && r.includes(pay[0].paypal_capture_id), JSON.stringify(pay) + r)
  await page.waitForTimeout(900)
  await page.locator('.co-receipt').screenshot({path: O + `form-donate-${name}-4-receipt.png`})
  await page.emulateMedia({media: 'print'})
  ok(`${name}: printing shows the receipt without the site header`, await page.evaluate(() => getComputedStyle(document.querySelector('header')).display === 'none' && getComputedStyle(document.querySelector('.co-receipt')).display !== 'none'))
  await page.emulateMedia({media: 'screen'})
  const real = errors.filter((e) => !e.includes('status of 402')) // the declined-card test answers 402 on purpose
  ok(`${name}: donate page has no script errors`, real.length === 0, real.join(' || '))
  await browser.close()
}

// Keyboard only: choose, fill and reach the pay button without a mouse
async function keyboard() {
  const {browser, page} = await prepare(DESK)
  await page.goto(origin + '/join-preview/')
  await page.waitForSelector('.co-form')
  await page.focus('input[name=level]')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  const picked = await page.evaluate(() => document.querySelector('input[name=level]:checked').value)
  const ring = await page.evaluate(() => getComputedStyle(document.querySelector('label.co-tile:has(input:checked)')).outlineStyle)
  ok('keyboard: arrow keys move between levels and the focus ring shows', picked === 'Advocate' && ring === 'solid', picked + ' ' + ring)
  await browser.close()
}

// The live pages still use JotForm and do not load the new form or PayPal
{
  const {browser, page} = await open(DESK)
  let paypalLoaded = false
  page.on('request', (r) => { if (/paypal\.com\/sdk/.test(r.url())) paypalLoaded = true })
  await page.route(/jotfor|googletagmanager|constantcontact|ctctcdn/, (r) => r.abort())
  await page.goto(origin + '/join/')
  ok('the live Join page is unchanged: JotForm form, no new checkout', (await page.locator('iframe.jf-frame').count()) === 1 && (await page.locator('.co-form').count()) === 0 && !paypalLoaded)
  await page.goto(origin + '/donate/')
  ok('the live Donate page is unchanged: JotForm form, no new checkout', (await page.locator('iframe.jf-frame').count()) === 1 && (await page.locator('.co-form').count()) === 0)
  const sm = fs.readFileSync(new URL('../../web/dist/sitemap-0.xml', import.meta.url), 'utf8')
  ok('preview and admin pages are left out of the sitemap', !sm.includes('preview') && !sm.includes('/admin'))
  await browser.close()
}
await join('desktop', DESK)
await join('phone', PHONE)
await donate('desktop', DESK)
await donate('phone', PHONE)
await keyboard()
console.log(`\n${pass} passed, ${failed} failed`)
await site.close()
process.exit(failed ? 1 : 0)
