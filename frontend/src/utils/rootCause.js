// cleanReason turns the backend `root_cause` field into a short, human-readable
// sentence for notifications. The backend stores a large evidence JSON whose
// `investigation_report.interpretation` holds the plain-language summary
// (e.g. "WARNING: respons lambat (3355 ms, HTTP 200)."). If the value is already
// plain text, or can't be parsed, it is returned as-is.
export function cleanReason(rootCause) {
  if (!rootCause) return ''
  if (typeof rootCause !== 'string') return String(rootCause)

  const trimmed = rootCause.trim()
  if (!trimmed.startsWith('{')) return trimmed // already a plain message

  try {
    const obj = JSON.parse(trimmed)
    return (
      obj?.investigation_report?.interpretation ||
      obj?.interpretation ||
      obj?.final_reason ||
      'Status berubah'
    )
  } catch {
    return trimmed
  }
}
