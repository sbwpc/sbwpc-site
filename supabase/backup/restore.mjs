// Open an SBWPC backup file on your own computer.
//   1. Download a backup: Netlify > sbwpc-org > Data & Storage > Blobs > member-backups
//   2. BACKUP_KEY='the key from your password manager' node supabase/backup/restore.mjs backup-2026-11-13.sbk
// Writes a readable .json file next to the backup. Keep it off shared drives and delete it when done.
import {readFileSync, writeFileSync} from 'node:fs'
import {keyFrom, open} from '../../web/netlify/lib/backup-crypto.mjs'

const file = process.argv[2]
if (!file || !process.env.BACKUP_KEY) {
  console.error('Usage: BACKUP_KEY=... node supabase/backup/restore.mjs <backup file>')
  process.exit(1)
}
const data = open(readFileSync(file), keyFrom(process.env.BACKUP_KEY))
const out = file.replace(/\.sbk$/, '') + '.json'
writeFileSync(out, JSON.stringify(data, null, 2))
console.log(`Backup from ${data.taken_at}`)
for (const [table, rows] of Object.entries(data.tables)) console.log(`  ${table}: ${rows.length} rows`)
console.log(`Written to ${out}`)
