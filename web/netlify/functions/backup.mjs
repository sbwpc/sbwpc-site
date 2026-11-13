// Nightly backup. Copies every table, encrypts the copy, and keeps the last 30 nights in Netlify Blobs,
// a different company from the one that hosts the database. Also clears online checkouts that were never paid.
import {getStore} from '@netlify/blobs'
import {env, log} from '../lib/http.mjs'
import {db, dbReady, must} from '../lib/db.mjs'
import {keyFrom, seal} from '../lib/backup-crypto.mjs'

const TABLES = ['people', 'memberships', 'payments', 'recurring_plans', 'reminders', 'checkouts', 'settings', 'admins', 'audit_log']
const KEEP_DAYS = 30

async function all(table) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = await must(db().from(table).select('*').range(from, from + 999))
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

export async function runBackup(store) {
  const key = keyFrom(env('BACKUP_KEY'))
  const data = {version: 1, taken_at: new Date().toISOString(), tables: {}}
  for (const t of TABLES) data.tables[t] = await all(t)
  const counts = Object.fromEntries(TABLES.map((t) => [t, data.tables[t].length]))
  const name = `backup-${data.taken_at.slice(0, 10)}.sbk`
  const sealed = seal(data, key)
  await store.set(name, sealed.buffer.slice(sealed.byteOffset, sealed.byteOffset + sealed.byteLength), {metadata: {taken_at: data.taken_at, counts}})

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10)
  const {blobs} = await store.list({prefix: 'backup-'})
  let removed = 0
  for (const b of blobs) {
    const day = b.key.slice(7, 17)
    if (day < cutoff) { await store.delete(b.key); removed++ }
  }
  // Online checkouts nobody finished hold a name and address we have no reason to keep
  const stale = new Date(Date.now() - 30 * 86400000).toISOString()
  const purged = await must(db().from('checkouts').delete().neq('mode', 'check').eq('status', 'pending').lt('created_at', stale).select('id'))
  return {name, bytes: sealed.length, counts, removed, purged: purged.length}
}

export default async () => {
  if (!dbReady() || !env('BACKUP_KEY')) { log('backup.skipped', {reason: 'not configured'}); return }
  try {
    log('backup.done', await runBackup(getStore({name: 'member-backups', consistency: 'strong'})))
  } catch (err) {
    log('backup.failed', {message: err.message})
    throw err
  }
}

// 10:15 UTC is 2:15 AM Pacific in winter and 3:15 AM in summer
export const config = {schedule: '15 10 * * *'}
