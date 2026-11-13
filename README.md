# SBWPC website

Rebuild of sbwpc.org: an Astro site on Netlify with a Sanity CMS. It keeps the current design (navy, cream, gold, Georgia and Inter) and rebuilds it with tighter type, motion and accessibility.

- Preview: https://sbwpc.netlify.app
- Netlify project: https://app.netlify.com/projects/sbwpc

## Folders

| Folder | What it is |
|---|---|
| `web/` | The Astro website. `npm install`, then `npm run dev`. |
| `studio/` | The Sanity Studio where editors update content. |
| `seed/` | All content migrated from the old site (163 documents, 219 images). `data.ndjson` and `images/` are imported into Sanity once. |
| `netlify.toml` | Netlify build settings. The base is `web/`. |

## How content flows

- The site reads from Sanity when the `SANITY_PROJECT_ID` environment variable is set.
- Until then it reads from `seed/data.ndjson`, which is how the preview is built.
- Editors publish in the Studio. A Sanity webhook then calls a Netlify build hook, and the site rebuilds in about a minute.

## Going live checklist

1. **Create the Sanity project.** Use an org-owned login (for example info@sbwpc.org) at https://www.sanity.io/manage. Use the free plan and a dataset named `production`. Copy the project ID.
2. **Import the content.** Run these in `studio/`:
   ```
   npm install
   npx sanity login
   SANITY_STUDIO_PROJECT_ID=<id> npx sanity dataset import ../seed production --replace
   ```
   The importer reads `seed/data.ndjson` and uploads the files in `seed/images/`.
3. **Deploy the Studio.** Run `SANITY_STUDIO_PROJECT_ID=<id> npx sanity deploy`. Editors then sign in at https://sbwpc.sanity.studio. Invite them under Members in sanity.io/manage.
4. **Connect the code to Netlify.** Push this folder to a GitHub repo owned by the org, then link the repo to the Netlify `sbwpc` project. Base directory is `web`, build command is `npm run build`, publish directory is `dist`.
5. **Add environment variables in Netlify.** Set `SANITY_PROJECT_ID=<id>` and `SANITY_DATASET=production`.
6. **Set up automatic rebuilds.** In Netlify, add a build hook under Site configuration, Build and deploy, Build hooks. In Sanity, add a webhook (API, Webhooks) that posts to that hook on create, update and delete.
7. **Add the CORS origin.** In Sanity, under API, CORS origins, add `https://sbwpc.org`.
8. **Switch DNS.** In Cloudflare, point `sbwpc.org` and `www` to Netlify with a CNAME to `sbwpc.netlify.app` (proxy off), then add the domain in Netlify. Leave the MX and email routing records alone.

## What editors can change

| Studio item | What it controls |
|---|---|
| Site settings | Menu, footer, Join and Donate links, the top announcement banner. |
| Pages | Every page is a header plus a stack of sections (text, cards, highlights, image and text, timeline, name lists, expandable lists, resource links, galleries, embeds, calls to action, automatic lists). Sections can be reordered by dragging. |
| News | Posts, newest first. |
| Events | Dates, places and buttons. Upcoming and past lists update by date. Events can have their own recap page. |
| Endorsements | One entry per race. They group by jurisdiction on the endorsements page and filter by election name. |
| Board of Directors, Committees, Adopted positions | Directory content that appears automatically. |
| Civic actions, Boards and commissions | Data behind the two interactive tools on Take Action. |
| Photo albums | The galleries page. |

## Brand (SBWPC Web Kit 2026)

The site follows the Web Kit in `SBWPC Web Kit 2026` (README, brand-tokens.css, Web Quick Reference).

- **Type:** Outfit, served from the site's own `web/public/fonts/` folder (the variable woff2 files plus the OFL license), declared in `web/src/styles/fonts.css`. Nothing loads from Google Fonts. Headline 1 is 48/56 (36/44 on phones), Headline 2 is 36/44 (28/36), Headline 3 is 24/32 (20/28), eyebrows are 14px bold caps, body is 18/28 (16/26) and quotes are Light 28/38.
- **Color:** headlines Navy, body Charcoal, links and buttons Purple, red text and red buttons Accessible Red. Logo Red, Blue and Pink appear only as accents. The tokens live at the top of `web/src/styles/global.css`, and the reskin rules are in `web/src/styles/brand.css`.
- **Logos:** the SVGs are in `web/public/brand/`. The header uses the color lockup with tagline at 240px, or the primary lockup at 180px on small phones. The footer uses Reverse 1 on navy.
- **Icons and sharing:** `favicon.svg`, `favicon.ico`, the app icons, `site.webmanifest` and `sbwpc-social-share-1200x630.jpg` sit in `web/public/`.
- **Photos:** the kit photos are in `seed/images/sbwpc-photo-*.webp`. They are used on the Home, Advocacy, Take Action and Run for Office headers. The gradient mesh sits behind call-to-action bands and candidate initials.
- **Section backgrounds:** in the Studio these are White, Grey, Navy and Purple. The stored values `cream` (Grey) and `blue` (Purple) are kept from the first build.
- **Home page:** the About (Mission and Vision) content is the home page, and `/about` redirects to `/`.

## Notes from the migration

- **Retired addresses:** every old Durable address redirects to its new page through `web/public/_redirects`.
- **Removed pages:** seven old footer links that showed 404s now point to real pages. The empty "Impact of ICE Raids on Children" page and "Coming Soon" were dropped.
- **Letters PDFs:** two ERA letter PDFs and the UN80 letter lived on the old WordPress uploads (`sbwpc.org/wp-content/...`). They need re-hosting before those links can return.
- **Missing form:** the old September 23 member comment and statement forms submitted to a Google Apps Script. They were not rebuilt because the meeting has passed.
