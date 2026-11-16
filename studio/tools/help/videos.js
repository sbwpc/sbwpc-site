// The how-to videos for the SBWPC website editor. The files are on sbwpc.org under /studio-help/, which search engines are told
// to skip and the site never links to. Written by help-videos/tools/make-help-code.py.
export const HELP_BASE = 'https://sbwpc.org/studio-help/'

export const HELP_GROUPS = [
  {key: 'start', title: 'Start here', about: 'Watch these three first, in order.'},
  {key: 'more', title: 'Adding and changing things', about: 'News, events, endorsements, the directory and photos.'},
  {key: 'help', title: 'Publishing, fixing and members', about: 'How Publish works, how to undo a mistake, and the membership tool.'},
]

export const HELP_VIDEOS = [
  {key: 'start', n: 1, group: 'start', title: "Where do I begin?", length: '1:10', file: 'sbwpc-studio-1-find-your-way', about: "The left menu, what each item is for, and where Publish is."},
  {key: 'settings', n: 2, group: 'start', title: "How do I change the menu, footer or banner?", length: '1:11', file: 'sbwpc-studio-2-site-settings', about: "Site settings: the Join and Donate links, the menu, the footer and the top banner."},
  {key: 'pages', n: 3, group: 'start', title: "How do pages and sections work?", length: '1:05', file: 'sbwpc-studio-3-pages', about: "Open a page, change a section, add one, move one, and remove one."},
  {key: 'news', n: 4, group: 'more', title: "How do I write a News post?", length: '1:09', file: 'sbwpc-studio-4-news', about: "The title, address, date, category, photo, the body with a link, and Publish."},
  {key: 'events', n: 5, group: 'more', title: "How do I add an Event?", length: '1:21', file: 'sbwpc-studio-5-events', about: "Title, date and time, place, kind, summary, buttons, an event page, and Publish."},
  {key: 'endorsements', n: 6, group: 'more', title: "How do I add an Endorsement?", length: '0:52', file: 'sbwpc-studio-6-endorsements', about: "One entry per race: election, office, decision, candidate, photo and note."},
  {key: 'directory', n: 7, group: 'more', title: "How does the directory work?", length: '1:16', file: 'sbwpc-studio-7-directory', about: "Board of Directors, Committees, Adopted positions, Civic actions and Boards and commissions."},
  {key: 'photos', n: 8, group: 'more', title: "How do I make a Photo album?", length: '1:05', file: 'sbwpc-studio-8-photo-albums', about: "A new album, adding photos, the photo description, and using photos elsewhere."},
  {key: 'publishing', n: 9, group: 'help', title: "How does publishing work?", length: '1:15', file: 'sbwpc-studio-9-publishing', about: "Draft and Published, the Publish button, the one minute wait, and History."},
  {key: 'fix', n: 10, group: 'help', title: "How do I fix a mistake?", length: '0:49', file: 'sbwpc-studio-10-fix-a-mistake', about: "Discard changes, restore from History, Unpublish and Delete."},
  {key: 'members', n: 11, group: 'help', title: "How do I use the membership tool?", length: '1:23', file: 'sbwpc-studio-11-membership-tool', about: "Sign in, members, donors and payments, checks to confirm, and downloads."},
]

/** Opens the Help tab at one video, from places that cannot use the Studio's router themselves. */
export const openHelp = (key) => window.dispatchEvent(new CustomEvent('sbwpc-help', {detail: key}))
