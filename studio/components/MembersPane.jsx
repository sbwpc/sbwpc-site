import {useClient} from 'sanity'
import {useState} from 'react'

const ADMIN_URL = 'https://sbwpc.org/admin/'

const wrap = {padding: '32px 40px', maxWidth: 760, lineHeight: 1.5, fontSize: 15}
const card = {
  border: '1px solid rgba(128,128,128,0.35)',
  borderRadius: 6,
  padding: '16px 18px',
  margin: '0 0 14px',
}
const h3 = {margin: '0 0 6px', fontSize: 17, fontWeight: 600}
const p = {margin: '0 0 8px'}
const button = {
  display: 'inline-block',
  padding: '10px 18px',
  borderRadius: 4,
  background: '#5e3795',
  color: '#ffffff',
  fontWeight: 600,
  textDecoration: 'none',
  margin: '4px 0 24px',
}

function Item({title, children}) {
  return (
    <div style={card}>
      <h3 style={h3}>{title}</h3>
      <p style={{...p, margin: 0}}>{children}</p>
    </div>
  )
}

export function MembersPane() {
  // The Studio signs in with a token (see sanity.config.js). The member system checks it with Sanity,
  // so only people who can sign in to this Studio and are on the admin list get in. No second password or code.
  const client = useClient({apiVersion: '2025-02-19'})
  const [problem, setProblem] = useState('')
  const open = (e) => {
    e.preventDefault()
    const token = client.config().token
    if (!token) {
      setProblem('Your Studio sign-in is out of date. Sign out of the Studio, sign in again, and press the button again.')
      return
    }
    setProblem('')
    window.open(ADMIN_URL + '#studio=' + encodeURIComponent(token), '_blank', 'noopener,noreferrer')
  }
  return (
    <div style={wrap}>
      <h1 style={{margin: '0 0 10px', fontSize: 28}}>Members and donations</h1>
      <p style={{margin: '0 0 8px', fontSize: 17}}>
        Members, donors and payments are kept in a separate, locked system. Member details are never stored in this website editor.
      </p>
      <a href={ADMIN_URL} onClick={open} style={button}>
        Open the member system
      </a>
      {problem ? <p style={{...p, color: '#b3261e'}} role="alert">{problem}</p> : null}

      <Item title="Signing in">
        You are already signed in. The button above opens the member system without a password or a code. Only people on the SBWPC admin list can open it.
      </Item>
      <Item title="Record a check or cash payment">
        Open the person, choose to record a payment, and fill in the amount and date. A mailed check only counts as paid after you mark it received.
      </Item>
      <Item title="Download lists">
        Use the download buttons for the member list, the payments list, or the email list of people who agreed to hear from us.
      </Item>
    </div>
  )
}
