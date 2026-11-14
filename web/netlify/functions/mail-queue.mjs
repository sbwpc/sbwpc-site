// Sends anything waiting in the email queue. Runs every five minutes. Payments also trigger it right away,
// so this is the safety net for emails queued from the admin (for example a check marked received).
import {dbReady} from '../lib/db.mjs'
import {log} from '../lib/http.mjs'
import {drain} from '../lib/outbox.mjs'

export default async () => {
  if (!dbReady()) return
  try { await drain({limit: 40}) } catch (err) { log('mail.queue_failed', {message: err.message}); throw err }
}

export const config = {schedule: '*/5 * * * *'}
