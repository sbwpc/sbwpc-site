// Daily renewal reminders: 30 days, 7 days and the day a membership expires, plus one notice 14 days after.
// Members on automatic renewal get a single heads-up before PayPal charges them instead.
import {dbReady} from '../lib/db.mjs'
import {log} from '../lib/http.mjs'
import {mailMode} from '../lib/mail.mjs'
import {drain, queueReminders} from '../lib/outbox.mjs'

export default async () => {
  // While email is off, do not queue reminders at all, so none pile up to be skipped
  if (!dbReady() || mailMode() === 'off') { log('reminders.skipped', {reason: 'email is off'}); return }
  try {
    const queued = await queueReminders()
    const sent = await drain({limit: 100})
    log('reminders.done', {...queued, ...sent})
  } catch (err) {
    log('reminders.failed', {message: err.message})
    throw err
  }
}

// 16:30 UTC is 8:30 AM Pacific in winter and 9:30 AM in summer
export const config = {schedule: '30 16 * * *'}
