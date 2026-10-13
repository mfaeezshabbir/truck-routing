export const RISK_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']
export const RISK_COLORS = ['#16a34a', '#eab308', '#f97316', '#dc2626', '#7e22ce']
export const RISK_BADGE = [
  'bg-green-100 text-green-800', 'bg-yellow-100 text-yellow-800', 'bg-orange-100 text-orange-800',
  'bg-red-100 text-red-800', 'bg-purple-100 text-purple-800',
]

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
/** Compact local time for tables, e.g. "Tue 16:00" (the zone is shown in the column header). */
export const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
export const LOCAL_TZ_ABBR = new Date().toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop()

/** The browser's IANA zone: departures are entered and all times displayed in it. */
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
