import {defineType, defineField, defineArrayMember} from 'sanity'
import {sectionTypes} from './objects.js'

const sections = defineField({
  name: 'sections',
  type: 'array',
  of: sectionTypes.map((type) => defineArrayMember({type})),
  options: {insertMenu: {views: [{name: 'list'}]}},
})

const slug = (source = 'title') =>
  defineField({name: 'slug', type: 'slug', options: {source, maxLength: 96}, validation: (r) => r.required()})

const order = defineField({name: 'order', type: 'number', description: 'Lower numbers appear first'})

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  groups: [
    {name: 'general', title: 'General', default: true},
    {name: 'nav', title: 'Menu'},
    {name: 'footer', title: 'Footer'},
    {name: 'banner', title: 'Top banner'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', group: 'general'}),
    defineField({name: 'tagline', type: 'string', group: 'general', description: 'Access | Voice | Power'}),
    defineField({name: 'description', type: 'text', rows: 3, group: 'general', description: 'Default description for search engines'}),
    defineField({name: 'logo', type: 'image', group: 'general'}),
    defineField({name: 'shareImage', type: 'image', group: 'general', description: 'Default image when the site is shared on social media'}),
    defineField({name: 'email', type: 'string', group: 'general'}),
    defineField({name: 'mailingAddress', type: 'string', group: 'general'}),
    defineField({name: 'joinUrl', title: 'Join or renew link', type: 'string', group: 'general', description: 'Where the Join buttons go. Use /join for the membership page or a full https:// address.'}),
    defineField({name: 'donateUrl', title: 'Donate link', type: 'string', group: 'general', description: 'Where the Donate buttons go. Use /donate for the Donate page or a full https:// address.'}),
    defineField({name: 'newsletterUrl', title: 'Newsletter signup link', type: 'string', group: 'general', description: 'Where mailing list buttons go. Use /contact#newsletter for the on-page sign-up.'}),
    defineField({name: 'analyticsId', title: 'Google Analytics ID', type: 'string', group: 'general', description: 'The GA4 measurement ID, like G-XXXXXXXXXX. Analytics loads only for visitors who accept cookies.', validation: (r) => r.regex(/^G-[A-Z0-9]+$/, {name: 'GA4 ID'})}),
    defineField({
      name: 'social',
      type: 'array',
      group: 'general',
      of: [{type: 'object', name: 'socialLink', fields: [{name: 'label', type: 'string'}, {name: 'url', type: 'url'}], preview: {select: {title: 'label', subtitle: 'url'}}}],
    }),
    defineField({
      name: 'nav',
      title: 'Main menu',
      type: 'array',
      group: 'nav',
      of: [
        {
          type: 'object',
          name: 'navItem',
          fields: [
            {name: 'label', type: 'string'},
            {name: 'url', type: 'string', description: 'Leave empty if this item only opens a submenu'},
            {name: 'children', title: 'Submenu', type: 'array', of: [{type: 'link'}]},
          ],
          preview: {select: {title: 'label', subtitle: 'url'}},
        },
      ],
    }),
    defineField({
      name: 'footerColumns',
      type: 'array',
      group: 'footer',
      of: [
        {
          type: 'object',
          name: 'footerColumn',
          fields: [
            {name: 'title', type: 'string'},
            {name: 'links', type: 'array', of: [{type: 'link'}]},
          ],
          preview: {select: {title: 'title'}},
        },
      ],
    }),
    defineField({
      name: 'banner',
      title: 'Top banner',
      type: 'object',
      group: 'banner',
      fields: [
        {name: 'enabled', type: 'boolean', initialValue: false},
        {name: 'label', type: 'string', description: 'Short tag, like EVENT RECAP'},
        {name: 'items', title: 'Scrolling phrases', type: 'array', of: [{type: 'string'}]},
        {name: 'link', type: 'link'},
      ],
    }),
  ],
  preview: {prepare: () => ({title: 'Site settings'})},
})

export const page = defineType({
  name: 'page',
  type: 'document',
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'seo', title: 'Search and sharing'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', group: 'content', validation: (r) => r.required()}),
    defineField({
      name: 'path',
      title: 'Page address',
      type: 'string',
      group: 'content',
      description: 'Where the page lives, without the domain. Use "home" for the homepage. Example: about/history',
      validation: (r) =>
        r.required().custom((v) => (!v || /^(home|[a-z0-9-]+(\/[a-z0-9-]+)*)$/.test(v) ? true : 'Lowercase letters, numbers, dashes and slashes only')),
    }),
    defineField({name: 'hero', type: 'hero', group: 'content'}),
    {...sections, group: 'content'},
    defineField({name: 'seo', type: 'seo', group: 'seo'}),
  ],
  preview: {select: {title: 'title', subtitle: 'path'}},
})

export const post = defineType({
  name: 'post',
  title: 'News post',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    slug(),
    defineField({name: 'date', type: 'date', validation: (r) => r.required()}),
    defineField({name: 'category', type: 'string', options: {list: ['News', 'Elections', 'Advocacy', 'Events', 'Newsletter']}}),
    defineField({name: 'excerpt', type: 'text', rows: 3}),
    defineField({name: 'image', type: 'imageWithAlt'}),
    defineField({name: 'externalUrl', title: 'Link elsewhere instead', type: 'url', description: 'For newsletters or outside articles. Leave empty to use the body below.'}),
    defineField({name: 'body', type: 'richText'}),
    defineField({name: 'seo', type: 'seo'}),
  ],
  orderings: [{title: 'Newest', name: 'dateDesc', by: [{field: 'date', direction: 'desc'}]}],
  preview: {select: {title: 'title', subtitle: 'date', media: 'image'}},
})

export const event = defineType({
  name: 'event',
  type: 'document',
  groups: [
    {name: 'details', title: 'Details', default: true},
    {name: 'page', title: 'Event page'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', group: 'details', validation: (r) => r.required()}),
    {...slug(), group: 'details'},
    defineField({name: 'start', title: 'Starts', type: 'datetime', group: 'details', validation: (r) => r.required()}),
    defineField({name: 'end', title: 'Ends', type: 'datetime', group: 'details'}),
    defineField({name: 'timeText', title: 'Time as shown', type: 'string', group: 'details', description: 'Optional, like 5:30 to 7:30 PM'}),
    defineField({name: 'location', type: 'string', group: 'details'}),
    defineField({name: 'address', type: 'string', group: 'details'}),
    defineField({name: 'kind', type: 'string', group: 'details', options: {list: ['Signature event', 'Endorsement meeting', 'Voter education', 'Workshop', 'Member event', 'Community']}}),
    defineField({name: 'status', type: 'string', group: 'details', options: {list: ['open', 'sold out', 'cancelled']}, initialValue: 'open'}),
    defineField({name: 'summary', type: 'text', rows: 3, group: 'details'}),
    defineField({name: 'image', type: 'imageWithAlt', group: 'details'}),
    defineField({name: 'links', title: 'Buttons', type: 'array', of: [{type: 'link'}], group: 'details'}),
    defineField({name: 'hasPage', title: 'Give this event its own page', type: 'boolean', initialValue: false, group: 'page'}),
    defineField({name: 'hero', type: 'hero', group: 'page', hidden: ({document}) => !document?.hasPage}),
    {...sections, group: 'page', hidden: ({document}) => !document?.hasPage},
  ],
  orderings: [{title: 'Date', name: 'startAsc', by: [{field: 'start', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'start', media: 'image'}},
})

export const person = defineType({
  name: 'person',
  title: 'Board member',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'role', type: 'string', description: 'President, Treasurer, Board Member...'}),
    defineField({name: 'group', type: 'string', options: {list: ['Leadership Team', 'Board Member'], layout: 'radio'}, initialValue: 'Board Member'}),
    defineField({name: 'image', type: 'imageWithAlt'}),
    defineField({name: 'shortBio', title: 'One-line description', type: 'string'}),
    defineField({name: 'bio', type: 'richText'}),
    defineField({name: 'email', type: 'string'}),
    order,
  ],
  orderings: [{title: 'Order', name: 'order', by: [{field: 'order', direction: 'asc'}]}],
  preview: {select: {title: 'name', subtitle: 'role', media: 'image'}},
})

export const committee = defineType({
  name: 'committee',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'kind', type: 'string', options: {list: ['Standing', 'Ad Hoc', 'Governance'], layout: 'radio'}, initialValue: 'Standing'}),
    defineField({name: 'summary', type: 'string'}),
    defineField({name: 'leaders', type: 'string', description: 'Co-Chairs Elsa Granados and Liz Owen'}),
    defineField({name: 'meeting', type: 'string', description: 'Last Wednesday of the month at 6:00 PM'}),
    defineField({name: 'email', type: 'string'}),
    defineField({name: 'links', type: 'array', of: [{type: 'link'}]}),
    order,
  ],
  preview: {select: {title: 'name', subtitle: 'leaders'}},
})

export const position = defineType({
  name: 'position',
  title: 'Adopted position',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    slug(),
    defineField({name: 'area', title: 'Issue area', type: 'string', options: {list: ['Rights & Equality', 'Families & Economic Security', 'Health, Autonomy & Safety', 'Environment & Peace']}}),
    defineField({name: 'tags', type: 'array', of: [{type: 'string'}], options: {layout: 'tags'}}),
    defineField({name: 'summary', type: 'text', rows: 5}),
    defineField({name: 'fullText', title: 'Full position paper', type: 'richText'}),
    order,
  ],
  preview: {select: {title: 'title', subtitle: 'area'}},
})

export const endorsement = defineType({
  name: 'endorsement',
  type: 'document',
  fields: [
    defineField({name: 'election', type: 'string', description: 'Like 2026 General or 2026 Primary', validation: (r) => r.required()}),
    defineField({name: 'jurisdiction', type: 'string', description: 'Like City of Santa Barbara, Goleta, State of California'}),
    defineField({name: 'office', type: 'string', description: 'Like City Council District 5'}),
    defineField({name: 'decision', type: 'string', options: {list: ['Endorsed', 'No Endorsement', 'Pending'], layout: 'radio'}, initialValue: 'Endorsed'}),
    defineField({name: 'candidate', type: 'string', description: 'Leave empty for No Endorsement'}),
    defineField({name: 'party', type: 'string'}),
    defineField({name: 'image', type: 'imageWithAlt'}),
    defineField({name: 'website', type: 'url'}),
    defineField({name: 'decisionDate', type: 'date'}),
    defineField({name: 'note', type: 'text', rows: 2}),
    order,
  ],
  preview: {
    select: {c: 'candidate', o: 'office', j: 'jurisdiction', d: 'decision', e: 'election', media: 'image'},
    prepare: ({c, o, j, d, e, media}) => ({title: c || d, subtitle: [e, j, o].filter(Boolean).join(' · '), media}),
  },
})

export const action = defineType({
  name: 'action',
  title: 'Civic action',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'goal', type: 'string', options: {list: ['Vote', 'Speak Up', 'Participate', 'Lead', 'Support'], layout: 'radio'}}),
    defineField({name: 'summary', type: 'text', rows: 2}),
    defineField({name: 'link', type: 'link'}),
    defineField({name: 'featured', type: 'boolean', description: 'Show as the best next step for this goal'}),
    order,
  ],
  preview: {select: {title: 'title', subtitle: 'goal'}},
})

export const opportunity = defineType({
  name: 'opportunity',
  title: 'Board or commission',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'jurisdiction', type: 'string', options: {list: ['City of Santa Barbara', 'Santa Barbara County', 'City of Carpinteria', 'City of Goleta']}}),
    defineField({name: 'issues', type: 'array', of: [{type: 'string'}], options: {layout: 'tags'}}),
    defineField({name: 'summary', type: 'text', rows: 3}),
    defineField({name: 'url', title: 'Official page', type: 'url'}),
    order,
  ],
  preview: {select: {title: 'title', subtitle: 'jurisdiction'}},
})

export const album = defineType({
  name: 'album',
  title: 'Photo album',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    slug(),
    defineField({name: 'date', type: 'date'}),
    defineField({name: 'eyebrow', type: 'string'}),
    defineField({name: 'summary', type: 'text', rows: 3}),
    defineField({name: 'photographers', type: 'string'}),
    defineField({name: 'images', type: 'array', of: [{type: 'imageWithAlt'}], options: {layout: 'grid'}}),
    order,
  ],
  preview: {select: {title: 'title', subtitle: 'date', media: 'images.0'}},
})

export default [siteSettings, page, post, event, person, committee, position, endorsement, action, opportunity, album]
