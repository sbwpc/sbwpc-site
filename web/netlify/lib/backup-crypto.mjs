// Backups are compressed, then locked with AES-256-GCM. Without the key they are unreadable.
// File layout: 4 bytes "SBK1", 12 bytes nonce, 16 bytes auth tag, then the encrypted gzip data.
import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto'
import {gzipSync, gunzipSync} from 'node:zlib'

export function keyFrom(text) {
  const key = Buffer.from(String(text || '').trim(), 'base64')
  if (key.length !== 32) throw new Error('BACKUP_KEY must be 32 random bytes in base64 (run: openssl rand -base64 32)')
  return key
}
export function seal(obj, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(obj)))), cipher.final()])
  return Buffer.concat([Buffer.from('SBK1'), iv, cipher.getAuthTag(), body])
}
export function open(buf, key) {
  if (buf.subarray(0, 4).toString() !== 'SBK1') throw new Error('not an SBWPC backup file')
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(4, 16))
  decipher.setAuthTag(buf.subarray(16, 32))
  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(buf.subarray(32)), decipher.final()])).toString())
}
