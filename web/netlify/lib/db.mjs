// Server-side database access. Uses the Supabase secret key, which only exists in Netlify's environment.
import {createClient} from '@supabase/supabase-js'
import {env} from './http.mjs'

let client
export function db() {
  if (client) return client
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SECRET_KEY')
  if (!url || !key) throw new Error('database is not configured')
  client = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}})
  return client
}
export const dbReady = () => Boolean(env('SUPABASE_URL') && env('SUPABASE_SECRET_KEY'))

// Throw on any database error so a failed write can never look like a success
export async function must(query) {
  const {data, error} = await query
  if (error) throw new Error('database: ' + (error.message || error.code || 'unknown error'))
  return data
}
export const getCheckout = async (id) => (await must(db().from('checkouts').select('*').eq('id', id).limit(1)))[0] || null
export const recordPayment = (p) => must(db().rpc('record_payment', {p}))
