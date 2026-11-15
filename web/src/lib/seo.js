// Search and sharing helpers: title and description fitting, per-page fallbacks,
// canonical overrides and JSON-LD builders. Editors' own Studio values always win
// when they are already a good length; the fallbacks below only fill the gaps.
export const SITE = 'https://sbwpc.org'
export const ORG_NAME = "Santa Barbara Women's Political Committee"

export const HOME_TITLE = "Santa Barbara Women's Political Committee | Feminist PAC"
export const HOME_DESC =
  'SBWPC is a nonpartisan political action committee in Santa Barbara County. We endorse candidates, challenge discrimination and develop women leaders.'

// Used only when the Studio description is missing or shorter than MIN_DESC.
export const DESC_FALLBACK = {
  'advocacy/explainers': "Visual explainers on local policy issues from the Santa Barbara Women's Political Committee, including immigration enforcement, voting rights and oil.",
  'advocacy/explainers/sable-oil': "Sable Oil and the resistance: legal losses for Sable, a collective blockade, and a community guide, explained by the Santa Barbara Women's Political Committee.",
  'advocacy/explainers/voting-rights-act': 'The impact of the Supreme Court ruling on the Voting Rights Act and the stripping of Black voting power, explained by SBWPC for Santa Barbara County voters.',
  'advocacy/playbook': 'Four conversations connect lived experience, feminist analysis and public policy in Santa Barbara County. Explore the SBWPC Feminist Playbook.',
  cookies: 'The cookies used on sbwpc.org, why they are there, and how to accept or decline analytics cookies at any time.',
  'elections/endorsement-process': 'A summary of the SBWPC candidate endorsement process, plus the full SBWPC Protocol for Endorsement and how candidates are assessed.',
  'elections/endorsements': "SBWPC's endorsements and decisions for the November 3, 2026 General Election, listed by jurisdiction and race.",
  'elections/governors-race': "The June 2026 California governor's primary in data visualizations, debates, interviews and the latest polls, from the Santa Barbara Women's PAC.",
  'elections/past': "SBWPC's past endorsements and election decisions, preserved as a record of the organization's electoral work in Santa Barbara County.",
  events: "Upcoming Santa Barbara Women's Political Committee events, meetings and voter education programs, including Cosmopolitics and candidate workshops.",
  'events/gallery': "Explore photographs from Cosmopolitics 2026 and other Santa Barbara Women's Political Committee events across Santa Barbara County.",
  'events/run-like-a-woman': "Run Like a Woman 2026 was an SBWPC candidate workshop focused on message, media and campaign finance, hosted by the Santa Barbara Women's Political Committee.",
  'get-involved/run-for-office': 'Explore a run for public office, prepare for a campaign, and request SBWPC endorsement. Resources for candidates in Santa Barbara County.',
  join: "Join or renew SBWPC membership, compare annual membership levels, and learn about member benefits. Membership supports SBWPC endorsements and advocacy.",
  news: "Elections, advocacy, events and feminist leadership across Santa Barbara County. News and updates from the Santa Barbara Women's Political Committee.",
  privacy: 'How SBWPC collects, uses and protects information from donors, members, subscribers and site visitors, and the choices you have.',
  'take-action': 'Choose a civic goal, explore focused actions, and save a personal three-action plan with SBWPC. Voting, advocacy, events and leadership.',
  'take-action/boards-and-commissions': 'Find local public boards and commissions that match your interests and preferred jurisdiction, and learn how to apply to serve.',
  'take-action/letters-and-statements': 'Read current SBWPC advocacy letters and statements, search the public record, save letters, and build a practical advocacy toolkit.',
  terms: "The terms for using sbwpc.org, including contributions, endorsements and content, from the Santa Barbara Women's Political Committee.",
}

// Page titles that are too long or collide with another page. Only the <title>
// changes; the on-page headline stays as written in the Studio.
export const TITLE_OVERRIDE = {
  'news/era-roadmap': 'A Roadmap for the Equal Rights Amendment',
  'news/why-californias-primary-matters': "Why California's Primary Matters",
  'news/equal-rights-amendment': 'ERA Roadmap Announcement',
}

// /news/equal-rights-amendment repeats the roadmap article, so it points search
// engines at the original and is left out of the sitemap.
export const CANONICAL_OVERRIDE = {
  'news/equal-rights-amendment': 'news/era-roadmap',
}

const MIN_DESC = 110
const MAX_DESC = 160

export function fitTitle(title, path) {
  const raw = (TITLE_OVERRIDE[path] || title || '').replace(/\s*\|\s*SBWPC\s*$/i, '').trim()
  return raw
}

export function fitDescription(desc, path) {
  let d = (desc || '').replace(/\s+/g, ' ').trim()
  if (d.length < MIN_DESC && DESC_FALLBACK[path]) d = DESC_FALLBACK[path]
  if (d.length <= MAX_DESC) return d
  const head = d.slice(0, MAX_DESC)
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
  if (stop >= MIN_DESC) return head.slice(0, stop + 1)
  const cut = d.slice(0, MAX_DESC - 3)
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '...'
}

export const absolute = (p) => new URL(p.startsWith('/') ? p : '/' + p, SITE).href
export const withSlash = (p) => (p === '/' || p.endsWith('/') ? p : p + '/')
export const pageUrl = (path) => (path === 'home' || !path ? SITE + '/' : SITE + '/' + path.replace(/^\/|\/$/g, '') + '/')

// Shown as the byline on news posts and explainers, and as the About block in the footer.
export const BYLINE = 'SBWPC'
export const ABOUT_TEXT =
  "The Santa Barbara Women's Political Committee (SBWPC) is a feminist political action committee serving Santa Barbara County, California. Founded in 1987 by Gayle Binion, Lois Phillips and Susan Rose, it endorses candidates and ballot measures that support gender, race and LGBTQ+ equality, helps women prepare to run for office, and advocates on local and state policy. Its motto is Access, Voice, Power."

// ---------- JSON-LD ----------
export function orgLd(settings = {}) {
  const org = {
    '@type': 'Organization',
    '@id': SITE + '/#organization',
    name: ORG_NAME,
    alternateName: 'SBWPC',
    url: SITE + '/',
    logo: SITE + '/icon-512.png',
    description: HOME_DESC,
    areaServed: 'Santa Barbara County, California',
    foundingDate: '1987',
    founder: ['Gayle Binion', 'Lois Phillips', 'Susan Rose'].map((name) => ({'@type': 'Person', name})),
  }
  if (settings.email) org.email = settings.email
  const same = (settings.social || []).map((s) => s.url).filter((u) => /^https?:\/\//.test(u || ''))
  if (same.length) org.sameAs = same
  if (settings.mailingAddress) org.address = settings.mailingAddress
  const site = { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: ORG_NAME, publisher: {'@id': SITE + '/#organization'} }
  return {'@context': 'https://schema.org', '@graph': [org, site]}
}

export function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({'@type': 'ListItem', position: i + 1, name: it.name, item: it.url})),
  }
}

export function newsLd(post, url, imageUrl) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: (post.title || '').slice(0, 110),
    datePublished: post.date,
    dateModified: post._updatedAt || post.date,
    mainEntityOfPage: url,
    author: {'@type': 'Organization', name: ORG_NAME, url: SITE + '/'},
    publisher: {'@id': SITE + '/#organization'},
  }
  if (post.excerpt) ld.description = post.excerpt
  if (imageUrl) ld.image = [imageUrl]
  return ld
}

export function eventLd(e, url, imageUrl) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: e.title,
    startDate: e.start,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: {'@type': 'Organization', name: ORG_NAME, url: SITE + '/'},
  }
  if (e.end) ld.endDate = e.end
  if (e.summary) ld.description = e.summary
  if (url) ld.url = url
  if (imageUrl) ld.image = [imageUrl]
  if (e.location) {
    ld.location = {'@type': 'Place', name: e.location}
    if (e.address) ld.location.address = e.address
  }
  return ld
}

export function ptText(blocks) {
  return (blocks || [])
    .filter((b) => b._type === 'block')
    .map((b) => (b.children || []).map((c) => c.text || '').join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Only when every item is a question, so ordinary expandable lists are not marked up as an FAQ.
export function faqLd(items) {
  const qa = (items || []).filter((it) => it.title)
  if (qa.length < 2 || !qa.every((it) => /\?\s*$/.test(it.title))) return null
  const entities = qa
    .map((it) => ({'@type': 'Question', name: it.title, acceptedAnswer: {'@type': 'Answer', text: ptText(it.body)}}))
    .filter((q) => q.acceptedAnswer.text)
  if (entities.length < 2) return null
  return {'@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities}
}

export const ldScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c')
