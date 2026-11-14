// Test-only simulated Google: the sign-in exchange for a service account and the Gmail send call.
// It checks the same things Google checks (signature, who the mail is sent as, the permission asked for)
// and keeps every "sent" email in memory so tests can read them.
import http from 'node:http'
import {createVerify} from 'node:crypto'

export function startGoogleMock({port = 54332, publicKey, serviceEmail, mailbox}) {
  const sent = []
  const state = {failFor: null, tokens: 0}
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const send = (status, obj) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(obj)) }
    if (req.url === '/token') {
      const assertion = new URLSearchParams(raw).get('assertion') || ''
      const [h, c, s] = assertion.split('.')
      const claims = JSON.parse(Buffer.from(c || 'e30', 'base64url').toString())
      const good = h && createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s || '', 'base64url'))
      if (!good) return send(400, {error: 'invalid_grant', error_description: 'bad signature'})
      if (claims.iss !== serviceEmail || claims.sub !== mailbox || claims.scope !== 'https://www.googleapis.com/auth/gmail.send') return send(401, {error: 'unauthorized_client'})
      state.tokens++
      return send(200, {access_token: 'G-TOKEN', expires_in: 3600, token_type: 'Bearer'})
    }
    if (req.url === '/gmail/v1/users/me/messages/send') {
      if (req.headers.authorization !== 'Bearer G-TOKEN') return send(401, {error: {status: 'UNAUTHENTICATED'}})
      const mime = Buffer.from(JSON.parse(raw).raw, 'base64url').toString()
      const [head, ...rest] = mime.split('\r\n\r\n')
      const headers = Object.fromEntries(head.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 2)]))
      const parts = rest.join('\r\n\r\n').split(/--sbwpc-[a-z0-9]+(?:--)?\r\n/).filter((p) => p.includes('Content-Type'))
      const decode = (p) => Buffer.from(p.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString()
      const subject = headers.subject.startsWith('=?UTF-8?B?') ? Buffer.from(headers.subject.slice(10, -2), 'base64').toString() : headers.subject
      const mail = {from: headers.from, to: headers.to, subject, replyTo: headers['reply-to'] || null, text: decode(parts.find((p) => p.includes('text/plain'))), html: decode(parts.find((p) => p.includes('text/html')))}
      if (state.failFor && mail.to === state.failFor) return send(500, {error: {status: 'INTERNAL'}})
      sent.push(mail)
      return send(200, {id: 'm' + sent.length, labelIds: ['SENT']})
    }
    send(404, {})
  })
  return new Promise((resolve) => server.listen(port, () => resolve({server, sent, state})))
}
