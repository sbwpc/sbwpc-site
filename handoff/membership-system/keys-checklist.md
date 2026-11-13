# Keys checklist: turn on payments for testing

About 15 minutes. You paste four keys and one ID into Netlify. Nobody else sees them, and none of them go in the code.

This turns on PayPal test money only. No real payments can happen until we switch to live later.

## Where every key goes

Open the Netlify settings page: https://app.netlify.com/projects/sbwpc-org/configuration/env

For each key below:
1. Click **Add a variable**, then **Add a single variable**.
2. Type the Key name exactly as written here.
3. Paste the value.
4. Tick **Contains secret values**.
5. Click **Create variable**.

Already done for you: `SUPABASE_URL` and `PAYPAL_ENV` (set to sandbox).

## Step 1. Database key

1. Open https://supabase.com/dashboard/project/rbvhmrsepsategvrmqcv/settings/api-keys
2. Under **Secret keys**, copy the key that starts with `sb_secret_`.
3. Add it in Netlify as `SUPABASE_SECRET_KEY`.

## Step 2. Backup key

1. Open Terminal on your Mac and run: `openssl rand -base64 32`
2. Copy the line it prints.
3. Add it in Netlify as `BACKUP_KEY`.
4. Save the same line in your password manager as "SBWPC backup key". Without it, the nightly backups cannot be opened.

## Step 3. PayPal test app

1. Open https://developer.paypal.com/dashboard/ and log in with the SBWPC PayPal login.
2. Set the **Sandbox / Live** switch at the top to **Sandbox**.
3. Open **Apps & Credentials** and click **Create App**.
4. Name it `SBWPC website`. Type: **Merchant**. Click **Create App**.
5. Copy the **Client ID**. Add it in Netlify as `PAYPAL_CLIENT_ID`.
6. Under **Secret key 1**, click **Show** and copy it. Add it in Netlify as `PAYPAL_SECRET`.

## Step 4. PayPal webhook

This is how PayPal tells the site about yearly renewals, monthly gifts, cancellations and refunds.

1. On the same app page, scroll to **Sandbox Webhooks** and click **Add Webhook**.
2. Webhook URL: `https://sbwpc.org/api/paypal/webhook`
3. Tick **All Events** and click **Save**.
4. Copy the **Webhook ID** it shows. Add it in Netlify as `PAYPAL_WEBHOOK_ID`.

## Step 5. Test buyer

1. In the PayPal developer dashboard, open **Testing Tools**, then **Sandbox Accounts**.
2. Find the **Personal** account. Open its menu and choose **View/Edit account**.
3. Note its email and password. This is the pretend customer you will pay with on the test pages.

## Step 6. Tell Claude

Say: "keys are in, deploy". The new settings only take effect after a deploy.

Then we test together on https://sbwpc.org/join-preview/ and https://sbwpc.org/donate-preview/:
- a one-time membership
- an auto-renew membership
- a one-time and a monthly donation
- a mailed check, confirmed in the admin
- a cancelled payment

Test payments are saved with the note "SANDBOX TEST" and removed before the forms go on the live Join and Donate pages.

## Later: Apple Pay

Apple Pay needs three more things, after PayPal works:
- Apple Pay ticked under **Features** on the PayPal app.
- sbwpc.org registered for Apple Pay in the PayPal sandbox business account, and PayPal's domain file added to the site.
- An Apple sandbox tester account, which needs an Apple Developer account.
