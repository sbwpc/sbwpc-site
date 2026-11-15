import {Box, Card, Heading, Stack, Text} from '@sanity/ui'
import {IntentLink} from 'sanity/router'

const link = {
  display: 'inline-block',
  padding: '8px 14px',
  borderRadius: 4,
  background: '#5e3795',
  color: '#ffffff',
  fontWeight: 600,
  textDecoration: 'none',
}

function Job({title, children}) {
  return (
    <Card padding={4} radius={2} border>
      <Stack space={3}>
        <Heading as="h3" size={1}>
          {title}
        </Heading>
        {children}
      </Stack>
    </Card>
  )
}

export function StartHere() {
  return (
    <Box padding={5} style={{maxWidth: 760}}>
      <Stack space={5}>
        <Stack space={3}>
          <Heading as="h1" size={3}>
            Welcome
          </Heading>
          <Text size={2}>
            Everything you change here appears on sbwpc.org. After you click Publish, the website updates in about a minute.
          </Text>
          <Text size={1} muted>
            Your changes stay private until you click Publish. You can stop at any time and come back later. Your work is saved as a draft.
          </Text>
        </Stack>

        <Job title="Post news">
          <Text size={1}>Fill in the title, date, a short summary and a photo. Then click Publish.</Text>
          <div>
            <IntentLink intent="create" params={{type: 'post'}} style={link}>
              Add a news post
            </IntentLink>
          </div>
        </Job>

        <Job title="Add an event">
          <Text size={1}>Fill in the title, start time and place. Use Buttons for a sign-up link. Then click Publish.</Text>
          <div>
            <IntentLink intent="create" params={{type: 'event'}} style={link}>
              Add an event
            </IntentLink>
          </div>
        </Job>

        <Job title="Add an endorsement">
          <Text size={1}>Choose the election, then the office and the candidate. Then click Publish.</Text>
          <div>
            <IntentLink intent="create" params={{type: 'endorsement'}} style={link}>
              Add an endorsement
            </IntentLink>
          </div>
        </Job>

        <Job title="Change a board member">
          <Text size={1}>Open Board of Directors in the left menu. Click the person, make your change, then click Publish.</Text>
        </Job>

        <Job title="Edit the words on a page">
          <Text size={1}>Open Pages in the left menu. Pick the page. Click the section you want to change. Then click Publish.</Text>
        </Job>

        <Text size={1} muted>
          If you are not sure about something, do not delete it. Ask for help first.
        </Text>
      </Stack>
    </Box>
  )
}
