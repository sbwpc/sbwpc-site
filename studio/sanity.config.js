import {buildLegacyTheme, defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import objects from './schemas/objects.js'
import documents from './schemas/documents.js'
import {friendly} from './schemas/friendly.js'
import {structure} from './structure.js'
import {Logo} from './components/Logo.jsx'
import {withPublishNote} from './components/publishNote.js'

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

export default defineConfig({
  name: 'sbwpc',
  title: 'SBWPC Website',
  projectId,
  dataset,
  theme,
  plugins: [structureTool({structure}), ...(showVision ? [visionTool()] : [])],
  studio: {components: {logo: Logo}},
  schema: {
    types: friendly([...objects, ...documents]),
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
