import {IntentLink} from 'sanity/router'

const wrap = {padding: '32px 40px', maxWidth: 760, lineHeight: 1.5, fontSize: 15}
const card = {
  border: '1px solid rgba(128,128,128,0.35)',
  borderRadius: 6,
  padding: '16px 18px',
  margin: '0 0 14px',
}
const h3 = {margin: '0 0 6px', fontSize: 17, fontWeight: 600}
const p = {margin: '0 0 12px'}
const muted = {margin: '0 0 24px', opacity: 0.7, fontSize: 14}
const button = {
  display: 'inline-block',
  padding: '8px 14px',
  borderRadius: 4,
  background: '#5e3795',
  color: '#ffffff',
  fontWeight: 600,
  textDecoration: 'none',
}

function Job({title, text, intent}) {
  return (
    <div style={card}>
      <h3 style={h3}>{title}</h3>
      <p style={intent ? p : {...p, margin: 0}}>{text}</p>
      {intent ? (
        <IntentLink intent="create" params={{type: intent.type}} style={button}>
          {intent.label}
        </IntentLink>
      ) : null}
    </div>
  )
}

export function StartHere() {
  return (
    <div style={wrap}>
      <h1 style={{margin: '0 0 10px', fontSize: 28}}>Welcome</h1>
      <p style={{margin: '0 0 8px', fontSize: 17}}>
        Everything you change here appears on sbwpc.org. After you click Publish, the website updates in about a minute.
      </p>
      <p style={muted}>
        Your changes stay private until you click Publish. You can stop at any time and come back later. Your work is saved as a draft.
      </p>

      <Job
        title="Post news"
        text="Fill in the title, date, a short summary and a photo. Then click Publish."
        intent={{type: 'post', label: 'Add a news post'}}
      />
      <Job
        title="Add an event"
        text="Fill in the title, start time and place. Use Buttons for a sign-up link. Then click Publish."
        intent={{type: 'event', label: 'Add an event'}}
      />
      <Job
        title="Add an endorsement"
        text="Choose the election, then the office and the candidate. Then click Publish."
        intent={{type: 'endorsement', label: 'Add an endorsement'}}
      />
      <Job
        title="Manage members and donations"
        text="Open Members and donations in the left menu, then Open the member system. It has its own sign-in."
      />
      <Job
        title="Change a board member"
        text="Open Board of Directors in the left menu. Click the person, make your change, then click Publish."
      />
      <Job
        title="Edit the words on a page"
        text="Open Pages in the left menu. Pick the page. Click the section you want to change. Then click Publish."
      />

      <p style={muted}>If you are not sure about something, do not delete it. Ask for help first.</p>
    </div>
  )
}
