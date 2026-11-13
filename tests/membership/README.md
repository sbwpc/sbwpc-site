# Membership and payment tests

These run the real code against stand-ins, so nothing touches the live database, PayPal or real member data.

| Real code under test | Stand-in |
| --- | --- |
| Database migrations and access rules (`supabase/migrations`) | A local Postgres built by `resetdb.sh` |
| Server functions (`web/netlify/functions`) | Run in-process by `site.mjs` |
| Admin screens and public forms (`web/dist`) | Served by `site.mjs`, driven by Playwright |
| Supabase REST layer | `shim.mjs`, which runs each request as the role its token maps to |
| Supabase sign-in and two-factor | Simulated in `browser.mjs` |
| PayPal REST API | `paypal-mock.mjs` |
| PayPal and Apple Pay browser buttons | `fake-paypal-sdk.js` |

All people in the tests are made up (`seed.mjs`).

## Run

Needs a local Postgres 16 (socket in `PGHOST`, port in `PGPORT`) and `npm install` here.

    cd web && npm run build && cd ../tests/membership
    npm test

- `flow.test.mjs`: payment server end to end
- `admin.ui.mjs`: admin screens in a browser, desktop and phone
- `forms.ui.mjs`: membership and donation forms in a browser, desktop and phone, with accessibility scans
- `supabase/tests/access_rules.sql` and `record_payment.sql`: database rules, run with psql

Screenshots land in `shots/` (or `SHOTS_DIR`).

What these tests cannot show: that the real PayPal sandbox accepts our calls, and that Apple Pay works on a real iPhone. Both are tested by hand in the sandbox before going live.
