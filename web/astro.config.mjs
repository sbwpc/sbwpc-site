import {defineConfig} from 'astro/config'
import sitemap from '@astrojs/sitemap'
import seoPostbuild from './integrations/seo-postbuild.mjs'

export default defineConfig({
  site: 'https://sbwpc.org',
  trailingSlash: 'ignore',
  build: {format: 'directory'},
  integrations: [sitemap({filter: (page) => !page.includes('/admin') && !page.includes('-preview') && !page.includes('/manage')}), seoPostbuild()],
  prefetch: {prefetchAll: true, defaultStrategy: 'hover'},
})
