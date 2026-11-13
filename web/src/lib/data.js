// Content loader. Reads from Sanity when SANITY_PROJECT_ID is set,
// otherwise from the local seed file (seed/data.ndjson) so the site can
// be built and previewed before the Sanity project exists.
import fs from 'node:fs'
import path from 'node:path'
import {createClient} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'

const projectId = process.env.SANITY_PROJECT_ID || import.meta.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_DATASET || import.meta.env.SANITY_DATASET || 'production'
export const useSanity = Boolean(projectId)

const client = useSanity
  ? createClient({projectId, dataset, apiVersion: '2026-09-01', useCdn: false, perspective: 'published'})
  : null
const builder = client ? imageUrlBuilder(client) : null

let cache
export async function loadAll() {
  if (cache) return cache
  let docs
  if (useSanity) {
    docs = await client.fetch(`*[!(_id in path("drafts.**")) && !(_type match "system.*") && !(_type match "sanity.*")]`)
  } else {
    const file = path.resolve(process.cwd(), '../seed/data.ndjson')
    docs = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }
  const by = (t) => docs.filter((d) => d._type === t)
  const sortOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999)
  cache = {
    settings: docs.find((d) => d._type === 'siteSettings') || {},
    pages: by('page'),
    posts: by('post').sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    events: by('event').sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    people: by('person').sort(sortOrder),
    committees: by('committee').sort(sortOrder),
    positions: by('position').sort(sortOrder),
    endorsements: by('endorsement').sort(sortOrder),
    actions: by('action').sort(sortOrder),
    opportunities: by('opportunity').sort(sortOrder),
    albums: by('album').sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  }
  return cache
}

export const now = () => new Date()

export function upcomingEvents(events) {
  const t = now().getTime()
  return events.filter((e) => new Date(e.end || e.start).getTime() >= t - 6 * 3600e3)
}
export function pastEvents(events) {
  const t = now().getTime()
  return events.filter((e) => new Date(e.end || e.start).getTime() < t - 6 * 3600e3).reverse()
}

// ---------- Images ----------
// Seed images live in seed/images and are copied to public/media (with
// resized webp variants) by scripts/prepare-media.mjs.
const WIDTHS = [480, 960, 1600, 2400]
let mediaIndex
function localIndex() {
  if (!mediaIndex) {
    try {
      mediaIndex = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/media/index.json'), 'utf8'))
    } catch {
      mediaIndex = {}
    }
  }
  return mediaIndex
}

export function img(image, {width = 1600, aspect} = {}) {
  if (!image) return null
  const alt = image.alt || ''
  const ref = image._sanity_asset
  if (ref && ref.startsWith('image@file://./images/')) {
    const name = ref.replace('image@file://./images/', '')
    const meta = localIndex()[name]
    if (!meta) return {src: `/media/${name}`, alt}
    const widths = meta.widths.filter((w) => w <= Math.max(width * 2, 480))
    const best = widths[widths.length - 1] || meta.widths[0]
    return {
      src: `/media/${meta.base}-${best}.webp`,
      srcset: meta.widths.map((w) => `/media/${meta.base}-${w}.webp ${w}w`).join(', '),
      width: meta.width,
      height: meta.height,
      alt,
      caption: image.caption,
    }
  }
  if (ref && ref.startsWith('image@http')) return {src: ref.slice(6), alt, caption: image.caption}
  if (image.asset && builder) {
    const b = (w) => {
      let x = builder.image(image).width(w).auto('format').quality(80)
      if (aspect) x = x.height(Math.round(w / aspect)).fit('crop')
      return x.url()
    }
    const [, dims] = (image.asset._ref || '').match(/-(\d+x\d+)-/) || []
    const [w0, h0] = dims ? dims.split('x').map(Number) : []
    return {
      src: b(width),
      srcset: WIDTHS.filter((w) => !w0 || w <= w0).map((w) => `${b(w)} ${w}w`).join(', '),
      width: w0,
      height: aspect && w0 ? Math.round(w0 / aspect) : h0,
      alt,
      caption: image.caption,
    }
  }
  return null
}

// ---------- Links ----------
export function href(url) {
  if (!url) return '#'
  return url
}
export function isExternal(url) {
  return /^https?:\/\//.test(url || '') && !/^https?:\/\/(www\.)?sbwpc\.org/.test(url)
}

// ---------- Dates ----------
const TZ = 'America/Los_Angeles'
export function fmtDate(d, opts = {}) {
  if (!d) return ''
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00-07:00') : new Date(d)
  return date.toLocaleDateString('en-US', {timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric', ...opts})
}
export function fmtTime(d) {
  if (!d) return ''
  const date = new Date(d)
  const s = date.toLocaleTimeString('en-US', {timeZone: TZ, hour: 'numeric', minute: '2-digit'})
  return s === '12:00 AM' ? '' : s
}
export function eventParts(e) {
  const start = new Date(e.start)
  return {
    month: start.toLocaleDateString('en-US', {timeZone: TZ, month: 'short'}),
    day: start.toLocaleDateString('en-US', {timeZone: TZ, day: 'numeric'}),
    weekday: start.toLocaleDateString('en-US', {timeZone: TZ, weekday: 'long'}),
    date: fmtDate(e.start),
    time: e.timeText || [fmtTime(e.start), fmtTime(e.end)].filter(Boolean).join(' to '),
  }
}

export function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
