import {defineType, defineField, defineArrayMember} from 'sanity'

// Shared building blocks used by pages, events and settings.

export const link = defineType({
  name: 'link',
  title: 'Button or link',
  type: 'object',
  fields: [
    defineField({name: 'label', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'url',
      title: 'Link',
      type: 'string',
      description: 'A page on this site (/about/history), a full web address (https://...) or an email (mailto:info@sbwpc.org)',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'style',
      type: 'string',
      options: {list: ['primary', 'secondary', 'accent'], layout: 'radio', direction: 'horizontal'},
      initialValue: 'primary',
    }),
  ],
  preview: {select: {title: 'label', subtitle: 'url'}},
})

export const imageWithAlt = defineType({
  name: 'imageWithAlt',
  title: 'Image',
  type: 'image',
  options: {hotspot: true},
  fields: [
    defineField({name: 'alt', title: 'Description for screen readers', type: 'string'}),
    defineField({name: 'caption', type: 'string'}),
  ],
})

export const richText = defineType({
  name: 'richText',
  title: 'Text',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Paragraph', value: 'normal'},
        {title: 'Heading', value: 'h3'},
        {title: 'Small heading', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      marks: {
        decorators: [
          {title: 'Bold', value: 'strong'},
          {title: 'Italic', value: 'em'},
        ],
        annotations: [
          defineArrayMember({
            name: 'link',
            type: 'object',
            title: 'Link',
            fields: [defineField({name: 'href', type: 'string', title: 'Link'})],
          }),
        ],
      },
    }),
    defineArrayMember({type: 'imageWithAlt'}),
  ],
})

export const stat = defineType({
  name: 'stat',
  type: 'object',
  fields: [
    defineField({name: 'label', type: 'string', description: 'Small label above, like THE ROOM'}),
    defineField({name: 'value', type: 'string', description: 'The big text, like 100+ Guests'}),
    defineField({name: 'note', type: 'text', rows: 2}),
  ],
  preview: {select: {title: 'value', subtitle: 'label'}},
})

export const card = defineType({
  name: 'card',
  type: 'object',
  fields: [
    defineField({name: 'kicker', type: 'string', description: 'Small label above the title'}),
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'body', type: 'text', rows: 4}),
    defineField({name: 'details', type: 'array', of: [{type: 'stat'}], description: 'Optional label and value pairs, like Leadership / Meeting'}),
    defineField({name: 'image', type: 'imageWithAlt'}),
    defineField({name: 'links', type: 'array', of: [{type: 'link'}]}),
  ],
  preview: {select: {title: 'title', subtitle: 'kicker', media: 'image'}},
})

export const hero = defineType({
  name: 'hero',
  title: 'Page header',
  type: 'object',
  fields: [
    defineField({name: 'eyebrow', type: 'string', description: 'Small label above the headline'}),
    defineField({name: 'heading', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'subheading', type: 'string', description: 'Gold line under the headline'}),
    defineField({name: 'body', type: 'text', rows: 3}),
    defineField({name: 'badges', type: 'array', of: [{type: 'string'}]}),
    defineField({name: 'buttons', type: 'array', of: [{type: 'link'}]}),
    defineField({name: 'stats', type: 'array', of: [{type: 'stat'}]}),
    defineField({name: 'image', type: 'imageWithAlt'}),
    defineField({
      name: 'imageLabel',
      title: 'Image label',
      type: 'object',
      description: 'Optional name card over the photo',
      fields: [
        {name: 'kicker', type: 'string'},
        {name: 'title', type: 'string'},
        {name: 'subtitle', type: 'string'},
      ],
    }),
    defineField({
      name: 'tone',
      title: 'Background',
      type: 'string',
      description: 'Used when the header has no photo, or with a split photo',
      options: {list: [{title: 'Grey', value: 'cream'}, {title: 'White', value: 'white'}, {title: 'Navy', value: 'navy'}], layout: 'radio', direction: 'horizontal'},
      initialValue: 'cream',
    }),
    defineField({
      name: 'layout',
      type: 'string',
      description: 'Split puts the photo beside the text. Full photo puts the headline over a full-width photo.',
      options: {list: [{title: 'Split', value: 'split'}, {title: 'Full photo', value: 'full'}], layout: 'radio', direction: 'horizontal'},
      initialValue: 'split',
    }),
    defineField({
      name: 'imageFit',
      title: 'Image fit',
      type: 'string',
      description: 'Use "Whole image" for logos, posters and infographics so nothing is cropped',
      options: {list: [{title: 'Fill the space', value: 'cover'}, {title: 'Whole image', value: 'contain'}], layout: 'radio', direction: 'horizontal'},
      initialValue: 'cover',
    }),
  ],
})

// ---------- Page sections ----------

// Section backgrounds from the brand guide: White, Grey, Navy, plus Purple
const tones = [
  {title: 'White', value: 'white'},
  {title: 'Grey', value: 'cream'},
  {title: 'Navy', value: 'navy'},
  {title: 'Purple', value: 'blue'},
]

const common = [
  defineField({name: 'eyebrow', type: 'string', group: 'heading'}),
  defineField({name: 'heading', type: 'string', group: 'heading'}),
  defineField({name: 'intro', type: 'text', rows: 3, group: 'heading'}),
  defineField({name: 'buttons', type: 'array', of: [{type: 'link'}], group: 'heading'}),
  defineField({
    name: 'tone',
    title: 'Background',
    type: 'string',
    options: {list: tones, layout: 'radio', direction: 'horizontal'},
    initialValue: 'white',
    group: 'style',
  }),
  defineField({name: 'anchor', title: 'Anchor id', type: 'string', description: 'Optional, for links like #endorsements', group: 'style'}),
]
const groups = [
  {name: 'content', title: 'Content', default: true},
  {name: 'heading', title: 'Heading'},
  {name: 'style', title: 'Style'},
]
const preview = (label) => ({
  select: {title: 'heading', subtitle: 'eyebrow'},
  prepare: ({title, subtitle}) => ({title: title || label, subtitle: `${label}${subtitle ? ' · ' + subtitle : ''}`}),
})

const section = (name, title, fields) =>
  defineType({name, title, type: 'object', groups, fields: [...common, ...fields.map((f) => ({group: 'content', ...f}))], preview: preview(title)})

export const sectionText = section('sectionText', 'Text', [
  defineField({name: 'body', type: 'richText'}),
  defineField({name: 'aside', title: 'Side note', type: 'richText'}),
])

export const sectionCards = section('sectionCards', 'Cards', [
  defineField({name: 'cards', type: 'array', of: [{type: 'card'}]}),
  defineField({name: 'columns', type: 'number', options: {list: [2, 3, 4]}, initialValue: 3}),
  defineField({
    name: 'variant',
    type: 'string',
    options: {list: ['bordered', 'numbered', 'filled', 'people'], layout: 'radio'},
    initialValue: 'bordered',
  }),
])

export const sectionStats = section('sectionStats', 'Highlights', [
  defineField({name: 'stats', type: 'array', of: [{type: 'stat'}]}),
  defineField({name: 'body', type: 'richText'}),
])

export const sectionSplit = section('sectionSplit', 'Image and text', [
  defineField({name: 'image', type: 'imageWithAlt'}),
  defineField({name: 'body', type: 'richText'}),
  defineField({name: 'imageSide', type: 'string', options: {list: ['left', 'right']}, initialValue: 'right'}),
])

export const sectionQuote = section('sectionQuote', 'Quote', [
  defineField({name: 'quote', type: 'text', rows: 3}),
  defineField({name: 'attribution', type: 'string'}),
  defineField({name: 'link', type: 'link'}),
])

export const sectionTimeline = section('sectionTimeline', 'Timeline or steps', [
  defineField({
    name: 'items',
    type: 'array',
    of: [
      {
        type: 'object',
        name: 'timelineItem',
        fields: [
          {name: 'label', type: 'string', description: 'Year, date or step number'},
          {name: 'title', type: 'string'},
          {name: 'body', type: 'text', rows: 3},
        ],
        preview: {select: {title: 'title', subtitle: 'label'}},
      },
    ],
  }),
])

export const sectionNameList = section('sectionNameList', 'Name lists', [
  defineField({
    name: 'groups',
    type: 'array',
    of: [
      {
        type: 'object',
        name: 'nameGroup',
        fields: [
          {name: 'kicker', type: 'string'},
          {name: 'title', type: 'string'},
          {name: 'body', type: 'text', rows: 2},
          {
            name: 'items',
            type: 'array',
            of: [
              {
                type: 'object',
                name: 'nameItem',
                fields: [
                  {name: 'name', type: 'string'},
                  {name: 'detail', type: 'string'},
                ],
                preview: {select: {title: 'name', subtitle: 'detail'}},
              },
            ],
          },
        ],
        preview: {select: {title: 'title', subtitle: 'kicker'}},
      },
    ],
  }),
])

export const sectionAccordion = section('sectionAccordion', 'Expandable list', [
  defineField({
    name: 'items',
    type: 'array',
    of: [
      {
        type: 'object',
        name: 'accordionItem',
        fields: [
          {name: 'kicker', type: 'string'},
          {name: 'title', type: 'string'},
          {name: 'summary', type: 'text', rows: 2},
          {name: 'body', type: 'richText'},
        ],
        preview: {select: {title: 'title', subtitle: 'kicker'}},
      },
    ],
  }),
])

export const sectionGive = section('sectionGive', 'Donation or membership amounts with form', [
  defineField({name: 'checkout', title: 'Take payment on this page', type: 'boolean', initialValue: true, description: 'Shows the built-in form with PayPal, Apple Pay and mail a check. Turn off to show the JotForm form below instead.'}),
  defineField({name: 'formUrl', title: 'JotForm link (fallback)', type: 'url', description: 'Only used when Take payment on this page is off'}),
  defineField({name: 'embed', title: 'Show the form on this page', type: 'boolean', initialValue: true}),
  defineField({name: 'prefill', title: 'Fill the chosen amount into the form', type: 'boolean', initialValue: true, description: 'Works with the donation form. Turn off for membership levels.'}),
  defineField({name: 'period', title: 'Amount label', type: 'string', description: 'Optional, like per year'}),
  defineField({
    name: 'amounts',
    title: 'Amounts or levels',
    type: 'array',
    of: [
      {
        type: 'object',
        name: 'giveAmount',
        fields: [
          {name: 'title', title: 'Level name', type: 'string', description: 'Optional, for membership levels'},
          {name: 'amount', type: 'number', validation: (r) => r.required().positive()},
          {name: 'impact', title: 'Short description', type: 'string'},
        ],
        preview: {select: {name: 'title', amount: 'amount', subtitle: 'impact'}, prepare: ({name, amount, subtitle}) => ({title: name ? `${name} $${amount}` : `$${amount}`, subtitle})},
      },
    ],
  }),
  defineField({name: 'otherLabel', title: 'Other amount label', type: 'string', description: 'Leave empty to hide the other amount tile'}),
  defineField({name: 'points', title: 'Reassurance points', type: 'array', of: [{type: 'string'}]}),
  defineField({name: 'note', title: 'Small print', type: 'text', rows: 3}),
  defineField({name: 'formHeading', title: 'Form heading', type: 'string'}),
  defineField({name: 'formIntro', title: 'Form intro', type: 'text', rows: 2}),
])

export const sectionNewsletter = section('sectionNewsletter', 'Mailing list sign-up', [
  defineField({name: 'points', title: 'Short points', type: 'array', of: [{type: 'string'}]}),
  defineField({name: 'formId', title: 'Constant Contact inline form ID', type: 'string', description: 'From Constant Contact: Sign-up forms, the inline form, View inline code'}),
  defineField({name: 'accountKey', title: 'Constant Contact universal code key', type: 'string', description: 'The _ctct_m value in the universal code'}),
])

export const sectionCta = section('sectionCta', 'Call to action band', [])

export const sectionEmbed = section('sectionEmbed', 'Embed (video, form, slides)', [
  defineField({name: 'url', type: 'url', description: 'YouTube, Vimeo, Canva, Jotform or Google embed link'}),
  defineField({name: 'title', type: 'string', description: 'Describes the embed for screen readers'}),
  defineField({name: 'aspect', type: 'string', options: {list: ['16:9', '4:3', '1:1', 'tall']}, initialValue: '16:9'}),
  defineField({name: 'caption', type: 'string'}),
])

export const sectionGallery = section('sectionGallery', 'Photo gallery', [
  defineField({name: 'images', type: 'array', of: [{type: 'imageWithAlt'}], options: {layout: 'grid'}}),
  defineField({
    name: 'layout',
    type: 'string',
    description: 'Mosaic mixes large and small photos. Whole images shows infographics and slides uncropped. Photo strip scrolls sideways.',
    options: {list: [{title: 'Mosaic', value: 'mosaic'}, {title: 'Even grid', value: 'grid'}, {title: 'Whole images', value: 'whole'}, {title: 'Photo strip', value: 'band'}], layout: 'radio'},
    initialValue: 'mosaic',
  }),
  defineField({name: 'showWhole', type: 'boolean', hidden: true}),
])

export const sectionLinks = section('sectionLinks', 'Resource links', [
  defineField({
    name: 'links',
    type: 'array',
    of: [
      {
        type: 'object',
        name: 'resourceLink',
        fields: [
          {name: 'kicker', type: 'string'},
          {name: 'title', type: 'string'},
          {name: 'description', type: 'text', rows: 2},
          {name: 'url', type: 'string'},
        ],
        preview: {select: {title: 'title', subtitle: 'url'}},
      },
    ],
  }),
])

export const sectionCollection = section('sectionCollection', 'Automatic list', [
  defineField({
    name: 'collection',
    type: 'string',
    description: 'Pulls in items you manage elsewhere in the Studio',
    options: {
      list: [
        {title: 'Board of Directors', value: 'people'},
        {title: 'Committees', value: 'committees'},
        {title: 'Adopted positions', value: 'positions'},
        {title: 'Upcoming events', value: 'events'},
        {title: 'Past events', value: 'pastEvents'},
        {title: 'News posts', value: 'posts'},
        {title: 'Endorsements', value: 'endorsements'},
        {title: 'Civic actions', value: 'actions'},
        {title: 'Boards and commissions', value: 'opportunities'},
        {title: 'Explainers', value: 'explainers'},
        {title: 'Photo albums', value: 'albums'},
      ],
    },
  }),
  defineField({name: 'filter', type: 'string', description: 'Optional. For endorsements, the election name, like 2026 General'}),
  defineField({name: 'limit', type: 'number'}),
])

export const sectionTypes = [
  'sectionText',
  'sectionCards',
  'sectionStats',
  'sectionSplit',
  'sectionQuote',
  'sectionTimeline',
  'sectionNameList',
  'sectionAccordion',
  'sectionLinks',
  'sectionCollection',
  'sectionGallery',
  'sectionEmbed',
  'sectionCta',
  'sectionGive',
  'sectionNewsletter',
]

export const seo = defineType({
  name: 'seo',
  title: 'Search and sharing',
  type: 'object',
  options: {collapsible: true, collapsed: true},
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'description', type: 'text', rows: 3}),
    defineField({name: 'image', type: 'image'}),
  ],
})

export default [
  link,
  imageWithAlt,
  richText,
  stat,
  card,
  hero,
  seo,
  sectionText,
  sectionCards,
  sectionStats,
  sectionSplit,
  sectionQuote,
  sectionTimeline,
  sectionNameList,
  sectionAccordion,
  sectionCta,
  sectionGive,
  sectionNewsletter,
  sectionEmbed,
  sectionGallery,
  sectionLinks,
  sectionCollection,
]
