// Tells the form which PayPal account to load (sandbox or live) and whether payments are switched on.
// The client id is public by design. No secrets leave the server.
import {env, json} from '../lib/http.mjs'
import {dbReady} from '../lib/db.mjs'
import {paypalEnv, paypalReady} from '../lib/paypal.mjs'

export default async () =>
  json({ok: true, env: paypalEnv(), clientId: paypalReady() && dbReady() ? env('PAYPAL_CLIENT_ID') : '', online: paypalReady() && dbReady(), check: dbReady()})

export const config = {path: '/api/checkout/config', method: 'GET'}
