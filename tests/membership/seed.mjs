// Made-up people for local screenshots and tests. No real member data is used anywhere in testing.
import pg from 'pg'
const db = new pg.Client({host: process.env.PGHOST || '/var/tmp/pgtest', port: Number(process.env.PGPORT || 54329), user: 'postgres', database: process.env.TEST_DB || 't'})
await db.connect()
const first = ['Maria', 'Dana', 'Priya', 'Helen', 'Rosa', 'Joan', 'Tessa', 'Naomi', 'Carmen', 'Lucy', 'Irene', 'Sam', 'Alex', 'Robin', 'Grace', 'Olivia', 'Elena', 'Nora', 'June', 'Ruth', 'Paula', 'Kim', 'Ada', 'Vera', 'Sofia', 'Leah', 'Mona', 'Faye', 'Gwen', 'Iris', 'Tara', 'Jo', 'Bea', 'Cora', 'Dee', 'Eve']
const last = ['Alvarez', 'Bennett', 'Chandra', 'Dawson', 'Estrada', 'Fields', 'Garner', 'Hollis', 'Ibarra', 'Jensen', 'Keller', 'Lowe', 'Marsh', 'Novak', 'Ortega', 'Pruitt', 'Quinn', 'Reyes', 'Sato', 'Tran', 'Ueda', 'Vance', 'Webb', 'Xu', 'Yates', 'Zamora', 'Abbott', 'Bloom', 'Cruz', 'Doyle', 'Ellis', 'Frost', 'Gill', 'Hart', 'Ives', 'Jude']
const levels = ['Friend', 'Advocate', 'Advocate', 'Feminist Household', 'Access', 'Advocate', 'Voice', 'Friend', 'Power', 'Advocate', 'Feminist Champion', 'Friend']
const price = {Friend: 16, Advocate: 40, 'Feminist Household': 60, Access: 125, Voice: 300, Power: 500, 'Feminist Champion': 1000, Legacy: 5000}
const cities = [['Santa Barbara', '93101'], ['Goleta', '93117'], ['Carpinteria', '93013'], ['Montecito', '93108'], ['Santa Maria', '93454'], ['Lompoc', '93436']]
const jobs = [['Teacher', 'Santa Barbara Unified'], ['Nurse', 'Cottage Health'], ['Attorney', 'Self-employed'], ['Retired', 'None'], ['Professor', 'UCSB'], ['Small business owner', 'Bloom Bookshop'], ['Engineer', 'Self-employed'], ['Social worker', 'County of Santa Barbara']]
const committees = ['Legislation and Advocacy', 'Membership', 'Candidate Development', 'Media', 'Elections and Appointments', 'Event Planning', 'Young Femmes']
const today = new Date(new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(new Date()) + 'T12:00:00Z')
const ago = (days) => new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10)
await db.query(`set role service_role`)
const rec = (p) => db.query(`select public.record_payment($1::jsonb)`, [JSON.stringify(p)])
for (let i = 0; i < 36; i++) {
  const [city, zip] = cities[i % cities.length]
  const [occupation, employer] = jobs[i % jobs.length]
  const level = levels[i % levels.length]
  const base = {first_name: first[i], last_name: last[i], email: `${first[i]}.${last[i]}@example.com`.toLowerCase(), phone: `805-555-01${String(i).padStart(2, '0')}`, address1: `${100 + i * 7} ${['Anapamu', 'State', 'Milpas', 'Cabrillo', 'Olive'][i % 5]} St`, city, state: 'CA', zip, occupation, employer, email_opt_in: i % 4 !== 0}
  // Spread join dates so some memberships are about to expire and some have lapsed
  const joined = i < 4 ? ago(340 + i * 6) : i < 7 ? ago(380 + i * 9) : ago((i * 9) % 300)
  if (i % 9 !== 8) {
    const paid = {...base, kind: 'dues', level, amount_cents: price[level] * 100, paid_on: joined, method: i % 5 === 0 ? 'check' : i % 5 === 1 ? 'apple_pay' : 'paypal', paypal_capture_id: i % 5 === 0 ? null : 'SEED-D' + i, committees: i % 3 === 0 ? [committees[i % 7], committees[(i + 3) % 7]] : i % 3 === 1 ? [committees[i % 7]] : [], source: i % 5 === 0 ? 'manual' : 'web'}
    if (level === 'Feminist Household') paid.household_name = `Pat ${last[i]}`
    if (i % 5 === 0) paid.note = 'Check ' + (2040 + i)
    if (i === 12 || i === 20) { paid.subscription_id = 'I-SEED' + i; paid.frequency = 'yearly' }
    await rec(paid)
  }
  if (i % 4 === 1 || i % 9 === 8) await rec({...base, kind: 'donation', amount_cents: [2500, 5000, 10000, 25000, 7500][i % 5], paid_on: ago((i * 5) % 200), method: 'paypal', paypal_capture_id: 'SEED-G' + i, in_honor_of: i === 13 ? 'In memory of Ellen Marsh' : null})
  if (i === 5) for (let k = 0; k < 3; k++) await rec({...base, kind: 'donation', amount_cents: 2500, paid_on: ago(20 + k * 30), method: 'paypal', paypal_capture_id: 'SEED-M' + k, subscription_id: 'I-SEEDM', frequency: 'monthly'})
}
await db.query(`update public.memberships set state = 'cancelled' where person_id = (select id from public.people where last_name = 'Vance')`)
await db.query(`update public.people set notes = 'Prefers phone calls. Offered to host a house party in spring.' where last_name = 'Alvarez'`)
const check = (kind, amount, p) => db.query(`insert into public.checkouts (kind, mode, amount_cents, payload, created_at) values ($1, 'check', $2, $3, now() - ($4 || ' days')::interval)`, [kind, amount, JSON.stringify(p), p.days])
await check('dues', 12500, {days: 3, level: 'Access', first_name: 'Winnie', last_name: 'Okafor', email: 'winnie.okafor@example.com', phone: '805-555-0190', address1: '12 Garden Ln', city: 'Santa Barbara', state: 'CA', zip: '93105', occupation: 'Architect', employer: 'Okafor Design', email_opt_in: true, committees: ['Event Planning']})
await check('donation', 20000, {days: 6, first_name: 'Harriet', last_name: 'Lindqvist', email: 'harriet.l@example.com', address1: '88 Mesa Rd', city: 'Santa Barbara', state: 'CA', zip: '93109', occupation: 'Retired', employer: 'None', email_opt_in: false, in_honor_of: 'In honor of the founders'})
await check('dues', 4000, {days: 1, level: 'Advocate', first_name: 'Maria', last_name: 'Alvarez', email: 'maria.alvarez@example.com', address1: '100 Anapamu St', city: 'Santa Barbara', state: 'CA', zip: '93101', occupation: 'Teacher', employer: 'Santa Barbara Unified', email_opt_in: true})
await db.query(`reset role`)
await db.query(`insert into public.admins (email, role) values ('treasurer@example.com', 'treasurer') on conflict do nothing`)
const n = await db.query(`select (select count(*) from public.people) people, (select count(*) from public.memberships) memberships, (select count(*) from public.payments) payments, (select count(*) from public.checkouts) checks, (select string_agg(status || ' ' || c, ', ') from (select status, count(*) c from public.membership_status group by 1) s) statuses`)
console.log(n.rows[0])
await db.end()
