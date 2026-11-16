// "Watch how": a small link to the matching how-to video in the Help tab. HelpEvents (in the Studio layout) opens the Help tab
// for buttons that have no router of their own.
import {useEffect} from 'react'
import {useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'
import {Stack, Text} from '@sanity/ui'
import {HELP_VIDEOS, openHelp} from './videos.js'

const helpState = (video) => ({tool: 'help', help: {video}})

export function WatchHow({video}) {
  const {basePath} = useWorkspace()
  const v = HELP_VIDEOS.find((x) => x.key === video)
  if (!v) return null
  const href = `${String(basePath || '').replace(/\/$/, '')}/help/${video}`
  return (
    <Text size={1} muted>
      <a
        href={href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return
          e.preventDefault()
          openHelp(video)
        }}
      >
        Watch how
      </a>{' '}
      ({v.length} video: {v.title})
    </Text>
  )
}

/** A document form with the Watch how link above it. */
export const withWatchHow = (video) =>
  function WithWatchHow(props) {
    return (
      <Stack gap={5}>
        <WatchHow video={video} />
        {props.renderDefault(props)}
      </Stack>
    )
  }

/** Lets list buttons (which have no router of their own) open the Help tab. */
export function HelpEvents(props) {
  const router = useRouter()
  useEffect(() => {
    const open = (e) => router.navigate(helpState(String(e.detail)))
    window.addEventListener('sbwpc-help', open)
    return () => window.removeEventListener('sbwpc-help', open)
  }, [router])
  return props.renderDefault(props)
}
