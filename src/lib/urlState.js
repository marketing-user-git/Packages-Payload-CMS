// Shared query-param state helpers.
// The shell and the analytics dashboard both swap views without a route change,
// so their view state is mirrored into the querystring — otherwise the URL never
// moves and the browser Back button leaves the site instead of stepping back.
// Each caller only touches its own keys, so they compose safely.

// Returns the canonical member of `allowed` matching the param (case-insensitive),
// or the raw value when `allowed` is omitted. Null if absent or not permitted.
export function readParam(key, allowed) {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get(key)
  if (!raw) return null
  if (!allowed) return raw
  return allowed.find((v) => String(v).toLowerCase() === raw.toLowerCase()) || null
}

// patch: { key: value | null }  — null/'' removes the key.
// replace=true for redirects the user didn't ask for (auto-pick, logout, denied),
// so they don't pile up as Back-button steps.
export function writeParams(patch, replace) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') url.searchParams.delete(k)
    else url.searchParams.set(k, String(v).toLowerCase())
  }
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
}

// Subscribe to Back/Forward. Returns an unsubscribe for useEffect cleanup.
export function onPopState(fn) {
  window.addEventListener('popstate', fn)
  return () => window.removeEventListener('popstate', fn)
}
