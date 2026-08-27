// 404 for the frontend app. It must live INSIDE (frontend), not at src/app/:
// there is no src/app/layout.tsx (both (frontend) and (payload) are route groups
// with their own root layouts), so a file at the root makes Next synthesise a
// DefaultLayout with its own <html>/<body> that then wraps — and double-nests —
// this group's layout. Here it inherits (frontend)/layout.tsx instead, so it
// renders no <html>/<body> of its own.
// Unknown paths reach this via the [...notfound] catch-all alongside it.
// Payload's /admin/** keeps its own not-found.
import React from 'react'
import Link from 'next/link'

export const metadata = {
  title: 'Page not found · easyMarkets',
}

const NAVY = { c0: '#020b18', c1: '#06162a', c2: '#0c2744' }
const GREEN = '#84c561'

export default function NotFound() {
  return (
    <>
      <style>{`body { margin: 0; }`}</style>
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          textAlign: 'center',
          color: '#fff',
          fontFamily:
            'Roboto, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: `radial-gradient(circle at 12% 85%, rgba(132,197,97,.22), transparent 22%),
          radial-gradient(circle at 92% 10%, rgba(125,196,255,.28), transparent 22%),
          linear-gradient(120deg, ${NAVY.c0} 0%, ${NAVY.c1} 48%, ${NAVY.c2} 100%)`,
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: -2,
              color: GREEN,
            }}
          >
            404
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '18px 0 8px' }}>
            This page doesn&apos;t exist
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: 'rgba(255,255,255,.72)',
              margin: '0 0 26px',
            }}
          >
            The link may be out of date, or the page may have moved. Your session is still active —
            head back and pick an app.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '11px 22px',
              borderRadius: 10,
              background: GREEN,
              color: NAVY.c0,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Back to apps
          </Link>
        </div>
      </div>
    </>
  )
}
