# SBWPC membership and donation system: proposal

Status: proposal, awaiting approval. Nothing is built yet.
Date: November 12, 2026

## Recommendation

Build it on the site's existing Netlify hosting with three free services added:

- Supabase: the database and the admin login with two-factor codes.
- PayPal's own checkout: PayPal and Apple Pay buttons on our pages, plus PayPal subscriptions for auto-renew and recurring gifts.
- Resend: sends receipts and renewal reminders from info@sbwpc.org.

Monthly cost: $0 plus PayPal's normal payment fees.

## Options compared

| | A. Supabase + Netlify (recommended) | B. Neon database + custom login | C. Google Sheet + Apps Script |
|---|---|---|---|
| Monthly cost | $0 | $0 | $0 |
| Two-factor admin login | Built in (authenticator app codes) | I would have to write and maintain it | Google account 2-step |
| Data protection | Encrypted database, per-row access rules enforced by the database | Encrypted database, rules live in our code | A spreadsheet anyone with the link or a shared account can copy |
| Audit log, exports, search | Yes | Yes | Weak |
| Maintenance risk | Low: login and security are a maintained product | Higher: custom security code | Low to build, fragile at scale |
| Fit for "robust" | Strong | Strong but riskier | Not much better than today |

Why A: the riskiest part of a system like this is the login and access control. Supabase provides that as a tested product, including two-factor codes, on its free plan. Option B means writing that part by hand. Option C keeps the weakness the client wants to leave.

## Limits to know about (verified November 12, 2026)

- Supabase free plan: 500 MB database (room for many thousands of members), basic multi-factor login included, no automatic backups, and projects pause after one week with no activity. The daily reminder job keeps it active. I will build a nightly encrypted backup. The paid plan ($25 a month) adds managed daily backups and is the upgrade path if the client wants it.
- Apple Pay through PayPal handles one-time payments only. Auto-renew and recurring gifts run through PayPal subscriptions (PayPal balance, bank or card). Apple Pay stays available for one-time dues and gifts.
- Apple Pay through PayPal needs the SBWPC PayPal business account approved for it and the sbwpc.org domain registered in PayPal. The current JotForm already offers Apple Pay through that account, so approval is likely in place.
- Resend free plan: 3,000 emails a month, 100 a day. Enough for receipts and reminders. Newsletters stay in Constant Contact.
- Netlify scheduled jobs run on every plan, with a 30 second limit per run. The reminder job fits easily.

## Workflow

### Member
1. Opens the Join page, picks a level, fills in name, address, phone, occupation and employer, committees, email permission.
2. Chooses one-time or auto-renew yearly. Pays with PayPal or Apple Pay (one-time) without leaving the page.
3. Gets a receipt and welcome email. Record is created with start date and expiration date.
4. Gets reminders 30 days before, 7 days before and on the expiration date. Each has a personal renew link that opens the form with their details filled in. No password needed.
5. Auto-renew members get a heads-up email before PayPal charges them, and a receipt after.
6. If a membership lapses, status changes to expired and one "we miss you" email goes out after 14 days.

### Donor
1. Opens the Donate page, picks an amount, chooses one-time, monthly or yearly.
2. Fills in the FPPC details. Pays with PayPal or Apple Pay (one-time).
3. Gets a receipt that states the gift is not tax deductible.
4. Recurring donors get a receipt for each charge and a link to cancel or change the gift.
5. Failed recurring payments trigger an email to the donor and a flag for the treasurer.

### Admin (board members with access)
1. Signs in at a private address with email, password and a 6-digit authenticator code. Two-factor is required, not optional.
2. Dashboard: active members, expiring in 30 days, expired, new this month, dues and gifts this month and year, failed payments.
3. Members list: search, filter by status, level or committee, open a record, edit, add a note, record a check or cash payment by hand.
4. Donations list: every gift, recurring schedules, each person's running total for the calendar year with a flag at $100 for FPPC reporting.
5. One-click actions: send a reminder now, resend a receipt, copy a renew link.
6. Exports: CSV for the treasurer (Form 460 fields: name, address, occupation, employer, date, amount, cumulative total), CSV of emails with permission for Constant Contact.
7. Every change is written to an audit log: who, what, when.

## Data model

- people: name, email, phone, address, occupation, employer, email permission, notes.
- memberships: person, level, start date, expiration date, status, auto-renew flag, PayPal subscription ID, household second name, committees, referred by.
- payments: person, type (dues or donation), amount, date, method (PayPal, Apple Pay, check, cash), PayPal transaction ID, in honor or memory of, linked membership or recurring plan.
- recurring_plans: person, amount, frequency, status, PayPal subscription ID, next charge date.
- reminders: membership, kind (30 day, 7 day, day of, lapsed), sent date, result.
- admins: user, role (admin or treasurer), two-factor status.
- audit_log: admin, action, record, before and after, time.

No card or bank numbers are stored anywhere in our system. PayPal holds them.

## Security

- All traffic over HTTPS. Database encrypted at rest.
- The public forms can only add a pending record. They cannot read anything.
- A payment is marked paid only after our server confirms it with PayPal directly.
- Admin pages work only for signed-in admins who passed the two-factor step. The database itself enforces this, not just the page.
- Secret keys live in Netlify's protected settings, never in the code.
- Nightly encrypted backup, kept 30 days.
- Member data never goes into the website's code repository, which is public.

## Import of existing records

The Google Sheet has about 55 membership rows (May to October 2026) and 3 donations. It needs cleanup before import:

- Dates use mixed formats and a few have typos (one says 2029, one is out of order).
- A few rows have columns shifted (city and state swapped into the wrong cells).
- Some rows have no PayPal transaction ID (entered by hand).
- Two rows cover two people in one household.

I will import into a review screen first, flag every row that needs a decision, and only write to the live database after someone approves the cleaned list.

## Accounts the client needs

| Account | Cost | Who sets it up |
|---|---|---|
| Supabase, under info@sbwpc.org | Free | I can do this through the client's GitHub login, with your OK |
| PayPal developer app on the existing SBWPC business account | Free | Client signs in to PayPal; I guide the rest |
| Resend, under info@sbwpc.org | Free | I can create it; needs 3 DNS records at GoDaddy |
| Authenticator app on each admin's phone | Free | Each admin |

## Build stages

1. Foundation: database, security rules, admin login with two-factor, backup job. Test: only approved admins get in; a logged-out visitor gets nothing.
2. Membership form and PayPal checkout in PayPal's test mode. Test: every level, one-time and auto-renew, Apple Pay on an iPhone, failed and cancelled payments.
3. Donation form with one-time and recurring. Test: same matrix, plus FPPC running totals.
4. Emails: receipts, the reminder schedule, renew links. Test: time-travel test data so each reminder fires once and only once.
5. Admin dashboard, lists, manual payments, exports, audit log. Test: treasurer export checked against test payments to the cent.
6. Import and cleanup of the existing sheet. Test: counts and totals match the sheet.
7. Go live: switch PayPal to live mode, replace the JotForm embeds, update the Privacy and Cookie policies, keep JotForm available as a fallback for two weeks.

Each stage is shown to you before the next one starts. Nothing goes live without your "deploy".

## Open questions

1. Membership term: 12 months from the payment date, or a calendar year?
2. Who should have admin access (names and emails), and should the treasurer have a separate export-only role?
3. Is there an older member list besides this sheet (before May 2026)? The sheet's first tab is empty.
4. Should the code repository be made private? Netlify's paid plan now allows it. Not required for security, since no data or keys live in the code, but it is tidier.
5. Reminder timing: 30 days, 7 days and day-of, plus one lapsed notice at 14 days. Change any of these?
6. Household memberships: record one person or two?
