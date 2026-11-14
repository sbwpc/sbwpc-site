// Sends email as info@sbwpc.org through the Gmail API, using a Google service account that the Workspace admin
// has allowed to send mail for that one mailbox. No mailbox password is stored anywhere.
import {createSign} from 'node:crypto'
import {env} from './http.mjs'

export const mailFrom = () => env('MAIL_FROM') || 'info@sbwpc.org'
export const staffInbox = () => env('MAIL_STAFF_TO') || mailFrom()
export const mailConfigured = () => Boolean(env('GMAIL_SA_EMAIL') && env('GMAIL_SA_KEY'))
// off: nothing is sent. test: everything goes to MAIL_TEST_TO instead of the real person. live: normal.
export function mailMode() {
  const mode = env('MAIL_MODE')
  if (!mailConfigured()) return 'off'
  if (mode === 'live') return 'live'
  if (mode === 'test' && env('MAIL_TEST_TO')) return 'test'
  return 'off'
}

const b64url = (input) => Buffer.from(input).toString('base64url')
// The key can be pasted as the PEM text, as one line with \n marks, or as base64 of either
function privateKey() {
  let key = env('GMAIL_SA_KEY')
  if (!key.includes('BEGIN')) key = Buffer.from(key, 'base64').toString('utf8')
  return key.replace(/\\n/g, '\n').trim() + '\n'
}

let token = {value: '', expires: 0}
async function accessToken() {
  if (token.value && Date.now() < token.expires) return token.value
  const now = Math.floor(Date.now() / 1000)
  const tokenUrl = env('GOOGLE_TOKEN_URL') || 'https://oauth2.googleapis.com/token'
  const claims = {iss: env('GMAIL_SA_EMAIL'), sub: mailFrom(), scope: 'https://www.googleapis.com/auth/gmail.send', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600}
  const unsigned = b64url(JSON.stringify({alg: 'RS256', typ: 'JWT'})) + '.' + b64url(JSON.stringify(claims))
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey()).toString('base64url')
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error('google: sign-in refused (' + (data.error || res.status) + ')')
  token = {value: data.access_token, expires: Date.now() + Math.max(60, (data.expires_in || 3600) - 300) * 1000}
  return token.value
}

const header = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : '=?UTF-8?B?' + Buffer.from(text).toString('base64') + '?=')
const body64 = (text) => Buffer.from(text).toString('base64').replace(/(.{76})/g, '$1\r\n')
const clean = (v) => String(v || '').replace(/[\r\n]+/g, ' ').trim()

export function buildMime({to, subject, text, html, replyTo}) {
  const boundary = 'sbwpc-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  return [
    `From: ${header('SBWPC')} <${mailFrom()}>`,
    `To: ${clean(to)}`,
    replyTo ? `Reply-To: ${clean(replyTo)}` : null,
    `Subject: ${header(clean(subject))}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body64(html),
    `--${boundary}--`,
    '',
  ].filter((line) => line !== null).join('\r\n')
}

// Sends one email. In test mode the real recipient is swapped for the test inbox, unless direct is set
// (used for admin sign-in emails, which must always reach the admin).
export async function sendMail(message, {direct = false} = {}) {
  const mode = mailMode()
  if (mode === 'off') throw new Error('mail is switched off')
  let {to, subject} = message
  if (mode === 'test' && !direct) {
    subject = `[TEST for ${to}] ${subject}`
    to = env('MAIL_TEST_TO')
  }
  const apiBase = env('GMAIL_API_BASE') || 'https://gmail.googleapis.com'
  const res = await fetch(`${apiBase}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: {authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json'},
    body: JSON.stringify({raw: b64url(buildMime({...message, to, subject}))}),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error('gmail: send failed (' + res.status + (data.error?.status ? ' ' + data.error.status : '') + ')')
  }
  return {to, subject}
}
