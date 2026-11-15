// Runs after the static build and tidies the generated HTML and sitemap:
//  1. internal links get a trailing slash, so they match the real URLs and skip a redirect
//  2. heading levels inside <main> never skip a level (an h3 straight under an h1 becomes an h2)
//  3. the sitemap gets lastmod dates for pages that declare article:modified_time,
//     and drops pages whose canonical points somewhere else
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const SKIP_DIRS = new Set(['admin', 'manage'])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) {
      if (dir === ROOT && SKIP_DIRS.has(name.name)) continue
      walk(full, out)
    } else if (name.name.endsWith('.html')) out.push(full)
  }
  return out
}
let ROOT = ''

export function slashLinks(html) {
  return html.replace(/(\shref=")(\/[^"#?]*)([?#][^"]*)?"/g, (m, pre, p, tail = '') => {
    if (p === '/' || p.startsWith('//') || p.endsWith('/')) return m
    const last = p.split('/').pop()
    if (last.includes('.')) return m // files such as .pdf, .xml, .svg
    return `${pre}${p}/${tail}"`
  })
}

export function fixHeadings(html) {
  const start = html.search(/<main[\s>]/)
  const end = html.indexOf('</main>')
  if (start < 0 || end < 0) return html
  const main = html.slice(start, end)
  const stack = [] // {orig, now}
  const fixed = main.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (m, lvl, attrs = '', inner) => {
    const orig = Number(lvl)
    while (stack.length && stack[stack.length - 1].orig >= orig) stack.pop()
    const now = stack.length ? Math.min(6, stack[stack.length - 1].now + 1) : orig
    stack.push({orig, now})
    if (now === orig) return m
    // keep the look of the original level; prose styles key off data-h
    return `<h${now}${attrs} data-h="${orig}">${inner}</h${now}>`
  })
  return html.slice(0, start) + fixed + html.slice(end)
}

export default function seoPostbuild() {
  return {
    name: 'sbwpc-seo-postbuild',
    hooks: {
      'astro:build:done': async ({dir}) => {
        ROOT = fileURLToPath(dir)
        const mod = new Map() // url -> lastmod
        const drop = new Set()
        let links = 0
        let heads = 0
        for (const file of walk(ROOT)) {
          let html = fs.readFileSync(file, 'utf8')
          const before = html
          html = slashLinks(html)
          if (html !== before) links++
          const h2 = fixHeadings(html)
          if (h2 !== html) heads++
          html = h2
          if (html !== before) fs.writeFileSync(file, html)
          const rel = path.relative(ROOT, file).replace(/index\.html$/, '').replace(/\\/g, '/')
          const url = 'https://sbwpc.org/' + rel
          const m = html.match(/<meta property="article:modified_time" content="([^"]+)"/)
          if (m) mod.set(url, new Date(m[1]).toISOString().slice(0, 10))
          const c = html.match(/<link rel="canonical" href="([^"]+)"/)
          if (c && c[1] !== url && url !== 'https://sbwpc.org/404.html') drop.add(url)
        }
        const sm = path.join(ROOT, 'sitemap-0.xml')
        if (fs.existsSync(sm)) {
          let xml = fs.readFileSync(sm, 'utf8')
          xml = xml.replace(/<url><loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g, (m, loc, rest) => {
            if (drop.has(loc)) return ''
            return mod.has(loc) ? `<url><loc>${loc}</loc><lastmod>${mod.get(loc)}</lastmod>${rest}</url>` : m
          })
          fs.writeFileSync(sm, xml)
        }
        console.log(`[sbwpc-seo] slashed links in ${links} files, fixed headings in ${heads} files, ${mod.size} lastmod dates, ${drop.size} non-canonical pages left out of the sitemap`)
      },
    },
  }
}
