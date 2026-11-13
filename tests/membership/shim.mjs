// Test-only stand-in for Supabase's REST layer, in front of the local Postgres copy.
// Runs each request as the role its key or token maps to, so the real access rules apply.
import http from 'node:http'
import pg from 'pg'

const pool = new pg.Pool({host: process.env.PGHOST || '/var/tmp/pgtest', port: Number(process.env.PGPORT || 54329), user: 'postgres', database: process.env.TEST_DB || 't', max: 4})
pg.types.setTypeParser(1082, (v) => v) // dates stay as text, like PostgREST
pg.types.setTypeParser(1114, (v) => v)
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString())
pg.types.setTypeParser(20, (v) => Number(v))
pg.types.setTypeParser(1700, (v) => Number(v))
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error('bad name ' + s), {code: 'PGRST100'}); return '"' + s + '"' }
const OPS = {eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>='}

function who(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers.apikey || ''
  if (bearer === 'test-secret') return {role: 'service_role', claims: {role: 'service_role'}}
  const parts = bearer.split('.')
  if (parts.length === 3) { try { const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); return {role: 'authenticated', claims} } catch { /* fall through */ } }
  return {role: 'anon', claims: {role: 'anon'}}
}
function where(params, args) {
  const out = []
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const dot = v.indexOf('.')
    const op = v.slice(0, dot)
    const val = v.slice(dot + 1)
    if (OPS[op]) { args.push(val); out.push(`${ident(k)} ${OPS[op]} $${args.length}`) }
    else if (op === 'is') out.push(`${ident(k)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`)
    else if (op === 'in') { args.push(val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''))); out.push(`${ident(k)}::text = any($${args.length})`) }
    else throw Object.assign(new Error('unsupported filter ' + v), {code: 'PGRST100'})
  }
  return out.length ? ' where ' + out.join(' and ') : ''
}
const cols = (sel) => (!sel || sel === '*' ? '*' : sel.split(',').map((c) => ident(c.trim())).join(','))

async function handle(req, body) {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname.replace(/^\/rest\/v1\//, '')
  const q = url.searchParams
  const args = []
  let sql
  if (path.startsWith('rpc/')) {
    const fn = ident(path.slice(4))
    const named = Object.entries(body || {})
    sql = `select public.${fn}(${named.map(([k, v], i) => { args.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v); return `${ident(k)} => $${i + 1}` }).join(', ')}) as result`
    return {sql, args, rpc: true}
  }
  const table = 'public.' + ident(path)
  const ret = /return=representation/.test(req.headers.prefer || '') ? ` returning ${cols(q.get('select'))}` : ''
  if (req.method === 'GET') {
    sql = `select ${cols(q.get('select'))} from ${table}${where(q, args)}`
    if (q.get('order')) sql += ' order by ' + q.get('order').split(',').map((o) => { const [c, dir, nulls] = o.split('.'); return ident(c) + (dir === 'desc' ? ' desc' : '') + (nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : '') }).join(',')
    if (q.get('limit')) sql += ' limit ' + Number(q.get('limit'))
    if (q.get('offset')) sql += ' offset ' + Number(q.get('offset'))
  } else if (req.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body]
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(ident).join(',')
    args.push(JSON.stringify(rows))
    sql = `insert into ${table} (${keys}) select ${keys} from json_populate_recordset(null::${table}, $1::json)`
    if (/resolution=merge-duplicates/.test(req.headers.prefer || '')) {
      const pk = q.get('on_conflict') || (path === 'settings' ? 'key' : 'id')
      sql += ` on conflict (${ident(pk)}) do update set ${[...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== pk).map((k) => `${ident(k)} = excluded.${ident(k)}`).join(',')}`
    }
    sql += ret
  } else if (req.method === 'PATCH') {
    const keys = Object.keys(body).map(ident).join(',')
    args.push(JSON.stringify(body))
    sql = `update ${table} set (${keys}) = (select ${keys} from json_populate_record(null::${table}, $1::json))${where(q, args)}${ret}`
  } else if (req.method === 'DELETE') {
    sql = `delete from ${table}${where(q, args)}${ret}`
  } else throw Object.assign(new Error('method'), {code: 'PGRST100'})
  return {sql, args}
}

export function startShim(port = 54330) {
  const CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*'}
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const send = (status, obj) => { res.writeHead(status, {...CORS, 'content-type': 'application/json'}); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
    const client = await pool.connect()
    try {
      const {role, claims} = who(req)
      const plan = await handle(req, raw ? JSON.parse(raw) : null)
      await client.query('begin')
      await client.query(`set local role ${role}`)
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
      const r = await client.query(plan.sql, plan.args)
      await client.query('commit')
      if (plan.rpc) return send(200, r.rows[0].result)
      if (req.method === 'GET' || /return=representation/.test(req.headers.prefer || '')) return send(req.method === 'POST' ? 201 : 200, r.rows)
      return send(req.method === 'POST' ? 201 : 204)
    } catch (e) {
      await client.query('rollback').catch(() => {})
      const status = e.code === '42501' ? (who(req).role === 'anon' ? 401 : 403) : e.code === '23505' ? 409 : 400
      send(status, {code: e.code || 'XX000', message: e.message, details: e.detail || null, hint: e.hint || null})
    } finally { client.release() }
  })
  return new Promise((resolve) => server.listen(port, () => resolve({server, pool, sql: (text, args) => pool.query(text, args).then((r) => r.rows)})))
}
