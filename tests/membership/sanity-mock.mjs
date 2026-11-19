// Test-only simulated Sanity API: who a session token belongs to, and whether they belong to the SBWPC project.
import http from 'node:http'

// token -> {email, member}
export const TOKENS = {
  'MEMBER-luke-0000000000000000': {email: 'luke@coolhandlook.com', member: true},
  'MEMBER-treasurer-00000000000': {email: 'treasurer@example.com', member: true},
  'MEMBER-notadmin-0000000000000': {email: 'editor@example.com', member: true},
  'OUTSIDER-luke-000000000000000': {email: 'luke@coolhandlook.com', member: false},
}

export function startSanityMock({port = 54333} = {}) {
  const calls = []
  const server = http.createServer((req, res) => {
    const send = (status, obj) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(obj)) }
    const t = TOKENS[(req.headers.authorization || '').replace(/^Bearer /, '')]
    calls.push(req.url)
    if (!t) return send(401, {error: 'Unauthorized'})
    if (req.url === '/v2021-06-07/users/me') return send(200, {id: 'u' + t.email, name: t.email, email: t.email})
    if (req.url === '/v2021-06-07/projects/coo0nu6y') return t.member ? send(200, {id: 'coo0nu6y'}) : send(403, {error: 'Forbidden'})
    send(404, {})
  })
  return new Promise((resolve) => server.listen(port, () => resolve({server, calls})))
}
