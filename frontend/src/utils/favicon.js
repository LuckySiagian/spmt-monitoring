export function getDomain(url) {
  if (!url) return ''
  try {
    let clean = url.trim()
    if (!clean.startsWith('http')) clean = 'http://' + clean
    return new URL(clean).hostname
  } catch {
    return url
  }
}

export function shouldSkipFavicon(url) {
  const domain = getDomain(url)
  if (!domain) return true

  // Skip localhost, local IP addresses (v4 & v6)
  if (/^(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?::1\]?)$/.test(domain)) return true

  // Skip internal/private Pelindo domains
  if (
    domain.endsWith('.pelindo.co.id') ||
    domain.endsWith('.pelindomultiterminal.co.id')
  ) {
    return true
  }

  // Skip known mock, testing, or API-only domains with no favicon
  const testPatterns = [
    'badssl.com',
    'asdasd',
    'example.org',
    'example.com',
    'example.net',
    'httpstat.us',
    'invalid-dns',
    'appspot.com',
    'coindesk.com'
  ]
  
  return testPatterns.some(pattern => domain.toLowerCase().includes(pattern))
}
