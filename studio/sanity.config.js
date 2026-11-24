import {buildLegacyTheme, defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import objects from './schemas/objects.js'
import documents from './schemas/documents.js'
import {friendly} from './schemas/friendly.js'
import {structure} from './structure.js'
import {Logo} from './components/Logo.jsx'
import {withPublishNote} from './components/publishNote.js'
import {helpTool} from './tools/help/index.js'
import {withWatchHow} from './tools/help/WatchHow.jsx'
import {PreviewPane} from './components/PreviewPane.jsx'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'coo0nu6y'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

// The Vision query tool is for developers. It stays hidden unless this is set when building or running.
const showVision = Boolean(process.env.SANITY_STUDIO_SHOW_VISION)

// SBWPC brand colors
const theme = buildLegacyTheme({
  '--brand-primary': '#5e3795',
  '--focus-color': '#5e3795',
  '--default-button-primary-color': '#5e3795',
  '--main-navigation-color': '#1e2c5b',
  '--main-navigation-color--inverted': '#ffffff',
})

// Pages and Site settings must never be deleted or unpublished by accident
const PROTECTED = ['page', 'siteSettings']
const BLOCKED = ['delete', 'unpublish', 'duplicate']

// Documents that get a Preview tab (the website renders the draft before it is published)
const PREVIEW = ['page', 'post', 'event', 'endorsement', 'person', 'committee', 'position', 'action', 'opportunity', 'album', 'siteSettings']
const defaultDocumentNode = (S, {schemaType}) =>
  PREVIEW.includes(schemaType) ? S.document().views([S.view.form().title('Edit'), S.view.component(PreviewPane).title('Preview')]) : S.document().views([S.view.form()])

// Which how-to video sits above each kind of entry
const WATCH = {siteSettings: 'settings', page: 'pages', post: 'news', event: 'events', endorsement: 'endorsements', person: 'directory', committee: 'directory', position: 'directory', action: 'directory', opportunity: 'directory', album: 'photos'}

export default defineConfig({
  name: 'sbwpc',
  title: 'SBWPC Website',
  // Sign in with a token kept in the browser. The member system uses it to confirm who is signing in
  // from the Members and donations screen (web/netlify/functions/studio-login.mjs).
  auth: {loginMethod: 'token'},
  projectId,
  dataset,
  theme,
  plugins: [structureTool({structure, defaultDocumentNode}), helpTool(), ...(showVision ? [visionTool()] : [])],
  studio: {components: {logo: Logo}},
  schema: {
    types: friendly([...objects, ...documents]).map((t) => (WATCH[t.name] ? {...t, components: {...(t.components || {}), input: withWatchHow(WATCH[t.name])}} : t)),
    // Site settings is a single document, so hide it from "create new"
    templates: (prev) => prev.filter((t) => t.schemaType !== 'siteSettings'),
  },
  document: {
    actions: (prev, {schemaType}) => {
      const kept = PROTECTED.includes(schemaType) ? prev.filter((a) => !BLOCKED.includes(a.action)) : prev
      return kept.map((a) => (a.action === 'publish' ? withPublishNote(a) : a))
    },
  },
})
