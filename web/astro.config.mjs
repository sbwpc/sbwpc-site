import {defineConfig} from 'astro/config'
import sitemap from '@astrojs/sitemap'
import netlify from '@astrojs/netlify'
import seoPostbuild from './integrations/seo-postbuild.mjs'

// Pages are built ahead of time. Only /preview/ (the Studio's draft preview) runs on request, which is why the Netlify adapter is here.
export default defineConfig({
  site: 'https://sbwpc.org',
  adapter: netlify(),
  trailingSlash: 'ignore',
  build: {format: 'directory'},
  integrations: [sitemap({filter: (page) => !page.includes('/admin') && !page.includes('-preview') && !page.includes('/manage') && !page.includes('/preview')}), seoPostbuild()],
  prefetch: {prefetchAll: true, defaultStrategy: 'hover'},
})
