// Drives the "manage my automatic payment" page in a real browser, desktop and phone. Our server functions,
// the database rules and the simulated PayPal API behind it are the real code.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {startSite} from './site.mjs'
import {open, shot, DESK, PHONE} from './browser.mjs'

const site = await startSite()
const {origin, sql, paypal, mail, settle} = site
let pass = 0, failed = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`) }
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
async function axe(page, label) {
  await page.evaluate(axeSrc)
  const r = await page.evaluate(async () => (await window.axe.run('main, .s-manage', {runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa']})).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target}`))
  ok(`accessibility scan: ${label}`, r.length === 0, r.join(' | '))
}
const post = async (path, body) => { const res = await fetch(origin + path, {method: 'POST', headers: {'content-type': 'application/json', origin}, body: JSON.stringify(body)}); const data = await res.json(); await settle(); return data }
const person = (over) => ({address1: '415 Garden St', city: 'Santa Barbara', state: 'CA', zip: '93101', occupation: 'Librarian', employer: 'City of Santa Barbara', attest: true, pay: 'online', ...over})
const pay = async (body) => { const r = await post('/api/checkout/create', body); await post('/api/checkout/capture', {checkoutId: r.checkoutId, subscriptionId: r.subscriptionId}); return r.subscriptionId }
const plansOf = (email) => sql(`select r.* from public.recurring_plans r join public.people p on p.id = r.person_id where p.email = $1 order by r.created_at`, [email])
const tidy = '[data-reveal]{opacity:1!important;transform:none!important} .site-header,body>header{position:static!important} .consent,[class*=consent]{display:none!important} html{scroll-behavior:auto!important}'

async function run(name, opts, who) {
  const email = `${who.toLowerCase()}@example.com`
  const duesSub = await pay(person({kind: 'dues', level: 'Advocate', frequency: 'yearly', first_name: who, last_name: 'Rivera', email}))
  const giftSub = await pay(person({kind: 'donation', amount: 25, frequency: 'monthly', first_name: who, last_name: 'Rivera', email}))
  const [dues, gift] = await plansOf(email)
  const {browser, page, errors} = await open(opts)
  await page.route(/googletagmanager|constantcontact|ctctcdn|jotfor/, (r) => r.abort())
  const seen = []
  page.on('request', (r) => seen.push(r.url()))

  // ---------- no link: ask for one ----------
  await page.goto(origin + '/manage/')
  await page.addStyleTag({content: tidy})
  await page.waitForSelector('.mg-ask:not([hidden])')
  ok(`${name}: the page is hidden from search engines`, (await page.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow')
  ok(`${name}: without a link it shows no plans, only the "email me my link" form`, await page.locator('.mg-plans').isHidden() && (await page.locator('h1').innerText()) === 'Manage your automatic payment')
  await shot(page, `manage-${name}-1-ask`)
  await axe(page, `${name} manage page, asking for a link`)
  await page.click('.mg-ask button[type=submit]')
  ok(`${name}: an empty email is caught on the page`, (await page.locator('#mg-email-err').innerText()) === 'Enter a valid email address.' && (await page.getAttribute('#mg-email', 'aria-invalid')) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'mg-email')
  const before = mail.length
  await page.fill('#mg-email', email)
  await page.click('.mg-ask button[type=submit]')
  await page.waitForSelector('.mg-note:not([hidden])')
  await settle()
  const sent = mail.at(-1)
  ok(`${name}: asking for the link emails it and says so`, (await page.locator('.mg-note').innerText()).startsWith('If that address has an automatic payment') && await page.locator('.mg-ask').isHidden() && mail.length === before + 1 && sent.to === email && sent.subject === 'Your link to manage your SBWPC automatic payment', `${mail.length - before}`)
  await shot(page, `manage-${name}-2-link-sent`)
  const link = sent.text.match(/http\S+manage\/#plan=[0-9a-f-]{36}/)[0]

  // ---------- with the emailed link ----------
  seen.length = 0
  await page.goto('about:blank')
  await page.goto(link)
  await page.addStyleTag({content: tidy})
  await page.waitForSelector('.mg-plan')
  const cards = page.locator('.mg-plan')
  ok(`${name}: the emailed link opens both plans with a greeting`, (await cards.count()) === 2 && (await page.locator('.mg-note').innerText()) === `Hi ${who}. Here is what we have on file.` && await page.locator('.mg-ask').isHidden())
  const first = await cards.nth(0).innerText()
  const second = await cards.nth(1).innerText()
  const duesCard = page.locator('.mg-plan', {hasText: 'Advocate membership'})
  const giftCard = page.locator('.mg-plan', {hasText: 'Monthly gift'})
  ok(`${name}: each plan shows its amount, status and dates`, /Advocate membership/.test(first + second) && /\$40 each year/.test(await duesCard.innerText()) && /Renews automatically each year/.test(await duesCard.innerText()) && /Next payment\s+June 15, 2027/.test(await duesCard.innerText()) && /Membership good through/.test(await duesCard.innerText()) && /\$25 each month/.test(await giftCard.innerText()) && /Repeats each month/.test(await giftCard.innerText()), first + ' // ' + second)
  ok(`${name}: the private link is taken out of the address bar and never sent in an address`, !page.url().includes('plan=') && !seen.some((u) => u.includes(dues.manage_token)) && page.url() === origin + '/manage/', page.url())
  ok(`${name}: no contact details are on the page`, !(await page.locator('.s-manage').innerText()).includes(email) && !(await page.content()).includes('415 Garden'))
  await shot(page, `manage-${name}-3-plans`)
  await axe(page, `${name} manage page with plans`)
  if (name === 'phone') ok('phone: nothing spills past the edge of the screen', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))

  // ---------- change of mind ----------
  await duesCard.locator('.mg-stop').click()
  ok(`${name}: "stop" asks first and says what happens`, await duesCard.locator('.mg-confirm').isVisible() && /Stop automatic renewal\? PayPal will not charge you again\. Your membership stays active through/.test(await duesCard.locator('.mg-question').innerText()) && (await page.evaluate(() => document.activeElement.className)) === 'mg-question' && paypal.subs.get(duesSub).status === 'ACTIVE')
  await shot(page, `manage-${name}-4-confirm`)
  await axe(page, `${name} manage page, confirming`)
  await duesCard.locator('.mg-no').click()
  ok(`${name}: "No, keep it" changes nothing`, await duesCard.locator('.mg-confirm').isHidden() && await duesCard.locator('.mg-stop').isVisible() && (await page.evaluate(() => document.activeElement.className)).includes('mg-stop') && (await plansOf(email))[0].status === 'active')

  // ---------- PayPal not answering ----------
  paypal.subs.get(duesSub).down = true
  await duesCard.locator('.mg-stop').click()
  await duesCard.locator('.mg-yes').click()
  await duesCard.locator('.mg-err:not([hidden])').waitFor()
  ok(`${name}: if PayPal cannot be reached the page says nothing changed`, /Nothing has changed/.test(await duesCard.locator('.mg-err').innerText()) && await duesCard.locator('.mg-yes').isEnabled() && (await plansOf(email))[0].status === 'active')
  paypal.subs.get(duesSub).down = false

  // ---------- stop it ----------
  const m0 = mail.length
  await duesCard.locator('.mg-yes').click()
  await page.waitForSelector('.mg-plan[data-status=cancelled]')
  await settle()
  const off = page.locator('.mg-plan[data-status=cancelled]')
  ok(`${name}: confirming stops the plan in PayPal and on the page`, paypal.subs.get(duesSub).status === 'CANCELLED' && (await plansOf(email))[0].status === 'cancelled' && /Automatic renewal is off/.test(await off.innerText()) && (await off.locator('button').count()) === 0 && /stays active through/.test(await off.innerText()))
  ok(`${name}: the result is announced and focused, and the member is emailed`, (await page.locator('.mg-note').innerText()).startsWith('Done. Automatic renewal is off') && (await page.evaluate(() => document.activeElement.className)).includes('mg-note') && mail.slice(m0).some((x) => x.to === email && x.subject.startsWith('Automatic renewal is off')))
  ok(`${name}: the other plan is still running and can still be cancelled`, paypal.subs.get(giftSub).status === 'ACTIVE' && await giftCard.locator('.mg-stop').isVisible())
  await shot(page, `manage-${name}-5-stopped`)
  await axe(page, `${name} manage page after stopping`)

  // ---------- the gift, by keyboard ----------
  await giftCard.locator('.mg-stop').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  ok(`${name}: the confirm buttons are reached by keyboard in order`, (await page.evaluate(() => document.activeElement.className)).includes('mg-yes'))
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('.mg-plan[data-status=cancelled]').length >= 1 && document.querySelector('.mg-note').textContent.startsWith('Done. Your gift is cancelled'))
  await settle()
  ok(`${name}: the gift is cancelled by keyboard alone`, paypal.subs.get(giftSub).status === 'CANCELLED' && (await plansOf(email))[1].status === 'cancelled')

  // ---------- coming back ----------
  await page.reload()
  await page.addStyleTag({content: tidy})
  await page.waitForSelector('.mg-plan')
  ok(`${name}: reloading the tab keeps the page open and shows the cancelled plan`, (await page.locator('.mg-plan[data-status=cancelled]').count()) >= 1 && (await page.locator('.mg-stop').count()) === 0)
  await page.goto(origin + '/manage/#plan=11111111-2222-4333-8444-555555555555')
  await page.reload()
  await page.waitForSelector('.mg-ask:not([hidden])')
  ok(`${name}: a link that is not valid says so and offers to email a new one`, /not valid/.test(await page.locator('.mg-note').innerText()) && (await page.locator('.mg-plan').count()) === 0)
  await shot(page, `manage-${name}-6-bad-link`)
  ok(`${name}: no script errors`, errors.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length === 0, errors.join(' | '))
  void gift
  await browser.close()
}

const sm = fs.readFileSync(new URL('../../web/dist/sitemap-0.xml', import.meta.url), 'utf8')
ok('the manage page is left out of the sitemap', !sm.includes('/manage'))
const home = fs.readFileSync(new URL('../../web/dist/index.html', import.meta.url), 'utf8')
ok('the manage page is not in the site menu or footer', !home.includes('href="/manage'))
await run('desktop', DESK, 'Jordan')
await run('phone', PHONE, 'Bea')
console.log(`\n${pass} passed, ${failed} failed`)
await site.close()
process.exit(failed ? 1 : 0)
