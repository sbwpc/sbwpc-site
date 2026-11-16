// The Help tab: the how-to videos, in groups (videos.js). /help/<video> opens the tab at that video.
import {useEffect, useRef} from 'react'
import {useRouterState} from 'sanity/router'
import {Badge, Box, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {HELP_BASE, HELP_GROUPS, HELP_VIDEOS} from './videos.js'

export function HelpTool() {
  const video = useRouterState((s) => s && s.video)
  const cards = useRef({})

  useEffect(() => {
    const el = video ? cards.current[video] : null
    if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [video])

  return (
    <Box style={{height: '100%', overflow: 'auto'}}>
      <Container width={3} padding={4}>
        <Stack gap={5}>
          <Stack gap={3}>
            <Heading as="h1" size={3}>Help</Heading>
            <Text muted>Short videos about the SBWPC website editor and the membership tool.</Text>
          </Stack>
          {HELP_GROUPS.map((g) => (
            <Stack key={g.key} gap={4}>
              <Stack gap={3} paddingTop={2}>
                <Heading as="h2" size={2}>{g.title}</Heading>
                <Text size={1} muted>{g.about}</Text>
              </Stack>
              {HELP_VIDEOS.filter((v) => v.group === g.key).map((v) => (
                <VideoCard key={v.key} v={v} on={video === v.key} cardRef={(el) => { cards.current[v.key] = el }} />
              ))}
            </Stack>
          ))}
        </Stack>
      </Container>
    </Box>
  )
}

function VideoCard({v, on, cardRef}) {
  return (
    <Card ref={cardRef} padding={4} radius={3} border tone={on ? 'primary' : 'default'} style={{scrollMarginTop: 16}}>
      <Stack gap={4}>
        <Flex align="center" gap={3}>
          <Badge tone="primary" fontSize={1}>{v.n}</Badge>
          <Heading as="h3" size={1}>{v.title}</Heading>
          <Text size={1} muted>{v.length}</Text>
        </Flex>
        <Text size={1} muted>{v.about}</Text>
        <video
          src={`${HELP_BASE}${v.file}.mp4`}
          poster={`${HELP_BASE}${v.file}.jpg`}
          controls
          preload="metadata"
          playsInline
          style={{width: '100%', aspectRatio: '16 / 9', borderRadius: 6, background: '#000', display: 'block'}}
        />
      </Stack>
    </Card>
  )
}
