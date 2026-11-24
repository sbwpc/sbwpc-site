import {useClient} from 'sanity'
import {useEffect, useRef, useState} from 'react'

// A Preview tab next to Edit. It shows the real website page with this document's latest saved draft,
// before anything is published. The page is served by the website itself (web/src/pages/preview).
const ENDPOINT = 'https://sbwpc.org/api/preview/link'

// Where each kind of document shows up on the website
const FIXED = {
  siteSettings: '',
  person: 'about/board',
  committee: 'about/committees',
  position: 'about/positions',
  endorsement: 'elections/endorsements',
  action: 'take-action',
  opportunity: 'take-action/boards-and-commissions',
  album: 'events/gallery',
}

export function previewPath(type, doc) {
  if (type in FIXED) return FIXED[type]
  if (type === 'page') return !doc?.path ? null : doc.path === 'home' ? '' : doc.path
  if (type === 'post') return doc?.externalUrl ? null : doc?.slug?.current ? `news/${doc.slug.current}` : null
  if (type === 'event') return doc?.hasPage && doc?.slug?.current ? `events/${doc.slug.current}` : 'events'
  return null
}

const box = {display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0}
const bar = {display: 'flex', gap: 12, alignItems: 'center', padding: '8px 14px', fontSize: 13, borderBottom: '1px solid rgba(128,128,128,0.35)', flex: '0 0 auto'}
const note = {padding: '28px 32px', maxWidth: 640, lineHeight: 1.5, fontSize: 15}

export function PreviewPane(props) {
  const {document: doc, schemaType} = props
  const client = useClient({apiVersion: '2025-02-19'})
  const shown = doc?.displayed
  const type = schemaType?.name
  const path = previewPath(type, shown)
  // The newest saved copy changes the revision. Wait a moment after the last change, then reload the preview.
  const rev = (doc?.draft?._rev || doc?.published?._rev || '') + ''
  const [reload, setReload] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => setReload((n) => n + 1), 1800)
    return () => clearTimeout(t)
  }, [rev])

  const [link, setLink] = useState('')
  const [problem, setProblem] = useState('')
  useEffect(() => {
    if (path === null) return
    let stop = false
    setLink('')
    setProblem('')
    const token = client.config().token
    if (!token) { setProblem('Your Studio sign-in is out of date. Sign out of the Studio, sign in again, and open the Preview tab again.'); return }
    fetch(ENDPOINT, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({token, path})})
      .then((r) => r.json().catch(() => ({})))
      .then((d) => { if (!stop) d.url ? setLink(d.url) : setProblem(d.message || 'The preview could not be opened.') })
      .catch(() => { if (!stop) setProblem('The preview could not be reached. Check your internet connection and try again.') })
    return () => { stop = true }
  }, [path, client])

  if (path === null) {
    return (
      <div style={note}>
        <h2 style={{margin: '0 0 8px', fontSize: 20}}>No preview for this one</h2>
        <p style={{margin: 0}}>
          {type === 'post' && shown?.externalUrl ? 'This News item links to another website, so it has no page of its own to preview.' : 'Fill in the address (or slug) for this page and save it, and its preview will appear here.'}
        </p>
      </div>
    )
  }
  if (problem) return <div style={note}><h2 style={{margin: '0 0 8px', fontSize: 20}}>Preview not available</h2><p style={{margin: 0}} role="alert">{problem}</p></div>
  if (!link) return <div style={note}>Opening the preview...</div>

  const src = `${link}${link.includes('?') ? '&' : '?'}t=${reload}`
  return (
    <div style={box}>
      <div style={bar}>
        <span>This is how it will look after you press Publish. It updates a moment after you stop typing.</span>
        <button type="button" onClick={() => setReload((n) => n + 1)} style={{marginLeft: 'auto', padding: '4px 10px', cursor: 'pointer'}}>Refresh preview</button>
      </div>
      <iframe key={reload} title="Website preview" src={src} style={{flex: '1 1 auto', width: '100%', border: 0, background: '#fff'}} />
    </div>
  )
}
