// Builds resized webp copies of seed images into public/media.
// Skipped when the site reads from Sanity (Sanity serves its own image sizes).
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

if (process.env.SANITY_PROJECT_ID) {
  console.log('[media] Sanity mode, skipping local media')
  process.exit(0)
}
const SRC = path.resolve('../seed/images')
const OUT = path.resolve('public/media')
const WIDTHS = [480, 960, 1600, 2400]
fs.mkdirSync(OUT, {recursive: true})
const indexFile = path.join(OUT, 'index.json')
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {}
let made = 0
for (const name of fs.readdirSync(SRC)) {
  if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) continue
  const base = name.replace(/\.[^.]+$/, '')
  if (index[name] && fs.existsSync(path.join(OUT, `${base}-${index[name].widths[0]}.webp`))) continue
  const input = path.join(SRC, name)
  const meta = await sharp(input).metadata()
  const widths = WIDTHS.filter((w) => w < meta.width)
  if (!widths.length || meta.width - widths[widths.length - 1] > 200) widths.push(Math.min(meta.width, 2400))
  for (const w of widths) {
    await sharp(input).rotate().resize({width: w, withoutEnlargement: true}).webp({quality: 80}).toFile(path.join(OUT, `${base}-${w}.webp`))
  }
  index[name] = {base, widths, width: meta.width, height: meta.height}
  made++
}
fs.writeFileSync(indexFile, JSON.stringify(index))
console.log(`[media] ${made} new, ${Object.keys(index).length} total`)
