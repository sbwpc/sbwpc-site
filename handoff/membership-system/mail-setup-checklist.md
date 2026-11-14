# Email setup checklist: let the site send as info@sbwpc.org

About 30 minutes. You create one Google credential and paste it into Netlify. Nobody else sees it, and it never goes in the code.

Do this with the Google account that is the super admin of your Workspace.

## One thing to know before you start

You chose the Google Cloud service account. It can only send mail. It cannot read any mailbox.
But Google's "domain-wide delegation" covers every user in your Workspace, not just info@sbwpc.org. The site only ever sends as info@sbwpc.org, but if the key were ever stolen, it could be used to send mail as any address in your Workspace, including your own.

The other option, a Gmail app password, is limited to the info@sbwpc.org mailbox but can read that mailbox as well as send.

If you would rather switch, tell Claude before you start. It is a small code change.

## Part A. Google Cloud

1. Open https://console.cloud.google.com/projectcreate and create a project named `SBWPC website mail`.
2. With that project selected, open https://console.cloud.google.com/apis/library/gmail.googleapis.com and click **Enable**.
3. Open https://console.cloud.google.com/iam-admin/serviceaccounts and click **Create service account**.
   - Name: `sbwpc-mailer`
   - Skip the optional steps and click **Done**. It needs no roles.
4. Click the new service account, open the **Keys** tab, then **Add key**, **Create new key**, **JSON**, **Create**. A file downloads.
5. On the **Details** tab, copy the **Unique ID**. It is a long number. You need it in Part B.

If step 4 says "Service account key creation is disabled": open **IAM & Admin**, **Organization Policies**, find **Disable service account key creation**, click **Manage policy**, and set it to not enforced for this project. If you cannot change it, tell Claude and we will use the app password instead.

## Part B. Google Admin

1. Open https://admin.google.com/ac/owl/domainwidedelegation
2. Click **Add new**.
3. Client ID: paste the Unique ID from Part A.
4. OAuth scopes: `https://www.googleapis.com/auth/gmail.send`
5. Click **Authorize**.

## Part C. Netlify

Open https://app.netlify.com/projects/sbwpc-org/configuration/env and add these four. Tick **Contains secret values** for the key.

| Key | Value |
| --- | --- |
| `GMAIL_SA_EMAIL` | The service account's email. It ends in `.iam.gserviceaccount.com` and is shown on its Details tab. |
| `GMAIL_SA_KEY` | The private key from the downloaded file. Use the Terminal command below to copy it. |
| `MAIL_MODE` | `test` |
| `MAIL_TEST_TO` | Your own email address. In test mode every member email comes to you instead of the real person. |

To copy the private key, open Terminal and run this, replacing the file name with the one you downloaded:

    python3 -c "import json,sys; print(json.dumps(json.load(open(sys.argv[1]))['private_key'])[1:-1])" ~/Downloads/sbwpc-website-mail-XXXX.json | pbcopy

Then paste into the Netlify value box. It is one long line.

When the four are saved, delete the downloaded file and empty the Trash. Netlify now holds the only copy.

## Part D. Tell Claude

Say: "mail keys are in, deploy".

After the deploy, one more step moves the admin sign-in emails (invitations and password resets) to info@sbwpc.org:

1. Open https://supabase.com/dashboard/project/rbvhmrsepsategvrmqcv/auth/hooks
2. Click **Add hook** and choose **Send Email hook**.
3. Type: **HTTPS**. URL: `https://sbwpc.org/api/auth/email`
4. Click **Generate secret** and copy it.
5. Add it in Netlify as `SUPABASE_AUTH_HOOK_SECRET`, ticked as secret.
6. Back in Supabase, click **Create hook**.
7. Say "hook is in, deploy". Until that deploy finishes, a few minutes, admin invitations and password resets will not send.

## Going live with member emails

While `MAIL_MODE` is `test`, no member or donor ever receives an email. Everything comes to your test address with the real recipient shown in the subject.

When the client has approved the wording, change `MAIL_MODE` to `live` in Netlify and say "deploy".
