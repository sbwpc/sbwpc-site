import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import objects from './schemas/objects.js'
import documents from './schemas/documents.js'
import {structure} from './structure.js'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'REPLACE_ME'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineConfig({
  name: 'sbwpc',
  title: 'SBWPC',
  projectId,
  dataset,
  plugins: [structureTool({structure}), visionTool()],
  schema: {
    types: [...objects, ...documents],
    // Site settings is a single document, so hide it from "create new"
    templates: (prev) => prev.filter((t) => t.schemaType !== 'siteSettings'),
  },
  document: {
    actions: (prev, {schemaType}) =>
      schemaType === 'siteSettings' ? prev.filter((a) => !['duplicate', 'delete', 'unpublish'].includes(a.action)) : prev,
  },
})
