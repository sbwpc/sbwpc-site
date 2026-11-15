import logo from '../static/sbwpc-logomark-white.svg'

export function Logo() {
  return (
    <span style={{display: 'inline-flex', alignItems: 'center', gap: 10}}>
      <img src={logo} alt="" height="26" />
      <span style={{fontWeight: 600, fontSize: 15}}>SBWPC Website</span>
    </span>
  )
}
