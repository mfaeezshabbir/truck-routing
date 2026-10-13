export const RISK_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']
export const RISK_COLORS = ['#16a34a', '#eab308', '#f97316', '#dc2626', '#7e22ce']
export const RISK_BADGE = [
  'text-green-700', 'text-yellow-700', 'text-orange-700', 'text-red-700', 'text-purple-700',
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
