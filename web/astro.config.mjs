import {defineConfig} from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://sbwpc.org',
  trailingSlash: 'ignore',
  build: {format: 'directory'},
  integrations: [sitemap({filter: (page) => !page.includes('/admin') && !page.includes('-preview')})],
  prefetch: {prefetchAll: true, defaultStrategy: 'hover'},
})
