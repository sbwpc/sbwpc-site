import {defineCliConfig} from 'sanity/cli'
export default defineCliConfig({
  api: {projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'coo0nu6y', dataset: process.env.SANITY_STUDIO_DATASET || 'production'},
  studioHost: 'sbwpc',
  deployment: {appId: 'nv45dv6kgzrvptqb2resqfnx'},
})
