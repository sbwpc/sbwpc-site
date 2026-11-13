// Membership levels, committees and limits. One list used by the forms, the server and the admin.
// Prices here are what the server charges. The tiles on the Join page must match (the build checks this).
export const LEVELS = [
  {name: 'Friend', amount: 16},
  {name: 'Advocate', amount: 40},
  {name: 'Feminist Household', amount: 60},
  {name: 'Access', amount: 125},
  {name: 'Voice', amount: 300},
  {name: 'Power', amount: 500},
  {name: 'Feminist Champion', amount: 1000},
  {name: 'Legacy', amount: 5000},
]
export const COMMITTEES = [
  'Legislation and Advocacy',
  'Membership',
  'Candidate Development',
  'Media',
  'Elections and Appointments',
  'Equal Rights Amendment Committee',
  'Event Planning',
  'Young Femmes',
]
// Online gifts outside this range are stopped as a safety check, not as SBWPC policy
export const DONATION_MIN = 1
export const DONATION_MAX = 25000
// Where checks go
export const CHECK = {
  payable: "Santa Barbara Women's Political Committee",
  address: ['SBWPC', 'P.O. Box 90618', 'Santa Barbara, CA 93190-0618'],
}
export const levelAmount = (name) => (LEVELS.find((l) => l.name === name) || {}).amount
export const dollars = (cents) => {
  const n = cents / 100
  return '$' + n.toLocaleString('en-US', {minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2})
}
