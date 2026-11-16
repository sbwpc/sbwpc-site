// Sidebar layout editors see in the Studio.
// Order: the jobs done most often first, then pages, then lists that rarely change.
import {CalendarIcon} from '@sanity/icons/Calendar'
import {CogIcon} from '@sanity/icons/Cog'
import {ComposeIcon} from '@sanity/icons/Compose'
import {DocumentsIcon} from '@sanity/icons/Documents'
import {FolderIcon} from '@sanity/icons/Folder'
import {HelpCircleIcon} from '@sanity/icons/HelpCircle'
import {ImagesIcon} from '@sanity/icons/Images'
import {StarIcon} from '@sanity/icons/Star'
import {UsersIcon} from '@sanity/icons/Users'
import {PlayIcon} from '@sanity/icons/Play'
import {openHelp} from './tools/help/videos.js'
import {StartHere} from './components/StartHere.jsx'
import {MembersPane} from './components/MembersPane.jsx'

const API = {apiVersion: '2025-02-19'}

// Structure ids cannot contain spaces or odd characters
const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Pages grouped by the part of the site they belong to
const PAGE_GROUPS = [
  ['Home', '_type == "page" && path == "home"'],
  ['About', '_type == "page" && path match "about/*"'],
  ['Advocacy', '_type == "page" && (path == "advocacy" || path match "advocacy/*")'],
  ['Elections', '_type == "page" && (path == "elections" || path match "elections/*")'],
  ['Events and news', '_type == "page" && (path == "events" || path match "events/*" || path == "news")'],
  ['Take action and join', '_type == "page" && (path == "take-action" || path match "take-action/*" || path match "get-involved/*" || path in ["join", "donate", "contact"])'],
  ['Legal', '_type == "page" && path in ["privacy", "terms", "cookies"]'],
]

export const structure = (S, context) => {
  const client = () => context.getClient(API)

  // Which how-to video each kind of list points to (shown as a play button beside the + button)
  const HELP_FOR = {post: ['news', 'writing a News post'], event: ['events', 'adding an Event'], endorsement: ['endorsements', 'adding an Endorsement'], person: ['directory', 'the directory'], committee: ['directory', 'the directory'], position: ['directory', 'the directory'], action: ['directory', 'the directory'], opportunity: ['directory', 'the directory'], album: ['photos', 'making a Photo album'], page: ['pages', 'pages and sections']}
  const docs = (id, title, type, filter, ordering) => {
    let list = S.documentList().id(id).title(title).schemaType(type).filter(filter).params({}).defaultOrdering(ordering)
    const help = HELP_FOR[type]
    if (help) {
      const watch = S.menuItem().title(`Watch how: ${help[1]}`).icon(PlayIcon).showAsAction(true).action(() => openHelp(help[0]))
      list = list.menuItems([...(list.getMenuItems() || []), watch])
    }
    return list
  }

  const typeList = (id, title, type, ordering, icon) =>
    S.listItem().id(id).title(title).icon(icon).schemaType(type).child(docs(id, title, type, `_type == "${type}"`, ordering))

  const byOrder = [{field: 'order', direction: 'asc'}]

  const news = S.listItem()
    .id('news')
    .title('News')
    .icon(ComposeIcon)
    .child(async () => {
      const years = await client().fetch('array::unique(*[_type == "post" && defined(date)]{"y": string::split(date, "-")[0]}.y)')
      const sorted = (years || []).sort().reverse()
      return S.list()
        .id('newsYears')
        .title('News')
        .items([
          S.listItem().id('news-all').title('All news, newest first').schemaType('post').child(docs('news-all', 'All news', 'post', '_type == "post"', [{field: 'date', direction: 'desc'}])),
          S.divider(),
          ...sorted.map((y) =>
            S.listItem()
              .id(`news-${slug(y)}`)
              .title(y)
              .schemaType('post')
              .child(docs(`news-${slug(y)}`, `News ${y}`, 'post', `_type == "post" && date >= "${y}-01-01" && date <= "${y}-12-31"`, [{field: 'date', direction: 'desc'}])),
          ),
        ])
    })

  const events = S.listItem()
    .id('events')
    .title('Events')
    .icon(CalendarIcon)
    .child(
      S.list()
        .id('eventLists')
        .title('Events')
        .items([
          S.listItem().id('events-upcoming').title('Upcoming').schemaType('event').child(docs('events-upcoming', 'Upcoming events', 'event', '_type == "event" && start >= now()', [{field: 'start', direction: 'asc'}])),
          S.listItem().id('events-past').title('Past').schemaType('event').child(docs('events-past', 'Past events', 'event', '_type == "event" && start < now()', [{field: 'start', direction: 'desc'}])),
          S.listItem().id('events-all').title('All events').schemaType('event').child(docs('events-all', 'All events', 'event', '_type == "event"', [{field: 'start', direction: 'desc'}])),
        ]),
    )

  const endorsements = S.listItem()
    .id('endorsements')
    .title('Endorsements')
    .icon(StarIcon)
    .child(async () => {
      const elections = await client().fetch('array::unique(*[_type == "endorsement" && defined(election)].election)')
      const sorted = (elections || []).sort().reverse()
      return S.list()
        .id('endorsementLists')
        .title('Endorsements')
        .items([
          ...sorted.map((e) =>
            S.listItem()
              .id(`endorse-${slug(e)}`)
              .title(e)
              .schemaType('endorsement')
              .child(S.documentList().id(`endorse-${slug(e)}`).title(e).schemaType('endorsement').filter('_type == "endorsement" && election == $e').params({e}).defaultOrdering(byOrder)),
          ),
          S.divider(),
          S.listItem().id('endorse-all').title('All endorsements').schemaType('endorsement').child(docs('endorse-all', 'All endorsements', 'endorsement', '_type == "endorsement"', byOrder)),
        ])
    })

  const pages = S.listItem()
    .id('pages')
    .title('Pages')
    .icon(DocumentsIcon)
    .child(
      S.list()
        .id('pageGroups')
        .title('Pages')
        .items([
          ...PAGE_GROUPS.map(([title, filter]) =>
            S.listItem().id(`pages-${slug(title)}`).title(title).schemaType('page').child(docs(`pages-${slug(title)}`, title, 'page', filter, [{field: 'path', direction: 'asc'}])),
          ),
          S.divider(),
          S.listItem().id('pages-all').title('All pages, A to Z').schemaType('page').child(docs('pages-all', 'All pages', 'page', '_type == "page"', [{field: 'path', direction: 'asc'}])),
        ]),
    )

  const otherLists = S.listItem()
    .id('otherLists')
    .title('Other lists')
    .icon(FolderIcon)
    .child(
      S.list()
        .id('otherListItems')
        .title('Other lists')
        .items([
          typeList('committees', 'Committees', 'committee', byOrder, UsersIcon),
          typeList('positions', 'Adopted positions', 'position', byOrder, DocumentsIcon),
          typeList('actions', 'Civic actions', 'action', byOrder, StarIcon),
          typeList('opportunities', 'Boards and commissions', 'opportunity', [{field: 'title', direction: 'asc'}], FolderIcon),
        ]),
    )

  return S.list()
    .title('SBWPC')
    .items([
      S.listItem().id('startHere').title('Start here').icon(HelpCircleIcon).child(S.component(StartHere).id('startHere').title('Start here')),
      S.listItem().id('members').title('Members and donations').icon(UsersIcon).child(S.component(MembersPane).id('members').title('Members and donations')),
      S.divider(),
      news,
      events,
      endorsements,
      typeList('board', 'Board of Directors', 'person', byOrder, UsersIcon),
      S.divider(),
      pages,
      typeList('albums', 'Photo albums', 'album', [{field: 'date', direction: 'desc'}], ImagesIcon),
      S.divider(),
      S.listItem().id('siteSettings').title('Site settings (menu, footer, banner)').icon(CogIcon).child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      otherLists,
    ])
}
