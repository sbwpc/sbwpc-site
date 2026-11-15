// Links images to their uploaded Sanity assets so the Studio shows thumbnails.
//
// The first import stored each image as a file name (_sanity_asset) and never
// pointed the document at the uploaded asset. This adds the missing asset
// reference and removes the leftover _sanity_asset text.
//
// Dry run (read only, no token needed):   node scripts/link-images.mjs
// Apply (needs a Sanity write token):     SANITY_TOKEN=... node scripts/link-images.mjs --apply
const PROJECT = process.env.SANITY_PROJECT_ID || 'coo0nu6y'
const DATASET = process.env.SANITY_DATASET || 'production'
const TOKEN = process.env.SANITY_TOKEN
const APPLY = process.argv.includes('--apply')
const API = `https://${PROJECT}.api.sanity.io/v2025-02-19`
const headers = TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}

async function query(q) {
  const r = await fetch(`${API}/data/query/${DATASET}?query=${encodeURIComponent(q)}&perspective=raw`, {headers})
  if (!r.ok) throw new Error(`query failed ${r.status}`)
  return (await r.json()).result
}

const assets = await query('*[_type == "sanity.imageAsset"]{_id, originalFilename}')
const byName = new Map(assets.map((a) => [a.originalFilename, a._id]))
const docs = await query('*[!(_type match "sanity.*")]')

const PREFIX = 'image@file://./images/'
const patches = []
const missing = []
let skippedUrls = 0

function walk(node, path, out) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      const seg = child && typeof child === 'object' && child._key ? `[_key=="${child._key}"]` : `[${i}]`
      walk(child, `${path}${seg}`, out)
    })
  } else if (node && typeof node === 'object') {
    const ref = node._sanity_asset
    if (typeof ref === 'string') {
      if (ref.startsWith(PREFIX)) {
        const name = ref.slice(PREFIX.length)
        const id = byName.get(name)
        if (id) out.push({path, id})
        else missing.push({path, name})
      } else {
        skippedUrls += 1
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('_')) continue
      walk(v, path ? `${path}.${k}` : k, out)
    }
  }
}

for (const doc of docs) {
  const found = []
  walk(doc, '', found)
  if (!found.length) continue
  patches.push({
    id: doc._id,
    set: Object.fromEntries(found.map((f) => [`${f.path}.asset`, {_type: 'reference', _ref: f.id}])),
    unset: found.map((f) => `${f.path}._sanity_asset`),
  })
}

const total = patches.reduce((n, p) => n + p.unset.length, 0)
console.log(`Documents to change: ${patches.length}`)
console.log(`Image fields to link: ${total}`)
console.log(`Files with no matching asset: ${missing.length}`)
missing.slice(0, 10).forEach((m) => console.log('  missing', m.name))
console.log(`External image URLs left as they are: ${skippedUrls}`)

if (!APPLY) {
  console.log('\nDry run only. Nothing was changed.')
  process.exit(0)
}
if (!TOKEN) throw new Error('SANITY_TOKEN is required with --apply')

for (let i = 0; i < patches.length; i += 25) {
  const chunk = patches.slice(i, i + 25)
  const mutations = chunk.map((p) => ({patch: {id: p.id, set: p.set, unset: p.unset}}))
  const r = await fetch(`${API}/data/mutate/${DATASET}`, {
    method: 'POST',
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify({mutations}),
  })
  if (!r.ok) throw new Error(`mutate failed ${r.status}: ${await r.text()}`)
  console.log(`Updated ${Math.min(i + 25, patches.length)} of ${patches.length}`)
}
console.log('Done.')
