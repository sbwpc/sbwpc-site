// Test-only local copy of the site: built pages, the real server functions, the simulated PayPal and the local database.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {startShim} from './shim.mjs'
import {startPayPalMock} from './paypal-mock.mjs'

const WEB = fileURLToPath(new URL('../../web', import.meta.url))
export const ADMIN_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src https://rbvhmrsepsategvrmqcv.supabase.co wss://rbvhmrsepsategvrmqcv.supabase.co; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.xml': 'text/xml', '.txt': 'text/plain'}

export async function startSite({port = 4321, env = {}} = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: 'http://localhost:54330', SUPABASE_SECRET_KEY: 'test-secret', PAYPAL_CLIENT_ID: 'test-client', PAYPAL_SECRET: 'test-paypal-secret',
    PAYPAL_ENV: 'sandbox', PAYPAL_API_BASE: 'http://localhost:54331', PAYPAL_WEBHOOK_ID: 'WH-TEST', URL: `http://localhost:${port}`, ...env,
  })
  const shim = await startShim()
  const paypal = await startPayPalMock()
  const fns = {}
  for (const f of ['checkout-config', 'checkout-create', 'checkout-capture', 'paypal-webhook']) {
    const mod = await import(`${WEB}/netlify/functions/${f}.mjs`)
    fns[mod.config.path] = mod
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const fn = fns[url.pathname]
    if (fn) {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const allowed = [].concat(fn.config.method || [])
      if (allowed.length && !allowed.includes(req.method)) { res.writeHead(405); return res.end() }
      const out = await fn.default(new Request(url, {method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)}))
      res.writeHead(out.status, Object.fromEntries(out.headers))
      return res.end(await out.text())
    }
    let file = path.join(WEB, 'dist', decodeURIComponent(url.pathname))
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!file.startsWith(path.join(WEB, 'dist')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found') }
    const headers = {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'}
    if (url.pathname.startsWith('/admin')) headers['content-security-policy'] = ADMIN_CSP
    res.writeHead(200, headers)
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(port, r))
  const close = async () => { server.close(); shim.server.close(); paypal.server.close(); await shim.pool.end() }
  return {port, shim, paypal, sql: shim.sql, close, origin: `http://localhost:${port}`}
}
