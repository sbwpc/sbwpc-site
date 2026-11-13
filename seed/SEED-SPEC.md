# SBWPC seed content spec

Goal: convert the scraped sbwpc.org pages into Sanity documents (NDJSON, one JSON object per line) that match the schema in `studio/schemas/objects.js` and `studio/schemas/documents.js`. Read both schema files before writing anything. The seed is imported with `sanity dataset import`, and the Astro site renders it directly too.

## Sources
- Clean text per old page: `/home/claude/content/markdown/<old-path-with-__>.md` (Firecrawl). This is the main source.
- Raw HTML per old page: `/home/claude/work/html/<old-path-with-__>.html` (6 MB each, mostly inline base64 images). Use only when the markdown is missing something (link targets, embed URLs such as YouTube/Canva/Jotform iframes, dates). Search it with grep or Python; never print it whole.
- Images: `/home/claude/sbwpc-site/seed/image-manifest.json` maps each old page key to images with `asset` (already-local file reference), `alt`, and `after` (text that follows the image, to tell you what it shows). Use the `asset` string exactly.

## Writing rules
- Keep the organization's wording. Do not invent facts, names, dates, numbers or quotes. You may lightly fix obvious typos and the mojibake characters ("Â·" means "·", "â" sequences mean dashes or apostrophes).
- Drop scraper noise: "Compact SBWPC Footer Preview", "×", "Close", "Showing all 16 leaders", "No leaders match that search", duplicated ticker text, and the shared site footer.
- Plain ASCII punctuation is preferred in text you write yourself; keep the original characters when copying content.
- Internal links must use the NEW paths (see the sitemap below), not old sbwpc.org URLs. External links, mailto: links and Jotform/PayPal links stay as they are.

## NDJSON format
- One document per line. Every document needs `_id` and `_type`.
- `_id` is deterministic and lowercase: `page-<path with / replaced by ->` (home is `page-home`), `post-<slug>`, `event-<slug>`, `person-<name-slug>`, `committee-<slug>`, `position-<slug>`, `endorsement-<election-slug>-<candidate-or-office-slug>`, `action-<slug>`, `opportunity-<slug>`, `album-<slug>`.
- Every object inside an array needs a unique `_key` (short random-looking string, e.g. `k3f9a1`). Objects inside arrays also need `_type` (e.g. `"_type":"card"`, `"_type":"link"`, `"_type":"stat"`, section types like `"_type":"sectionCards"`, inline object names like `timelineItem`, `nameGroup`, `nameItem`, `accordionItem`, `resourceLink`, `navItem`, `footerColumn`, `socialLink`). Arrays of plain strings need no keys.
- Slugs: `{"_type":"slug","current":"cosmopolitics-2026"}`.
- Dates: `date` fields are `YYYY-MM-DD`; `datetime` fields are ISO with Pacific offset, e.g. `2026-09-19T12:00:00-07:00`.
- Images (`imageWithAlt` or `image`): `{"_type":"imageWithAlt","_sanity_asset":"image@file://./images/abc.jpg","alt":"...","caption":"..."}`. For plain `image` fields use `"_type":"image"`. Inside an array add `_key`.
- Rich text (`richText`) is Portable Text:
  `{"_type":"block","_key":"b1","style":"normal","markDefs":[],"children":[{"_type":"span","_key":"s1","text":"Hello ","marks":[]},{"_type":"span","_key":"s2","text":"bold","marks":["strong"]}]}`
  Links: add `{"_key":"l1","_type":"link","href":"/about"}` to `markDefs` and put `"l1"` in the span's `marks`. Bullets: add `"listItem":"bullet","level":1` to the block. Styles allowed: normal, h3, h4, blockquote.

## How to map a scraped page
The scraped pages share a pattern: a short eyebrow line, then a heading, then body lines, then cards made of an optional number/kicker line and a `###` heading with a sentence under it, then buttons as `[Label](url)` lines.
- The `#` heading and what sits above and below it becomes `hero` (eyebrow, heading, subheading, body, badges, buttons, stats, image).
- Each `##` heading starts a new section. The line right above it is the section `eyebrow`; the first paragraph after it is `intro`; link lines become `buttons`.
- Pick the section type by content: groups of `###` items become `sectionCards` (use `variant:"numbered"` when they carry 01/02/03; `"filled"` for 2 to 3 bold highlight cards); label and value pairs become `sectionStats`; long prose becomes `sectionText`; dated milestones or step sequences become `sectionTimeline`; lists of names (sponsors, presidents, speakers, volunteers) become `sectionNameList`; position papers, FAQs and long expandable content become `sectionAccordion`; outbound resource lists become `sectionLinks`; video/slide/form iframes become `sectionEmbed`; photo sets become `sectionGallery`; a closing heading with buttons becomes `sectionCta`.
- Lists of things that have their own document type (board members, committees, positions, endorsements, civic actions, boards and commissions, events, news posts, albums) become documents of that type, and the page shows them with a `sectionCollection` that names the collection.
- Alternate section `tone` values so the page has rhythm (for example white, cream, white, mist, navy for a closing CTA). The site's palette: navy hero cards, cream and mist bands, white content areas.
- Keep every substantive paragraph. Do not summarize long text; move it into `sectionText` or `sectionAccordion` bodies instead.

## New sitemap (page `path` values) and where content comes from
| New path | Source pages (old) |
|---|---|
| home | index (homepage) |
| about | about/mission |
| about/history | about/history |
| about/board | about/leadership (people become `person` docs) |
| about/committees | about/committees (committees become `committee` docs) |
| about/positions | about/positions (15 positions become `position` docs; the long position papers go in each position's `fullText`) |
| about/seat-at-the-table | about/a-seat-at-the-table--a-fund-for-a-feminist-future |
| contact | about/contact-2-2 |
| elections | elections/election-center |
| elections/endorsements | elections/endorsed-candidates (become `endorsement` docs, election "2026 General") |
| elections/past | elections/past-elections-2 and santa-barbara-county-races-2 (endorsement docs for "2026 Primary"; avoid duplicates) |
| elections/candidate-corner | elections/candidate-resources-2 |
| elections/endorsement-process | candidate-corner/notice-of-endorsement and candidate-corner/endorsement-protocol |
| elections/request-endorsement | elections/request-an-endorsement |
| elections/campaign-finance | elections/campaign-finance |
| elections/governors-race | ca-governor-s-race/governor-s-race, ca-governor-s-race/governor-debates-and-interviews, ca-governor-s-race/latest-polls |
| elections/candidate-forums | santa-barbara-county---local-races/37th-state-assembly, santa-barbara-county---local-races/santa-barbara-county-board-of-supervisors-2nd-district-candidate-forum---lwvsb |
| take-action | take-action-2/civic-action-center and take-action-2/civic-action-center-2 (actions become `action` docs) |
| take-action/boards-and-commissions | take-action-2/boards-and-commissions, get-involved/serve-on-a-board-or-commission, take-action-2/issues-hub (all three carry the same content; commissions become `opportunity` docs) |
| take-action/letters-and-statements | take-action-2/letters-and-statements |
| advocacy | advocacy/priorities |
| advocacy/playbook | advocacy/play |
| advocacy/legislator-interviews | advocacy/legislator-interviews |
| advocacy/era | advocacy/equal-rights-amendment-2 and policies---data-visualization/equal-rights-amendment |
| advocacy/election-protection | advocacy/election-protection |
| advocacy/explainers | index page listing the explainers below |
| advocacy/explainers/ice-santa-barbara-county | policies---data-visualization/california-governor-s-race (its real topic is ICE in Santa Barbara County) |
| advocacy/explainers/ice-ventura-county | policies---data-visualization/ice-in-ventura-county |
| advocacy/explainers/sable-oil | policies---data-visualization/sable-oil |
| advocacy/explainers/vc-defensa | policies---data-visualization/vc-defensa-raids |
| advocacy/explainers/voting-rights-act | policies---data-visualization/voting-rights-act-ruling |
| advocacy/explainers/camino-dolores-huerta | policies---data-visualization/renaming-calle-cesar-chavez-to-camino-dolores-huerta |
| events | events/attend-an-event-2 and events/calendar (events become `event` docs) |
| events/<slug> | event docs with `hasPage:true`: cosmopolitics-2026 (from events/cosmopolitics), run-like-a-woman (from events/run-like-a-woman) |
| events/gallery | events/gallery (albums become `album` docs) |
| news | news/latest-news and blog (posts become `post` docs) |
| news/<slug> | blog/* posts |
| join | join/membership-benefits and get-involved/membership-benefits-2 |
| donate | get-involved/donate |
| get-involved/run-for-office | get-involved/run-for-office |

Dropped (redirected): policies---data-visualization/coming-soon, policies---data-visualization/impact-of-ice-raids-on-children (empty), and the seven 404 pages.

Shared external links seen on the site: Join or Renew `https://form.jotform.com/261400972517051`, Donate `https://pci.jotform.com/form/261401443369151`, email `info@sbwpc.org`, Instagram `https://www.instagram.com/sbwpc/`, Facebook `https://www.facebook.com/sbwpc/`, Substack `https://sbwpc.substack.com/`.

## Output
Write your documents to `/home/claude/sbwpc-site/seed/parts/<your-batch-name>.ndjson`. Then validate it with `python3 /home/claude/sbwpc-site/seed/check.py <your file>` and fix every error it reports. Reply with a short list of the documents you wrote and anything you could not map.
