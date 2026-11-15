// A plain-language layer on top of the schemas in objects.js and documents.js.
// It changes only what editors SEE: titles, help text, grouping, icons, previews and
// friendly checks. It never renames a field, so stored content and the website queries
// are not affected. Call friendly(types) once, in sanity.config.js.
import {BellIcon} from '@sanity/icons/Bell'
import {BlockquoteIcon} from '@sanity/icons/Blockquote'
import {ClockIcon} from '@sanity/icons/Clock'
import {CreditCardIcon} from '@sanity/icons/CreditCard'
import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {ImagesIcon} from '@sanity/icons/Images'
import {LinkIcon} from '@sanity/icons/Link'
import {PlayIcon} from '@sanity/icons/Play'
import {SplitHorizontalIcon} from '@sanity/icons/SplitHorizontal'
import {StarIcon} from '@sanity/icons/Star'
import {SyncIcon} from '@sanity/icons/Sync'
import {ThLargeIcon} from '@sanity/icons/ThLarge'
import {ThListIcon} from '@sanity/icons/ThList'
import {UsersIcon} from '@sanity/icons/Users'

const done = new WeakSet()

// ---------- Page section blocks: icon and one-line description ----------
const SECTIONS = {
  sectionText: [DocumentTextIcon, 'Headings and paragraphs, with an optional side note.'],
  sectionCards: [ThLargeIcon, 'A row of boxes, each with a title, text and an optional photo.'],
  sectionStats: [StarIcon, 'Big numbers or short facts in a row.'],
  sectionSplit: [SplitHorizontalIcon, 'A photo beside some text.'],
  sectionQuote: [BlockquoteIcon, 'One large quote with the speaker name.'],
  sectionTimeline: [ClockIcon, 'Dates or steps in order.'],
  sectionNameList: [UsersIcon, 'Groups of names, each with a short detail.'],
  sectionAccordion: [ThListIcon, 'Questions or topics that open when clicked.'],
  sectionLinks: [LinkIcon, 'A set of links to other pages and documents.'],
  sectionCollection: [SyncIcon, 'A list that fills itself from items kept elsewhere in the Studio, like events or endorsements.'],
  sectionGallery: [ImagesIcon, 'A group of photos.'],
  sectionEmbed: [PlayIcon, 'A video, form or slide show from another site.'],
  sectionCta: [BellIcon, 'A colored band with a heading and buttons.'],
  sectionGive: [CreditCardIcon, 'Donation or membership amounts, with the form.'],
  sectionNewsletter: [EnvelopeIcon, 'The mailing list sign-up.'],
}

const INSERT_MENU = {
  filter: true,
  showIcons: true,
  views: [{name: 'grid'}, {name: 'list'}],
  groups: [
    {name: 'text', title: 'Text and pictures', of: ['sectionText', 'sectionSplit', 'sectionQuote', 'sectionGallery', 'sectionEmbed']},
    {name: 'lists', title: 'Lists and cards', of: ['sectionCards', 'sectionStats', 'sectionTimeline', 'sectionNameList', 'sectionAccordion', 'sectionLinks', 'sectionCollection']},
    {name: 'actions', title: 'Buttons and forms', of: ['sectionCta', 'sectionGive', 'sectionNewsletter']},
  ],
}

// ---------- Field wording. Keys are field names; "owner.field" wins over "field". ----------
const BY_NAME = {
  eyebrow: {title: 'Small label above', description: 'A few words in capitals, like EVENT RECAP. Optional.'},
  kicker: {title: 'Small label above', description: 'Optional.'},
  heading: {title: 'Heading'},
  subheading: {title: 'Line under the heading'},
  intro: {title: 'Short intro', description: 'One or two sentences under the heading. Optional.'},
  buttons: {title: 'Buttons', description: 'Optional. Each button needs a label and a link.'},
  tone: {title: 'Background color'},
  anchor: {
    title: 'Link target',
    description: 'Optional. One short word, no spaces. Lets another page link straight to this section, like #endorsements.',
    fieldset: 'advanced',
  },
  columns: {title: 'Cards per row'},
  imageSide: {title: 'Photo position'},
  slug: {title: 'Web address ending', description: 'Click Generate and it fills itself in from the title. Do not change it after the item is published.'},
  order: {title: 'Order on the page', description: 'Lower numbers appear first. Leave this alone unless you are moving this item.'},
  alt: {title: 'Photo description', description: 'One short sentence about what the photo shows, for people who cannot see it. Example: Board members at the 2026 candidate forum.'},
  formUrl: {fieldset: 'advanced'},
  formId: {fieldset: 'advanced'},
  accountKey: {fieldset: 'advanced'},
}
const BY_OWNER = {
  'siteSettings.analyticsId': {fieldset: 'advanced'},
  'siteSettings.shareImage': {fieldset: 'advanced'},
  'hero.badges': {fieldset: 'advanced'},
  'sectionGive.prefill': {fieldset: 'advanced'},
}

// ---------- Friendly checks. All are warnings, so no old document is ever blocked. ----------
const linkWarning = (Rule) =>
  Rule.custom((v) =>
    !v || /^(\/|#|https?:\/\/|mailto:|tel:)/.test(String(v).trim())
      ? true
      : 'Start with / for a page on this site, https:// for another website, or mailto: for an email address.',
  ).warning()
const maxWarning = (n, msg) => (Rule) => Rule.max(n).warning(msg)

const CHECKS = {
  'link.url': linkWarning,
  'navItem.url': linkWarning,
  'resourceLink.url': linkWarning,
  'link.href': linkWarning,
  'siteSettings.joinUrl': linkWarning,
  'siteSettings.donateUrl': linkWarning,
  'siteSettings.newsletterUrl': linkWarning,
  alt: (Rule) =>
    Rule.custom((v) => (v ? true : 'Add a short photo description. It helps people using screen readers and helps search engines.')).warning(),
  'post.title': maxWarning(90, 'Shorter titles read better. Try to stay under 90 characters.'),
  'event.title': maxWarning(90, 'Shorter titles read better. Try to stay under 90 characters.'),
  'post.excerpt': maxWarning(240, 'Keep the summary short, about two sentences.'),
  'event.summary': maxWarning(300, 'Keep the summary short, about two or three sentences.'),
  'seo.title': maxWarning(70, 'Search engines show about 70 characters.'),
  'seo.description': maxWarning(160, 'Search engines show about 160 characters.'),
  'event.end': (Rule) =>
    Rule.custom((end, ctx) => (end && ctx.document?.start && end < ctx.document.start ? 'The end time is before the start time.' : true)).warning(),
  'endorsement.candidate': (Rule) =>
    Rule.custom((v, ctx) => (ctx.document?.decision === 'Endorsed' && !v ? 'Add the candidate name, or choose No Endorsement above.' : true)).warning(),
  'endorsement.office': (Rule) => Rule.custom((v) => (v ? true : 'Add the office or ballot measure.')).warning(),
}

// ---------- Special cases ----------
const NEW_PAGE_MINUTES = 15
const SPECIAL = {
  'sectionCards.variant': (f) => {
    f.title = 'Card style'
    f.options = {
      ...f.options,
      list: [
        {title: 'Outlined', value: 'bordered'},
        {title: 'Numbered', value: 'numbered'},
        {title: 'Filled', value: 'filled'},
        {title: 'Photo cards', value: 'people'},
      ],
    }
  },
  'sectionSplit.imageSide': (f) => {
    f.options = {...f.options, layout: 'radio', direction: 'horizontal', list: [{title: 'Left', value: 'left'}, {title: 'Right', value: 'right'}]}
  },
  'event.status': (f) => {
    f.options = {...f.options, layout: 'radio', direction: 'horizontal', list: [{title: 'Open', value: 'open'}, {title: 'Sold out', value: 'sold out'}, {title: 'Cancelled', value: 'cancelled'}]}
  },
  'page.path': (f) => {
    f.description = 'Where the page lives, without the domain. Use "home" for the homepage. Example: about/history. This locks a few minutes after the page is created, so links to it never break.'
    f.readOnly = ({document}) => {
      const made = document?._createdAt ? new Date(document._createdAt).getTime() : Date.now()
      return Date.now() - made > NEW_PAGE_MINUTES * 60 * 1000
    }
  },
  sections: (f) => {
    f.options = {...f.options, insertMenu: INSERT_MENU}
  },
}

// ---------- List rows: show a readable date and status ----------
const fmt = (d) => {
  if (!d) return ''
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}
const PREVIEWS = {
  post: {
    select: {title: 'title', date: 'date', cat: 'category', media: 'image', link: 'externalUrl'},
    prepare: ({title, date, cat, media, link}) => ({
      title,
      subtitle: [fmt(date), cat, link ? 'Links elsewhere' : ''].filter(Boolean).join(' | '),
      media,
    }),
  },
  event: {
    select: {title: 'title', start: 'start', status: 'status', media: 'image', place: 'location'},
    prepare: ({title, start, status, media, place}) => ({
      title: status && status !== 'open' ? `${title} (${status})` : title,
      subtitle: [fmt(start), place].filter(Boolean).join(' | '),
      media,
    }),
  },
  album: {
    select: {title: 'title', date: 'date', media: 'images.0', photos: 'images'},
    prepare: ({title, date, media, photos}) => ({
      title,
      subtitle: [fmt(date), Array.isArray(photos) ? `${photos.length} photos` : ''].filter(Boolean).join(' | '),
      media,
    }),
  },
}

// ---------- Engine ----------
function addCheck(field, check) {
  const prev = field.validation
  field.validation = (Rule) => {
    const base = typeof prev === 'function' ? prev(Rule) : prev
    return [].concat(base || [], check(Rule))
  }
}

function walkFields(fields, owner, top) {
  if (!Array.isArray(fields)) return false
  let usedAdvanced = false
  for (const f of fields) {
    if (!f || !f.name) continue
    const key = `${owner}.${f.name}`
    const words = BY_OWNER[key] || BY_NAME[f.name]
    if (words) {
      const {fieldset, ...rest} = words
      Object.assign(f, rest)
      if (fieldset && top) {
        f.fieldset = fieldset
        usedAdvanced = true
      }
    }
    const special = SPECIAL[key] || SPECIAL[f.name]
    if (special) special(f)
    const check = CHECKS[key] || CHECKS[f.name]
    if (check) addCheck(f, check)
    if (Array.isArray(f.fields)) walkFields(f.fields, f.name, null)
    if (Array.isArray(f.of)) {
      for (const m of f.of) {
        if (!m) continue
        if (Array.isArray(m.fields)) walkFields(m.fields, m.name || owner, null)
        for (const a of m.marks?.annotations || []) walkFields(a.fields, a.name, null)
      }
    }
  }
  return usedAdvanced
}

export function friendly(types) {
  for (const def of types) {
    if (done.has(def)) continue
    done.add(def)

    for (const g of def.groups || []) {
      if (g.name === 'heading') g.title = 'Title area'
      if (g.name === 'style') g.title = 'Look'
    }

    const usedAdvanced = walkFields(def.fields, def.name, def)
    if (usedAdvanced) {
      def.fieldsets = [
        ...(def.fieldsets || []),
        {name: 'advanced', title: 'Advanced (most people never need these)', options: {collapsible: true, collapsed: true}},
      ]
    }

    // Fields of the image type itself (alt, caption) and rich text link annotations
    if (def.name === 'richText') {
      for (const m of def.of || []) for (const a of m.marks?.annotations || []) walkFields(a.fields, a.name, null)
    }

    const section = SECTIONS[def.name]
    if (section) {
      const [icon, description] = section
      def.icon = icon
      def.description = description
      def.preview = {
        select: {heading: 'heading', quote: 'quote', eyebrow: 'eyebrow', intro: 'intro', image: 'image', first: 'images.0'},
        prepare: ({heading, quote, eyebrow, intro, image, first}) => ({
          title: heading || quote || def.title,
          subtitle: [def.title, eyebrow || intro].filter(Boolean).join(': '),
          media: image || first || icon,
        }),
      }
    }

    if (PREVIEWS[def.name]) def.preview = PREVIEWS[def.name]
  }
  return types
}
