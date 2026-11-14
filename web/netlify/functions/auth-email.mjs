// Supabase calls this address whenever the admin needs a sign-in email (an invitation or a password reset).
// We send it from info@sbwpc.org. Every call is checked against a shared secret before anything is sent.
import {createHmac, timingSafeEqual} from 'node:crypto'
import {env, json, fail, log} from '../lib/http.mjs'
import {mailConfigured, mailMode, sendMail} from '../lib/mail.mjs'
import {authEmail} from '../lib/emails.mjs'

// Standard Webhooks signature: HMAC-SHA256 over "id.timestamp.body" with the base64 secret after "whsec_"
function verified(req, raw) {
  const secret = env('SUPABASE_AUTH_HOOK_SECRET').replace(/^v1,/, '').replace(/^whsec_/, '')
  const id = req.headers.get('webhook-id')
  const timestamp = req.headers.get('webhook-timestamp')
  const given = req.headers.get('webhook-signature') || ''
  if (!secret || !id || !timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${timestamp}.${raw}`).digest()
  return given.split(' ').some((part) => {
    const sig = Buffer.from(part.replace(/^v1,/, ''), 'base64')
    return sig.length === expected.length && timingSafeEqual(sig, expected)
  })
}

export default async (req) => {
  const raw = await req.text()
  if (raw.length > 50000 || !verified(req, raw)) {
    log('auth_email.rejected')
    return fail(401, 'signature not verified')
  }
  if (!mailConfigured() || mailMode() === 'off') return json({error: {http_code: 503, message: 'Email is not set up yet.'}}, 503)
  try {
    const {user, email_data: d} = JSON.parse(raw)
    const action = d.email_action_type
    const to = action === 'email_change' && user.new_email ? user.new_email : user.email
    const link = `${env('SUPABASE_URL')}/auth/v1/verify?${new URLSearchParams({token: d.token_hash, type: action, redirect_to: d.redirect_to || d.site_url || ''})}`
    await sendMail({to, ...authEmail({action, link, code: d.token})}, {direct: true})
    log('auth_email.sent', {action})
    return json({})
  } catch (err) {
    log('auth_email.failed', {message: err.message})
    return json({error: {http_code: 500, message: 'The email could not be sent. Try again in a minute.'}}, 500)
  }
}

export const config = {path: '/api/auth/email', method: 'POST'}
